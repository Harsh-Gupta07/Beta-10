import express from 'express'
import cors from 'cors'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import pg from 'pg'
import { env } from './config/env.js'
import { authRouter } from './routes/auth.js'
import { householdRouter } from './routes/households.js'
import { prisma } from './lib/prisma.js'
import { ZodError } from 'zod'

const app = express()
const PgSession = connectPgSimple(session)
const pgPool = new pg.Pool({ connectionString: env.DATABASE_URL })

app.disable('x-powered-by')
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(session({
  name: 'kitchensync.sid',
  store: new PgSession({ pool: pgPool, createTableIfMissing: true }),
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 14 },
}))

app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/api/v1/auth', authRouter)
app.use('/api/v1/households', householdRouter)

app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }))
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) return res.status(400).json({ error: 'Please check the submitted fields.', details: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) })
  if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') return res.status(409).json({ error: 'That record already exists.' })
  console.error(error)
  res.status(500).json({ error: 'Something went wrong. Please try again.' })
})

const server = app.listen(env.PORT, () => console.log(`KitchenSync API listening on http://localhost:${env.PORT}`))
async function shutdown() {
  server.close()
  await Promise.all([prisma.$disconnect(), pgPool.end()])
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
