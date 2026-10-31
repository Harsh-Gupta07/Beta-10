import { Router } from 'express'
import { z } from 'zod'
import { INPUT_UNITS } from '../services/units.js'
import * as shopping from '../services/shopping.js'
import { prisma } from '../lib/prisma.js'
import { announce } from './activity.js'

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
  const item = await shopping.addItem(ctx(res).householdId, input)
  await announce(res, `added ${item.name} to the shopping list`, { link: '/shopping' })
  res.status(201).json(item)
})

shoppingRouter.post('/shopping/add-shortages', async (req, res) => {
  const { ingredientIds } = z.object({ ingredientIds: z.array(z.string().min(1)).max(100).optional() }).parse(req.body ?? {})
  const result = await shopping.addSuggestions(ctx(res).householdId, ingredientIds)
  if (result.added) await announce(res, `added ${result.added} shortage${result.added === 1 ? '' : 's'} to the shopping list`, { link: '/shopping' })
  res.json(result)
})

shoppingRouter.patch('/shopping/items/:itemId', async (req, res) => {
  const input = z.object({ quantity: quantity.optional(), unit: z.string().trim().max(20).optional(), note: z.string().trim().max(200).optional(), status: z.enum(['NEEDED', 'PURCHASED']).optional() }).parse(req.body)
  const item = await shopping.updateItem(ctx(res).householdId, itemId(req.params), input)
  await announce(res, input.status === 'PURCHASED' ? `bought ${item.name}` : input.status === 'NEEDED' ? `put ${item.name} back on the shopping list` : `updated ${item.name} on the shopping list`,
    { body: input.status === 'PURCHASED' ? 'It goes into the pantry once someone confirms it was received.' : undefined, link: '/shopping' })
  res.json(item)
})

shoppingRouter.delete('/shopping/items/:itemId', async (req, res) => {
  const item = await prisma.shoppingListItem.findFirst({ where: { id: itemId(req.params), shoppingList: { householdId: ctx(res).householdId } }, select: { name: true } })
  await shopping.deleteItem(ctx(res).householdId, itemId(req.params))
  if (item) await announce(res, `removed ${item.name} from the shopping list`, { link: '/shopping' })
  res.status(204).end()
})

shoppingRouter.post('/shopping/items/:itemId/receive', async (req, res) => {
  const input = z.object({ quantity, unit: z.enum(INPUT_UNITS).optional(), keepRemainder: z.boolean().optional() }).parse(req.body)
  const { householdId, userId } = ctx(res)
  const result = await shopping.receiveItem(householdId, userId, itemId(req.params), input)
  if (!result.alreadyReceived) await announce(res, `received ${result.item.name}`, { body: result.item.status === 'RECEIVED' ? 'It was added to the pantry.' : 'Part of it arrived and was added to the pantry; the rest is still on the list.', link: '/pantry' })
  res.json(result)
})

shoppingRouter.post('/shopping/clear-received', async (_req, res) => {
  const result = await shopping.clearReceived(ctx(res).householdId)
  if (result.removed) await announce(res, `cleared ${result.removed} received item${result.removed === 1 ? '' : 's'} from the shopping list`, { link: '/shopping' })
  res.json(result)
})
