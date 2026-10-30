import { Router } from 'express'
import { z } from 'zod'
import { INPUT_UNITS } from '../services/units.js'
import * as shopping from '../services/shopping.js'

// Mounted under /households/:householdId, after requireUser + requireHouseholdMember.
export const shoppingRouter = Router({ mergeParams: true })

const ctx = (res: { locals: Record<string, unknown> }) => ({ householdId: res.locals.householdId as string, userId: (res.locals.user as { id: string }).id })
const itemId = (params: Record<string, string | string[] | undefined>) => String(params.itemId)
const quantity = z.union([z.number().nonnegative(), z.string().trim().regex(/^\d+(\.\d+)?$/, 'Quantity must be a number.')])

shoppingRouter.get('/shopping', async (_req, res) => {
  res.json(await shopping.getShoppingList(ctx(res).householdId))
})

shoppingRouter.post('/shopping/items', async (req, res) => {
  const input = z.object({
    ingredientId: z.string().min(1).optional(), name: z.string().trim().max(80).optional(), quantity,
    unit: z.string().trim().max(20).optional(), note: z.string().trim().max(200).optional(), source: z.enum(['MANUAL', 'SHORTAGE', 'ASSISTANT']).optional(),
  }).parse(req.body)
  res.status(201).json(await shopping.addItem(ctx(res).householdId, input))
})

shoppingRouter.post('/shopping/add-shortages', async (req, res) => {
  const { ingredientIds } = z.object({ ingredientIds: z.array(z.string().min(1)).max(100).optional() }).parse(req.body ?? {})
  res.json(await shopping.addSuggestions(ctx(res).householdId, ingredientIds))
})

shoppingRouter.patch('/shopping/items/:itemId', async (req, res) => {
  const input = z.object({ quantity: quantity.optional(), unit: z.string().trim().max(20).optional(), note: z.string().trim().max(200).optional(), status: z.enum(['NEEDED', 'PURCHASED']).optional() }).parse(req.body)
  res.json(await shopping.updateItem(ctx(res).householdId, itemId(req.params), input))
})

shoppingRouter.delete('/shopping/items/:itemId', async (req, res) => {
  await shopping.deleteItem(ctx(res).householdId, itemId(req.params))
  res.status(204).end()
})

shoppingRouter.post('/shopping/items/:itemId/receive', async (req, res) => {
  const input = z.object({ quantity, unit: z.enum(INPUT_UNITS).optional(), keepRemainder: z.boolean().optional() }).parse(req.body)
  const { householdId, userId } = ctx(res)
  res.json(await shopping.receiveItem(householdId, userId, itemId(req.params), input))
})

shoppingRouter.post('/shopping/clear-received', async (_req, res) => {
  res.json(await shopping.clearReceived(ctx(res).householdId))
})
