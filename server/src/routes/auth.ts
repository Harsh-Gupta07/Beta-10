import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireUser } from '../middleware/auth.js'

export const authRouter = Router()
const credentials = z.object({ email: z.string().trim().email().max(254).transform(value => value.toLowerCase()), password: z.string().min(10).max(128) })

function regenerate(req: Express.Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()))
}
function save(req: Express.Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()))
}

authRouter.post('/register', async (req, res, next) => {
  try {
    const input = credentials.extend({ name: z.string().trim().min(1).max(80) }).parse(req.body)
    const passwordHash = await bcrypt.hash(input.password, 12)
    const user = await prisma.user.create({ data: { name: input.name, email: input.email, passwordHash }, select: { id: true, name: true, email: true } })
    await regenerate(req); req.session.userId = user.id; await save(req)
    res.status(201).json({ user, household: null })
  } catch (error) { next(error) }
})

authRouter.post('/login', async (req, res, next) => {
  try {
    const input = credentials.parse(req.body)
    const user = await prisma.user.findUnique({ where: { email: input.email } })
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) return res.status(401).json({ error: 'Email or password is incorrect.' })
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

authRouter.post('/logout', (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error)
    res.clearCookie('kitchensync.sid', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
    res.status(204).end()
  })
})
