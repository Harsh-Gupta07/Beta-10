import { Router } from 'express'
import { z } from 'zod'
import { requireUser } from '../middleware/auth.js'
import { requirePremium } from '../middleware/entitlements.js'
import { recommendations } from '../services/nutritionRecommendations.js'
import { prisma } from '../lib/prisma.js'

export const nutritionRecommendationsRouter = Router()
nutritionRecommendationsRouter.use(requireUser, requirePremium)
nutritionRecommendationsRouter.get('/', async (req, res) => {
  const q = z.object({ highProtein: z.coerce.boolean().optional(), ready: z.coerce.boolean().optional(), quick: z.coerce.boolean().optional(), maxCalories: z.coerce.number().positive().max(3000).optional() }).parse(req.query)
  const userId = (res.locals.user as { id: string }).id
  const member = await prisma.householdMember.findFirstOrThrow({ where: { userId }, select: { householdId: true } })
  res.json(await recommendations(member.householdId, userId, q))
})

