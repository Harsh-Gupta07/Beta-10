import { Router } from 'express'
import { z } from 'zod'
import { isDateString } from '../services/dates.js'
import * as planner from '../services/planner.js'

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
  res.status(201).json(await planner.createMeal(householdId(res), input))
})

plannerRouter.patch('/meals/:mealId', async (req, res) => {
  const input = z.object({ recipeId: z.string().min(1).optional(), servings: servings.optional(), date: date.optional(), slot: slot.optional() })
    .refine(value => Object.values(value).some(v => v !== undefined), 'Nothing to change.').parse(req.body)
  res.json(await planner.updateMeal(householdId(res), mealId(req.params), input))
})

plannerRouter.post('/meals/:mealId/cancel', async (req, res) => {
  res.json(await planner.cancelMeal(householdId(res), mealId(req.params)))
})
