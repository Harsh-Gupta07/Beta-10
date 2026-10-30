import { Router } from 'express'
import { z } from 'zod'
import { CANONICAL_UNITS, INPUT_UNITS } from '../services/units.js'
import * as pantry from '../services/pantry.js'

// Mounted under /households/:householdId, after requireUser + requireHouseholdMember.
export const pantryRouter = Router({ mergeParams: true })

const quantity = z.union([z.number().nonnegative(), z.string().trim().regex(/^\d+(\.\d+)?$/, 'Quantity must be a number.')])
const unit = z.enum(INPUT_UNITS)
const date = z.iso.date().transform(value => new Date(`${value}T00:00:00.000Z`))
const confidence = z.enum(['CONFIRMED', 'ESTIMATED', 'CHECK_NEEDED'])
const note = z.string().trim().max(200).optional()

const ctx = (res: { locals: Record<string, unknown> }) => ({ householdId: res.locals.householdId as string, userId: (res.locals.user as { id: string }).id })
const itemId = (params: Record<string, string | string[] | undefined>) => String(params.itemId)

pantryRouter.get('/ingredients', async (_req, res) => {
  res.json(await pantry.listIngredients(ctx(res).householdId))
})

pantryRouter.post('/ingredients', async (req, res) => {
  const input = z.object({ name: z.string().trim().min(2).max(60), category: z.string().trim().max(40).default('Other'), canonicalUnit: z.enum(CANONICAL_UNITS) }).parse(req.body)
  res.status(201).json(await pantry.createIngredient(ctx(res).householdId, input))
})

pantryRouter.get('/pantry', async (_req, res) => {
  res.json(await pantry.listPantry(ctx(res).householdId))
})

pantryRouter.post('/pantry', async (req, res) => {
  const input = z.object({
    ingredientId: z.string().min(1), quantity, unit: unit.optional(),
    lowStockThreshold: quantity.nullable().optional(), confidence: confidence.optional(),
    source: z.enum(['MANUAL', 'PURCHASE']).optional(), purchasedAt: date.nullable().optional(), expiresAt: date.nullable().optional(),
  }).parse(req.body)
  const { householdId, userId } = ctx(res)
  res.status(201).json(await pantry.addPantryItem(householdId, userId, input))
})

// Adds stock that has physically arrived. A client-supplied idempotency key makes repeated clicks safe.
pantryRouter.post('/pantry/receive', async (req, res) => {
  const input = z.object({ ingredientId: z.string().min(1), quantity, unit: unit.optional(), note, idempotencyKey: z.string().uuid().optional() }).parse(req.body)
  const { householdId, userId } = ctx(res)
  res.status(201).json(await pantry.receiveStock(householdId, userId, input))
})

pantryRouter.patch('/pantry/:itemId', async (req, res) => {
  const input = z.object({
    quantity: quantity.optional(), unit: unit.optional(), lowStockThreshold: quantity.nullable().optional(),
    confidence: confidence.optional(), purchasedAt: date.nullable().optional(), expiresAt: date.nullable().optional(), note,
  }).parse(req.body)
  const { householdId, userId } = ctx(res)
  res.json(await pantry.updatePantryItem(householdId, userId, itemId(req.params), input))
})

pantryRouter.post('/pantry/:itemId/use', async (req, res) => {
  const input = z.object({ quantity, unit: unit.optional(), note }).parse(req.body)
  const { householdId, userId } = ctx(res)
  res.json(await pantry.recordUsage(householdId, userId, itemId(req.params), input))
})

pantryRouter.post('/pantry/:itemId/verify', async (req, res) => {
  const input = z.discriminatedUnion('action', [
    z.object({ action: z.literal('confirm'), note }),
    z.object({ action: z.literal('finished'), note }),
    z.object({ action: z.literal('update'), quantity, unit: unit.optional(), note }),
  ]).parse(req.body)
  const { householdId, userId } = ctx(res)
  res.json(await pantry.verifyPantryItem(householdId, userId, itemId(req.params), input))
})

pantryRouter.delete('/pantry/:itemId', async (req, res) => {
  const { householdId, userId } = ctx(res)
  await pantry.deletePantryItem(householdId, userId, itemId(req.params))
  res.status(204).end()
})

pantryRouter.get('/pantry/:itemId/transactions', async (req, res) => {
  res.json(await pantry.listItemTransactions(ctx(res).householdId, itemId(req.params)))
})
