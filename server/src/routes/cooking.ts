import { Router } from 'express'
import { z } from 'zod'
import { INPUT_UNITS } from '../services/units.js'
import * as cooking from '../services/cooking.js'

// Mounted under /households/:householdId, after requireUser + requireHouseholdMember.
export const cookingRouter = Router({ mergeParams: true })

const ctx = (res: { locals: Record<string, unknown> }) => ({ householdId: res.locals.householdId as string, userId: (res.locals.user as { id: string }).id })
const mealId = (params: Record<string, string | string[] | undefined>) => String(params.mealId)

cookingRouter.get('/meals/:mealId/cooking', async (req, res) => {
  res.json(await cooking.getCookingView(ctx(res).householdId, mealId(req.params)))
})

cookingRouter.post('/meals/:mealId/start', async (req, res) => {
  res.json(await cooking.startCooking(ctx(res).householdId, mealId(req.params)))
})

cookingRouter.post('/meals/:mealId/stop', async (req, res) => {
  res.json(await cooking.stopCooking(ctx(res).householdId, mealId(req.params)))
})

cookingRouter.post('/meals/:mealId/complete', async (req, res) => {
  const input = z.object({
    idempotencyKey: z.string().uuid(),
    note: z.string().trim().max(200).optional(),
    usage: z.array(z.object({
      ingredientId: z.string().min(1),
      quantity: z.union([z.number().nonnegative(), z.string().trim().regex(/^\d+(\.\d+)?$/, 'Quantity must be a number.')]),
      unit: z.enum(INPUT_UNITS).optional(),
    })).max(60),
  }).parse(req.body)
  const { householdId, userId } = ctx(res)
  const result = await cooking.completeMeal(householdId, userId, mealId(req.params), input)
  res.status(result.alreadyCompleted ? 200 : 201).json(result)
})
