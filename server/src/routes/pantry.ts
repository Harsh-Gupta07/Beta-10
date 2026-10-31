import { Router } from 'express'
import { z } from 'zod'
import { CANONICAL_UNITS, INPUT_UNITS } from '../services/units.js'
import * as pantry from '../services/pantry.js'
import * as staples from '../services/staples.js'
import { ALLERGENS } from '../services/foodSafety.js'
import { describeQuantity } from '../services/units.js'
import { prisma } from '../lib/prisma.js'
import { amount, announce } from './activity.js'

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

const foodTags = {
  dietClass: z.enum(['PLANT', 'DAIRY', 'EGG', 'MEAT', 'SEAFOOD']).nullable().optional(),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).optional(),
  allergensReviewed: z.boolean().optional(),
}

pantryRouter.post('/ingredients', async (req, res) => {
  const input = z.object({ name: z.string().trim().min(2).max(60), category: z.string().trim().max(40).default('Other'), canonicalUnit: z.enum(CANONICAL_UNITS), ...foodTags }).parse(req.body)
  const ingredient = await pantry.createIngredient(ctx(res).householdId, input)
  await announce(res, `added a custom ingredient: ${ingredient.name}`, { link: '/pantry' })
  res.status(201).json(ingredient)
})

// Only the household's own ingredients can be tagged; the built-in catalog is maintained in the seed.
pantryRouter.patch('/ingredients/:ingredientId', async (req, res) => {
  const input = z.object(foodTags).parse(req.body)
  const ingredient = await pantry.tagIngredient(ctx(res).householdId, String(req.params.ingredientId), input)
  await announce(res, `updated the diet and allergy tags for ${ingredient.name}`, { link: '/pantry' })
  res.json(ingredient)
})

pantryRouter.get('/pantry', async (_req, res) => {
  res.json(await pantry.listPantry(ctx(res).householdId))
})

pantryRouter.get('/pantry/staples', async (_req, res) => {
  res.json(await staples.getStaples(ctx(res).householdId))
})

pantryRouter.post('/pantry/staples', async (req, res) => {
  const { items } = z.object({
    items: z.array(z.object({ ingredientId: z.string().min(1).max(40), quantity, unit })).min(1, 'Tick at least one staple.').max(100),
  }).parse(req.body)
  const { householdId, userId } = ctx(res)
  const result = await staples.addStaples(householdId, userId, items)
  if (result.added) await announce(res, `added ${result.added} staple${result.added === 1 ? '' : 's'} to the pantry`, { link: '/pantry' })
  res.status(201).json(result)
})

pantryRouter.post('/pantry', async (req, res) => {
  const input = z.object({
    ingredientId: z.string().min(1), quantity, unit: unit.optional(),
    lowStockThreshold: quantity.nullable().optional(), confidence: confidence.optional(),
    source: z.enum(['MANUAL', 'PURCHASE']).optional(), purchasedAt: date.nullable().optional(), expiresAt: date.nullable().optional(),
  }).parse(req.body)
  const { householdId, userId } = ctx(res)
  const item = await pantry.addPantryItem(householdId, userId, input)
  await announce(res, `added ${item.ingredient.name} to the pantry`, { body: `${describeQuantity(item.quantity, item.unit)} in stock.`, link: '/pantry' })
  res.status(201).json(item)
})

// Adds stock that has physically arrived. A client-supplied idempotency key makes repeated clicks safe.
pantryRouter.post('/pantry/receive', async (req, res) => {
  const input = z.object({ ingredientId: z.string().min(1), quantity, unit: unit.optional(), note, idempotencyKey: z.string().uuid().optional() }).parse(req.body)
  const { householdId, userId } = ctx(res)
  const item = await pantry.receiveStock(householdId, userId, input)
  await announce(res, `added ${amount(input.quantity, input.unit, item.unit)} of ${item.ingredient.name} to the pantry`, { body: `Now ${describeQuantity(item.quantity, item.unit)} in stock.`, link: '/pantry' })
  res.status(201).json(item)
})

pantryRouter.patch('/pantry/:itemId', async (req, res) => {
  const input = z.object({
    quantity: quantity.optional(), unit: unit.optional(), lowStockThreshold: quantity.nullable().optional(),
    confidence: confidence.optional(), purchasedAt: date.nullable().optional(), expiresAt: date.nullable().optional(), note,
  }).parse(req.body)
  const { householdId, userId } = ctx(res)
  const item = await pantry.updatePantryItem(householdId, userId, itemId(req.params), input)
  await announce(res, `updated ${item.ingredient.name} in the pantry`, { body: `Now ${describeQuantity(item.quantity, item.unit)}.`, link: '/pantry' })
  res.json(item)
})

pantryRouter.post('/pantry/:itemId/use', async (req, res) => {
  const input = z.object({ quantity, unit: unit.optional(), note }).parse(req.body)
  const { householdId, userId } = ctx(res)
  const item = await pantry.recordUsage(householdId, userId, itemId(req.params), input)
  await announce(res, `used ${amount(input.quantity, input.unit, item.unit)} of ${item.ingredient.name}`, { body: `${describeQuantity(item.quantity, item.unit)} left.`, link: '/pantry' })
  res.json(item)
})

pantryRouter.post('/pantry/:itemId/verify', async (req, res) => {
  const input = z.discriminatedUnion('action', [
    z.object({ action: z.literal('confirm'), note }),
    z.object({ action: z.literal('finished'), note }),
    z.object({ action: z.literal('update'), quantity, unit: unit.optional(), note }),
  ]).parse(req.body)
  const { householdId, userId } = ctx(res)
  const result = await pantry.verifyPantryItem(householdId, userId, itemId(req.params), input)
  const { name } = result.item.ingredient, now = describeQuantity(result.item.quantity, result.item.unit)
  await announce(res, input.action === 'finished' ? `marked ${name} as finished` : result.changed ? `corrected ${name} after a stock check` : `confirmed ${name} stock`,
    { body: input.action === 'finished' ? 'Stock is now zero.' : result.changed ? `Was ${describeQuantity(result.previousQuantity, result.item.unit)}, now ${now}.` : `${now} is right.`, link: '/pantry' })
  res.json(result)
})

pantryRouter.delete('/pantry/:itemId', async (req, res) => {
  const { householdId, userId } = ctx(res)
  const item = await prisma.pantryItem.findFirst({ where: { id: itemId(req.params), householdId }, select: { ingredient: { select: { name: true } } } })
  await pantry.deletePantryItem(householdId, userId, itemId(req.params))
  if (item) await announce(res, `removed ${item.ingredient.name} from the pantry`, { link: '/pantry' })
  res.status(204).end()
})

pantryRouter.get('/pantry/:itemId/transactions', async (req, res) => {
  res.json(await pantry.listItemTransactions(ctx(res).householdId, itemId(req.params)))
})
