import { Router } from 'express'
import { z } from 'zod'
import { requireUser } from '../middleware/auth.js'
import { entitlementFor } from '../middleware/entitlements.js'
import * as nutrition from '../services/nutrition.js'
import { env } from '../config/env.js'
import { prisma } from '../lib/prisma.js'

export const nutritionRouter = Router()
nutritionRouter.use(requireUser)
const userId = (res: { locals: Record<string, any> }) => res.locals.user.id as string
const decimal = z.union([z.string().regex(/^\d+(\.\d{1,3})?$/), z.number().positive()])

const profileInput = z.object({
  ageYears: z.number().int().min(18).max(100), biologicalSex: z.enum(['FEMALE', 'MALE']), heightCm: decimal,
  weightKg: decimal, activityLevel: z.enum(['SEDENTARY', 'LIGHT', 'MODERATE', 'VERY_ACTIVE']), goal: z.enum(['MAINTAIN', 'FAT_LOSS', 'MUSCLE_GAIN', 'BALANCED']),
  workoutDays: z.array(z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'])).max(7).default([]), dailyMealCount: z.number().int().min(2).max(8).default(3),
  preferredCuisines: z.array(z.string().trim().min(1).max(40)).max(20).default([]), customCalorieTarget: z.number().int().min(1200).max(6000).nullable().optional(),
  customProteinTargetG: decimal.nullable().optional(), consent: z.literal(true),
})

nutritionRouter.get('/profile', async (_req, res) => res.json({ profile: await nutrition.getProfile(userId(res)), entitlement: await entitlementFor(userId(res)) }))
nutritionRouter.put('/profile', async (req, res) => res.json(await nutrition.saveProfile(userId(res), profileInput.parse(req.body))))
nutritionRouter.delete('/profile', async (_req, res) => { await nutrition.deleteProfile(userId(res)); res.status(204).end() })
nutritionRouter.get('/today', async (_req, res) => res.json(await nutrition.today(userId(res))))
nutritionRouter.get('/entitlement', async (_req, res) => res.json(await entitlementFor(userId(res))))
nutritionRouter.put('/entitlement/demo', async (req, res) => {
  if (env.NODE_ENV === 'production') return res.status(404).json({ error: 'Route not found.' })
  const { premium } = z.object({ premium: z.boolean() }).parse(req.body)
  res.json(await prisma.subscriptionEntitlement.upsert({ where: { userId: userId(res) }, update: { plan: premium ? 'PREMIUM' : 'FREE', status: 'ACTIVE' }, create: { userId: userId(res), plan: premium ? 'PREMIUM' : 'FREE' } }))
})

