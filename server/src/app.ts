import path from 'node:path'
import { existsSync } from 'node:fs'
import express from 'express'
import cors from 'cors'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import pg from 'pg'
import { ZodError } from 'zod'
import { env } from './config/env.js'
import { AppError } from './lib/errors.js'
import { prisma } from './lib/prisma.js'
import { authRouter } from './routes/auth.js'
import { householdRouter } from './routes/households.js'
import { meRouter } from './routes/me.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Pages are only ever framed by nobody and only load our own scripts; fonts come from Google Fonts.
// accounts.google.com/gsi/ is Google's sign-in button (script, frame and styles), nothing else from Google.
const GOOGLE_SIGN_IN = 'https://accounts.google.com/gsi/'
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'", `script-src 'self' ${GOOGLE_SIGN_IN}client`, `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com ${GOOGLE_SIGN_IN}style`,
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://upload.wikimedia.org",
  `connect-src 'self' https://commons.wikimedia.org ${GOOGLE_SIGN_IN}`, `frame-src ${GOOGLE_SIGN_IN}`,
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join('; ')

export function createApp() {
  const app = express()
  const PgSession = connectPgSimple(session)
  const pgPool = new pg.Pool({ connectionString: env.DATABASE_URL })
  const allowedOrigin = new URL(env.CLIENT_ORIGIN).host

  app.disable('x-powered-by')
  // Behind an HTTPS proxy this lets Express see the real protocol, so `secure` cookies are issued.
  app.set('trust proxy', env.TRUST_PROXY)

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    if (!req.path.startsWith('/api/')) res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY)
    next()
  })

  if (env.LOG_REQUESTS) {
    app.use((req, res, next) => {
      const start = process.hrtime.bigint()
      res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6
        // originalUrl keeps the router mount prefix; the query string is dropped so it never lands in logs.
        console.log(JSON.stringify({ time: new Date().toISOString(), method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, ms: Math.round(ms), ip: req.ip, user: req.session?.userId ?? null }))
      })
      next()
    })
  }

  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }))

  // CSRF defence in depth (the session cookie is also SameSite=Lax): browsers send Origin on
  // cross-site writes, so reject writes whose Origin is neither this host nor the configured client.
  app.use('/api', (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next()
    const origin = req.get('origin')
    if (!origin) return next() // non-browser clients (CLI, tests) don't send Origin and carry no ambient cookie risk
    let host: string
    try { host = new URL(origin).host } catch { return res.status(403).json({ error: 'Request origin not allowed.' }) }
    if (host === allowedOrigin || host === req.get('x-forwarded-host') || host === req.get('host')) return next()
    res.status(403).json({ error: 'Request origin not allowed.' })
  })

  app.use(express.json({ limit: '1mb' }))
  app.use(session({
    name: 'kitchensync.sid',
    // The session table is created by Prisma migrations, not at runtime.
    store: new PgSession({ pool: pgPool, createTableIfMissing: false }),
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: env.COOKIE_SECURE, maxAge: 1000 * 60 * 60 * 24 * 14 },
  }))

  // Liveness: the process is up. Readiness: it can also reach the database.
  app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok' }))
  app.get('/api/v1/health/ready', async (_req, res) => {
    try { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ready', database: 'ok' }) }
    catch { res.status(503).json({ status: 'unavailable', database: 'unreachable' }) }
  })
  app.use('/api/v1/auth', authRouter)
  app.use('/api/v1/households', householdRouter)
  app.use('/api/v1/me', meRouter)

  if (env.SERVE_CLIENT) {
    const dist = path.resolve(process.cwd(), env.CLIENT_DIST_DIR)
    const index = path.join(dist, 'index.html')
    if (!existsSync(index)) throw new Error(`SERVE_CLIENT is on but ${index} does not exist. Run "npm run build" first.`)
    // Hashed asset files never change, so they can be cached for a year; index.html must not be.
    app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', index: false }))
    app.use(express.static(dist, { index: false, maxAge: '1h' }))
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(index)
    })
  }

  app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }))
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof AppError) return res.status(error.status).json({ error: error.message, ...(error.code ? { code: error.code } : {}) })
    if (error instanceof ZodError) return res.status(400).json({ error: 'Please check the submitted fields.', details: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) })
    if (typeof error === 'object' && error && 'type' in error && error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON.' })
    if (typeof error === 'object' && error && 'type' in error && error.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' })
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') return res.status(409).json({ error: 'That record already exists.' })
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2025') return res.status(404).json({ error: 'That record no longer exists.' })
    // Other client errors raised by Express/body-parser (bad encoding, unsupported charset, ...).
    if (typeof error === 'object' && error && 'status' in error && typeof error.status === 'number' && error.status >= 400 && error.status < 500 && 'expose' in error && error.expose) {
      return res.status(error.status).json({ error: 'The request could not be processed.' })
    }
    console.error(error)
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  })

  return { app, pgPool }
}
