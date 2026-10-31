import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireUser } from '../middleware/auth.js'
import { env } from '../config/env.js'
import { rateLimit } from '../lib/rateLimit.js'
import { createDemoKitchen } from '../services/demo.js'
import { accountForGoogle, verifyGoogleCredential } from '../services/googleAuth.js'

export const authRouter = Router()
const credentials = z.object({ email: z.string().trim().email().max(254).transform(value => value.toLowerCase()), password: z.string().min(10).max(128) })

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', 12)

const emailOf = (body: unknown) => typeof body === 'object' && body && 'email' in body ? String(body.email).trim().toLowerCase().slice(0, 254) : ''
const loginLimit = rateLimit({ windowMs: 15 * 60_000, max: env.RATE_LIMIT_LOGIN, key: req => `${req.ip}|${emailOf(req.body)}`, message: 'Too many sign-in attempts. Please wait 15 minutes and try again.' })
const registerLimit = rateLimit({ windowMs: 60 * 60_000, max: env.RATE_LIMIT_REGISTER, key: req => req.ip ?? 'unknown', message: 'Too many accounts created from this network. Please try again later.' })

function regenerate(req: Express.Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()))
}
function save(req: Express.Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()))
}

/** Which sign-in options this server has switched on, so the login page only shows working buttons. */
authRouter.get('/providers', (_req, res) => {
  res.json({ google: env.GOOGLE_CLIENT_ID ? { clientId: env.GOOGLE_CLIENT_ID } : null, apple: null })
})

const demoLimit = rateLimit({ windowMs: 60 * 60_000, max: env.RATE_LIMIT_REGISTER, key: req => `demo|${req.ip}`, message: 'Too many demo kitchens from this network. Please try again later.' })

/** "See a demo kitchen": signs the visitor into a fresh private household that is deleted after a day. */
authRouter.post('/demo', demoLimit, async (req, res, next) => {
  try {
    const userId = await createDemoKitchen()
    await regenerate(req); req.session.userId = userId; await save(req)
    res.status(201).json({ demo: true })
  } catch (error) { next(error) }
})

const googleLimit = rateLimit({ windowMs: 15 * 60_000, max: env.RATE_LIMIT_REGISTER, key: req => `google|${req.ip}`, message: 'Too many sign-in attempts. Please wait a few minutes and try again.' })

/** "Continue with Google": verifies Google's ID token, then signs in, links or creates the account. */
authRouter.post('/google', googleLimit, async (req, res, next) => {
  try {
    const { credential } = z.object({ credential: z.string().min(20).max(4096) }).parse(req.body)
    const { userId, isNew } = await accountForGoogle(await verifyGoogleCredential(credential))
    await regenerate(req); req.session.userId = userId; await save(req)
    const membership = await prisma.householdMember.findFirst({ where: { userId }, include: { household: true }, orderBy: { joinedAt: 'asc' } })
    res.status(isNew ? 201 : 200).json({ isNew, household: membership?.household ?? null })
  } catch (error) { next(error) }
})

authRouter.post('/register', registerLimit, async (req, res, next) => {
  try {
    const input = credentials.extend({ name: z.string().trim().min(1).max(80) }).parse(req.body)
    const passwordHash = await bcrypt.hash(input.password, 12)
    const user = await prisma.user.create({ data: { name: input.name, email: input.email, passwordHash }, select: { id: true, name: true, email: true } })
    await regenerate(req); req.session.userId = user.id; await save(req)
    res.status(201).json({ user, household: null })
  } catch (error) { next(error) }
})

authRouter.post('/login', loginLimit, async (req, res, next) => {
  try {
    const input = credentials.parse(req.body)
    const user = await prisma.user.findUnique({ where: { email: input.email } })
    const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH)
    if (!user || !valid) return res.status(401).json({ error: 'Email or password is incorrect.' })
    await regenerate(req); req.session.userId = user.id; await save(req)
    const membership = await prisma.householdMember.findFirst({ where: { userId: user.id }, include: { household: true }, orderBy: { joinedAt: 'asc' } })
    res.json({ user: { id: user.id, name: user.name, email: user.email }, household: membership?.household ?? null })
  } catch (error) { next(error) }
})

authRouter.get('/me', requireUser, async (_req, res, next) => {
  try {
    const user = res.locals.user as { id: string; name: string; email: string }
    const membership = await prisma.householdMember.findFirst({ where: { userId: user.id }, include: { household: true }, orderBy: { joinedAt: 'asc' } })
    res.json({ user, household: membership?.household ?? null })
  } catch (error) { next(error) }
})

authRouter.patch('/me', requireUser, async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body)
    const user = res.locals.user as { id: string }
    res.json(await prisma.user.update({ where: { id: user.id }, data: input, select: { id: true, name: true, email: true } }))
  } catch (error) { next(error) }
})

authRouter.post('/password', requireUser, async (req, res, next) => {
  try {
    const input = z.object({ currentPassword: z.string().max(128).optional(), newPassword: z.string().min(10).max(128) }).parse(req.body)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: (res.locals.user as { id: string }).id } })
    if (user.demoExpiresAt) return res.status(403).json({ error: 'Demo kitchens can’t have a password. Create your own account to keep your data.' })
    // Accounts made with Google have no password yet, so there is nothing to confirm the first time.
    if (user.hasPassword && !(await bcrypt.compare(input.currentPassword ?? '', user.passwordHash))) return res.status(400).json({ error: 'Your current password is incorrect.' })
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(input.newPassword, 12), hasPassword: true } })
    res.status(204).end()
  } catch (error) { next(error) }
})

authRouter.post('/logout', (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error)
    res.clearCookie('kitchensync.sid', { httpOnly: true, sameSite: 'lax', secure: env.COOKIE_SECURE })
    res.status(204).end()
  })
})
