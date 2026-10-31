import { Router } from 'express'
import { z } from 'zod'
import { rateLimit } from '../lib/rateLimit.js'
import * as mealOptions from '../services/mealOptions.js'

// Mounted under /households/:householdId, after requireUser + requireHouseholdMember.
// Read-only: every option is a suggestion. Planning, cooking, saving a swapped recipe and shopping happen
// through their own endpoints, only after the person confirms.
export const mealOptionsRouter = Router({ mergeParams: true })

const ctx = (res: { locals: Record<string, unknown> }) => ({ householdId: res.locals.householdId as string, userId: (res.locals.user as { id: string }).id })
const slot = z.enum(['BREAKFAST', 'LUNCH', 'DINNER'])
const servings = z.coerce.number().int().min(1).max(50)
const scope = z.enum(['household', 'me']).default('household')

mealOptionsRouter.get('/meal-options', async (req, res) => {
  const query = z.object({
    slot: slot.optional(), scope, servings: servings.optional(),
    status: z.enum(['FULLY_AVAILABLE', 'NEEDS_SUBSTITUTION', 'NEEDS_PURCHASE']).optional(),
    // "Regenerate" sends the recipes already on screen.
    exclude: z.string().max(2000).optional().transform(value => value ? value.split(',').map(id => id.trim()).filter(Boolean).slice(0, 100) : []),
    limit: z.coerce.number().int().min(1).max(30).default(6),
  }).parse(req.query)
  const { householdId, userId } = ctx(res)
  res.json(await mealOptions.getMealOptions(householdId, userId, { ...query, slot: query.slot ?? null }))
})

/** A recipe copy with the chosen swaps, to review in the recipe form. Nothing is saved. */
mealOptionsRouter.post('/meal-options/swap', async (req, res) => {
  const input = z.object({
    recipeId: z.string().min(1).max(40), servings,
    swaps: z.array(z.object({ originalId: z.string().min(1).max(40), substituteId: z.string().min(1).max(40) })).min(1).max(20),
  }).parse(req.body)
  res.json(await mealOptions.substitutedDraft(ctx(res).householdId, input.recipeId, input.servings, input.swaps))
})

// Each request is one paid Gemini call. Demo kitchens share one small budget per network, like the assistant.
const ideasLimit = rateLimit({ windowMs: 10 * 60_000, max: 5, key: (req, res) => {
  const user = res.locals.user as { id: string; isDemo?: boolean }
  return user.isDemo ? `ideas-demo|${req.ip}` : `ideas|${user.id}`
}, message: 'You’ve asked for a lot of AI ideas. Please wait a few minutes; your recipe options still work.' })

mealOptionsRouter.post('/meal-options/ai', ideasLimit, async (req, res) => {
  const input = z.object({ slot: slot.optional(), scope, servings: servings.optional() }).parse(req.body ?? {})
  const { householdId, userId } = ctx(res)
  res.json(await mealOptions.aiMealIdeas(householdId, userId, { ...input, slot: input.slot ?? null }))
})
