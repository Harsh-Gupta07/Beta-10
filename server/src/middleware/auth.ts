import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please sign in to continue.' })
  const user = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { id: true, name: true, email: true } })
  if (!user) return req.session.destroy(() => res.status(401).json({ error: 'Session expired. Please sign in again.' }))
  res.locals.user = user
  next()
}

export async function requireHouseholdMember(req: Request, res: Response, next: NextFunction) {
  const rawHouseholdId = req.params.householdId ?? req.params.id
  const householdId = Array.isArray(rawHouseholdId) ? rawHouseholdId[0] : rawHouseholdId
  if (!householdId || !req.session.userId) return res.status(400).json({ error: 'A household is required.' })
  const membership = await prisma.householdMember.findUnique({ where: { householdId_userId: { householdId, userId: req.session.userId } } })
  if (!membership) return res.status(404).json({ error: 'Household not found.' })
  res.locals.householdId = householdId
  res.locals.role = membership.role
  next()
}
