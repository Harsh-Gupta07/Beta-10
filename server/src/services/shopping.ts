import { Prisma, type ShoppingItemStatus } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { AppError, notFound } from '../lib/errors.js'
import { receiveStockTx } from './pantry.js'
import { getShortages } from './planner.js'
import { isCanonicalUnit, toCanonical, unitsFor, type InputUnit } from './units.js'

type Tx = Prisma.TransactionClient
const OPEN: ShoppingItemStatus[] = ['NEEDED', 'PURCHASED']
const STATUS_ORDER: Record<ShoppingItemStatus, number> = { NEEDED: 0, PURCHASED: 1, RECEIVED: 2 }

const itemInclude = { ingredient: { select: { id: true, name: true, category: true, canonicalUnit: true } } } as const
type ItemRow = Prisma.ShoppingListItemGetPayload<{ include: typeof itemInclude }>

function serialize(item: ItemRow) {
  return {
    id: item.id, name: item.ingredient?.name ?? item.name, ingredient: item.ingredient, category: item.ingredient?.category ?? 'Other',
    quantity: item.quantity.toString(), unit: item.unit, status: item.status, source: item.source, note: item.note,
    receivedQty: item.receivedQty?.toString() ?? null, purchasedAt: item.purchasedAt, receivedAt: item.receivedAt, createdAt: item.createdAt,
  }
}

async function listId(householdId: string, tx: Tx | typeof prisma = prisma) {
  const list = await tx.shoppingList.upsert({ where: { householdId_name: { householdId, name: 'Weekly shopping' } }, update: {}, create: { householdId }, select: { id: true } })
  return list.id
}

/** Shortages not yet covered by open (needed or purchased) list items. Always computed from current data. */
async function suggestions(householdId: string, items: ItemRow[]) {
  const onList = new Map<string, Prisma.Decimal>()
  for (const item of items) if (item.ingredientId && OPEN.includes(item.status)) onList.set(item.ingredientId, (onList.get(item.ingredientId) ?? new Prisma.Decimal(0)).plus(item.quantity))
  return (await getShortages(householdId)).map(shortage => {
    const listed = onList.get(shortage.ingredient.id) ?? new Prisma.Decimal(0)
    const suggested = Prisma.Decimal.max(new Prisma.Decimal(shortage.shortage).minus(listed), 0)
    return { ingredient: shortage.ingredient, unit: shortage.unit, shortage: shortage.shortage, onList: listed.toString(), suggested: suggested.toString(), affectedMeals: shortage.affectedMeals, firstAffected: shortage.firstAffected }
  }).filter(s => s.suggested !== '0')
}

export async function getShoppingList(householdId: string) {
  const id = await listId(householdId)
  const items = await prisma.shoppingListItem.findMany({ where: { shoppingListId: id }, include: itemInclude, orderBy: { createdAt: 'asc' } })
  const sorted = [...items].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.ingredient?.category ?? 'Other').localeCompare(b.ingredient?.category ?? 'Other') || (a.ingredient?.name ?? a.name).localeCompare(b.ingredient?.name ?? b.name))
  return { items: sorted.map(serialize), suggestions: await suggestions(householdId, items) }
}

export type AddItemInput = { ingredientId?: string; name?: string; quantity: string | number; unit?: string; note?: string; source?: 'MANUAL' | 'SHORTAGE' | 'ASSISTANT' }

/** Adds an item. Ingredient items merge into the open "needed" line for that ingredient, so the list never duplicates. */
async function addItemTx(tx: Tx, householdId: string, input: AddItemInput) {
  const shoppingListId = await listId(householdId, tx)
  if (input.ingredientId) {
    const ingredient = await tx.ingredient.findFirst({ where: { id: input.ingredientId, OR: [{ householdId: null }, { householdId }] } })
    if (!ingredient || !isCanonicalUnit(ingredient.canonicalUnit)) throw notFound('Ingredient')
    const unit = (input.unit ?? unitsFor(ingredient.canonicalUnit)[0]) as InputUnit
    if (!unitsFor(ingredient.canonicalUnit).includes(unit)) throw new AppError(422, `${ingredient.name} is measured in ${unitsFor(ingredient.canonicalUnit).join(' or ')}.`)
    const quantity = toCanonical(input.quantity, unit, ingredient.canonicalUnit)
    if (quantity.isZero()) throw new AppError(400, 'Quantity must be more than zero.')
    const open = await tx.shoppingListItem.findFirst({ where: { shoppingListId, ingredientId: ingredient.id, status: 'NEEDED' } })
    if (open) return tx.shoppingListItem.update({ where: { id: open.id }, data: { quantity: open.quantity.plus(quantity), ...(input.note ? { note: input.note } : {}) }, include: itemInclude })
    return tx.shoppingListItem.create({ data: { shoppingListId, ingredientId: ingredient.id, name: ingredient.name, quantity, unit: ingredient.canonicalUnit, source: input.source ?? 'MANUAL', note: input.note ?? '' }, include: itemInclude })
  }
  const name = input.name?.trim()
  if (!name) throw new AppError(400, 'Choose an ingredient or type an item name.')
  let quantity: Prisma.Decimal
  try { quantity = new Prisma.Decimal(input.quantity) } catch { throw new AppError(400, 'Quantity must be a number.') }
  if (!quantity.greaterThan(0)) throw new AppError(400, 'Quantity must be more than zero.')
  return tx.shoppingListItem.create({ data: { shoppingListId, name, quantity: quantity.toDecimalPlaces(3), unit: input.unit?.trim() || 'item', source: input.source ?? 'MANUAL', note: input.note ?? '' }, include: itemInclude })
}

