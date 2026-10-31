import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'

export async function requirePremium(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId
  if (!userId) return res.status(401).json({ error: 'Please sign in to continue.' })
  const entitlement = await prisma.subscriptionEntitlement.findUnique({ where: { userId } })
  const active = entitlement?.plan === 'PREMIUM' && entitlement.status === 'ACTIVE' && (!entitlement.expiresAt || entitlement.expiresAt > new Date())
  if (!active) return res.status(403).json({ error: 'KitchenSync Fit Premium is required for this feature.', code: 'PREMIUM_REQUIRED' })
  res.locals.entitlement = entitlement
  next()
}

export async function entitlementFor(userId: string) {
  const value = await prisma.subscriptionEntitlement.findUnique({ where: { userId } })
  return value ?? { userId, plan: 'FREE' as const, status: 'ACTIVE' as const, expiresAt: null }
}

