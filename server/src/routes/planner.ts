import { Router } from 'express'
import { z } from 'zod'
import { isDateString } from '../services/dates.js'
import * as planner from '../services/planner.js'
import { announce, describeMeal } from './activity.js'

// Mounted under /households/:householdId, after requireUser + requireHouseholdMember.
export const plannerRouter = Router({ mergeParams: true })

const householdId = (res: { locals: Record<string, unknown> }) => res.locals.householdId as string
const mealId = (params: Record<string, string | string[] | undefined>) => String(params.mealId)
const date = z.string().refine(isDateString, 'Use a date like 2026-11-02.')
const slot = z.enum(['BREAKFAST', 'LUNCH', 'DINNER'])
const servings = z.coerce.number().int().min(1).max(50)

plannerRouter.get('/planner', async (req, res) => {
  const { week } = z.object({ week: date.optional() }).parse(req.query)
  res.json(await planner.getWeek(householdId(res), week))
})

plannerRouter.get('/shortages', async (_req, res) => {
  res.json(await planner.getShortages(householdId(res)))
})

plannerRouter.post('/meals', async (req, res) => {
  const input = z.object({ date, slot, recipeId: z.string().min(1), servings: servings.optional() }).parse(req.body)
  const meal = await planner.createMeal(householdId(res), input)
  const about = meal && await describeMeal(householdId(res), meal.id)
  if (about) await announce(res, `planned ${about.text}`, { body: 'Its ingredients are now reserved.', link: about.link })
  res.status(201).json(meal)
})

plannerRouter.patch('/meals/:mealId', async (req, res) => {
  const input = z.object({ recipeId: z.string().min(1).optional(), servings: servings.optional(), date: date.optional(), slot: slot.optional() })
    .refine(value => Object.values(value).some(v => v !== undefined), 'Nothing to change.').parse(req.body)
  const before = await describeMeal(householdId(res), mealId(req.params))
  const meal = await planner.updateMeal(householdId(res), mealId(req.params), input)
  const after = await describeMeal(householdId(res), mealId(req.params))
  if (before && after) {
    const changes = [
      input.recipeId && before.name !== after.name && `swapped ${before.name} for ${after.name}`,
      (input.date || input.slot) && before.when !== after.when && `moved to ${after.when}`,
      input.servings && `now ${input.servings} servings`,
    ].filter(Boolean)
    await announce(res, `changed ${before.text}`, { body: changes.length ? `${changes.join('; ')}.` : undefined, link: after.link })
  }
  res.json(meal)
})

plannerRouter.post('/meals/:mealId/cancel', async (req, res) => {
  const about = await describeMeal(householdId(res), mealId(req.params))
  const result = await planner.cancelMeal(householdId(res), mealId(req.params))
  if (about) await announce(res, `cancelled ${about.text}`, { body: 'Its reserved ingredients are free again.', link: about.link })
  res.json(result)
})