export async function addItem(householdId: string, input: AddItemInput) {
  return serialize(await prisma.$transaction(tx => addItemTx(tx, householdId, input)))
}

/** Adds the current shortfall for each (or the chosen) short ingredient, net of what's already listed. */
export async function addSuggestions(householdId: string, ingredientIds?: string[]) {
  const { suggestions: current } = await getShoppingList(householdId)
  const chosen = current.filter(s => !ingredientIds || ingredientIds.includes(s.ingredient.id))
  await prisma.$transaction(async tx => {
    for (const s of chosen) await addItemTx(tx, householdId, { ingredientId: s.ingredient.id, quantity: s.suggested, unit: isCanonicalUnit(s.unit) ? unitsFor(s.unit)[0] : undefined, source: 'SHORTAGE' })
  })
  return { added: chosen.length }
}

async function findItem(tx: Tx, householdId: string, itemId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT i.id FROM "ShoppingListItem" i JOIN "ShoppingList" l ON l.id = i."shoppingListId"
    WHERE i.id = ${itemId} AND l."householdId" = ${householdId} FOR UPDATE OF i`
  if (!rows.length) throw notFound('Shopping item')
  return tx.shoppingListItem.findUniqueOrThrow({ where: { id: itemId }, include: itemInclude })
}

export async function updateItem(householdId: string, itemId: string, input: { quantity?: string | number; unit?: string; note?: string; status?: 'NEEDED' | 'PURCHASED' }) {
  return serialize(await prisma.$transaction(async tx => {
    const item = await findItem(tx, householdId, itemId)
    if (item.status === 'RECEIVED') throw new AppError(409, 'This item was already received into the pantry.')
    const data: Prisma.ShoppingListItemUpdateInput = {}
    if (input.quantity !== undefined) {
      if (item.ingredient && isCanonicalUnit(item.ingredient.canonicalUnit)) {
        data.quantity = toCanonical(input.quantity, (input.unit ?? unitsFor(item.ingredient.canonicalUnit)[0]) as InputUnit, item.ingredient.canonicalUnit)
      } else {
        data.quantity = new Prisma.Decimal(input.quantity).toDecimalPlaces(3)
        if (input.unit) data.unit = input.unit.trim()
      }
      if ((data.quantity as Prisma.Decimal).isZero()) throw new AppError(400, 'Quantity must be more than zero.')
    }
    if (input.note !== undefined) data.note = input.note
    // Marking purchased is bookkeeping only: pantry stock changes when the item is received.
    if (input.status) { data.status = input.status; data.purchasedAt = input.status === 'PURCHASED' ? new Date() : null }
    return tx.shoppingListItem.update({ where: { id: item.id }, data, include: itemInclude })
  }))
}

export async function deleteItem(householdId: string, itemId: string) {
  await prisma.$transaction(async tx => { await findItem(tx, householdId, itemId); await tx.shoppingListItem.delete({ where: { id: itemId } }) })
}

export async function clearReceived(householdId: string) {
  const id = await listId(householdId)
  const { count } = await prisma.shoppingListItem.deleteMany({ where: { shoppingListId: id, status: 'RECEIVED' } })
  return { removed: count }
}

/**
 * Confirms what physically arrived. Only this increases pantry stock. Receiving twice is a no-op:
 * the item row is locked, a RECEIVED item returns as-is, and the stock transaction key is unique per item.
 * A short delivery can keep the remainder on the list.
 */
export async function receiveItem(householdId: string, actorUserId: string, itemId: string, input: { quantity: string | number; unit?: InputUnit; keepRemainder?: boolean }) {
  const result = await prisma.$transaction(async tx => {
    const item = await findItem(tx, householdId, itemId)
    if (item.status === 'RECEIVED') return { alreadyReceived: true, item, pantryItem: null }
    let received: Prisma.Decimal
    let pantryItem = null
    if (item.ingredient && isCanonicalUnit(item.ingredient.canonicalUnit)) {
      received = toCanonical(input.quantity, input.unit ?? unitsFor(item.ingredient.canonicalUnit)[0]!, item.ingredient.canonicalUnit)
      if (received.isZero()) throw new AppError(400, 'Enter how much arrived. If nothing arrived, keep the item as needed.')
      pantryItem = await receiveStockTx(tx, householdId, actorUserId, { ingredientId: item.ingredient.id, quantity: received, idempotencyKey: `shopping:${item.id}`, note: 'Received from shopping list' })
    } else {
      try { received = new Prisma.Decimal(input.quantity) } catch { throw new AppError(400, 'Quantity must be a number.') }
      if (!received.greaterThan(0)) throw new AppError(400, 'Enter how much arrived.')
    }
    const updated = await tx.shoppingListItem.update({ where: { id: item.id }, data: { status: 'RECEIVED', receivedQty: received, receivedAt: new Date() }, include: itemInclude })
    if (input.keepRemainder && received.lessThan(item.quantity)) {
      await tx.shoppingListItem.create({ data: { shoppingListId: item.shoppingListId, ingredientId: item.ingredientId, name: item.name, quantity: item.quantity.minus(received), unit: item.unit, source: item.source, note: 'Remainder of a partial delivery' } })
    }
    return { alreadyReceived: false, item: updated, pantryItem }
  })
  return { alreadyReceived: result.alreadyReceived, item: serialize(result.item), pantryItem: result.pantryItem }
}
