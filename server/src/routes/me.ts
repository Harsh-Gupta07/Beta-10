import { Router } from 'express'
import { z } from 'zod'
import { requireUser } from '../middleware/auth.js'
import { AGE_GROUPS, ALLERGENS, DIET_TYPES, HEALTH_GOALS, WEEKDAYS } from '../services/foodSafety.js'
import * as preferences from '../services/foodPreferences.js'
import { prisma } from '../lib/prisma.js'
import { announce } from './activity.js'

// Things that belong to the signed-in person rather than to their household.
export const meRouter = Router()
meRouter.use(requireUser)

const userId = (res: { locals: Record<string, unknown> }) => (res.locals.user as { id: string }).id
const ids = z.array(z.string().min(1).max(40)).max(100).default([])

const preferencesInput = z.object({
  dietType: z.enum(DIET_TYPES).nullable().default(null),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).default([]),
  maxSpice: z.coerce.number().int().min(1).max(5).nullable().default(null),
  cuisines: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  avoidIngredientIds: ids,
  likedIngredientIds: ids,
  favouriteRecipeIds: ids,
  dislikedRecipeIds: ids,
  ageGroup: z.enum(AGE_GROUPS).nullable().optional(),
  healthGoals: z.array(z.enum(HEALTH_GOALS)).max(HEALTH_GOALS.length).optional(),
  weeklyFasts: z.array(z.enum(WEEKDAYS)).max(7).optional(),
})

meRouter.get('/food-preferences', async (_req, res) => {
  res.json(await preferences.getMyPreferences(userId(res)))
})

meRouter.put('/food-preferences', async (req, res) => {
  const result = await preferences.updateMyPreferences(userId(res), preferencesInput.parse(req.body))
  // Diet and allergies change what is safe for the whole household, so everyone hears about it.
  const membership = await prisma.householdMember.findFirst({ where: { userId: userId(res) }, select: { householdId: true } })
  if (membership) await announce(res, 'updated their diet, allergies and food likes', { body: 'Recipe safety labels and suggestions now use the new details.', link: '/preferences' }, membership.householdId)
  res.json(result)
})

// One dish at a time, for "Love it" and "Don't suggest for me". kind null clears it.
meRouter.put('/recipe-prefs/:recipeId', async (req, res) => {
  const { kind } = z.object({ kind: z.enum(['FAVOURITE', 'DISLIKE']).nullable() }).parse(req.body)
  res.json(await preferences.setRecipePref(userId(res), String(req.params.recipeId), kind))
})
