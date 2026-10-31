import { randomUUID } from 'node:crypto'
import { Prisma, type Allergen, type DietClass, type StockConfidence, type StockSource, type StockTransactionType } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { AppError, notFound } from '../lib/errors.js'
import { expiryState, isCanonicalUnit, MAX_CANONICAL_QUANTITY, stockStatus, toCanonical, unitsFor, type CanonicalUnit, type InputUnit } from './units.js'
import { notifyIfMealsAffected } from './notifications.js'

type Tx = Prisma.TransactionClient
type QuantityInput = { quantity: string | number; unit?: InputUnit }

const itemInclude = { ingredient: { select: { id: true, name: true, category: true, canonicalUnit: true, householdId: true, dietClass: true, allergens: true, allergensReviewed: true } } } as const
type PantryRow = Prisma.PantryItemGetPayload<{ include: typeof itemInclude }>

function canonicalOf(ingredient: { canonicalUnit: string }): CanonicalUnit {
  if (!isCanonicalUnit(ingredient.canonicalUnit)) throw new Error(`Ingredient has unsupported canonical unit "${ingredient.canonicalUnit}".`)
  return ingredient.canonicalUnit
}

function convert(input: QuantityInput, canonical: CanonicalUnit) {
  return toCanonical(input.quantity, input.unit ?? unitsFor(canonical)[0]!, canonical)
}

export function serializePantryItem(item: PantryRow, now = new Date()) {
  return {
    id: item.id,
    ingredient: { id: item.ingredient.id, name: item.ingredient.name, category: item.ingredient.category, canonicalUnit: item.ingredient.canonicalUnit, custom: item.ingredient.householdId !== null,
      dietClass: item.ingredient.dietClass, allergens: item.ingredient.allergens, allergensReviewed: item.ingredient.allergensReviewed },
    quantity: item.quantity.toString(),
    unit: item.unit,
    lowStockThreshold: item.lowStockThreshold?.toString() ?? null,
    confidence: item.confidence,
    source: item.source,
    purchasedAt: item.purchasedAt,
    expiresAt: item.expiresAt,
    lastVerifiedAt: item.lastVerifiedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    status: stockStatus(item.quantity, item.lowStockThreshold),
    expiry: expiryState(item.expiresAt, now),
  }
}

/** Locks the household's pantry row for the rest of the transaction so concurrent edits serialize. */
async function lockItem(tx: Tx, householdId: string, itemId: string): Promise<PantryRow> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PantryItem" WHERE id = ${itemId} AND "householdId" = ${householdId} FOR UPDATE`
  if (!rows.length) throw notFound('Pantry item')
  return tx.pantryItem.findUniqueOrThrow({ where: { id: itemId }, include: itemInclude })
}

function recordTransaction(tx: Tx, item: PantryRow, actorUserId: string, type: StockTransactionType, delta: Prisma.Decimal, balanceAfter: Prisma.Decimal, note = '') {
  return tx.stockTransaction.create({
    data: { idempotencyKey: randomUUID(), householdId: item.householdId, pantryItemId: item.id, ingredientId: item.ingredientId, actorUserId, type, delta, balanceAfter, unit: item.unit, note },
  })
}

// ---- Ingredient catalog ----

const ingredientSelect = { id: true, name: true, category: true, canonicalUnit: true, householdId: true, dietClass: true, allergens: true, allergensReviewed: true } as const
type FoodTags = { dietClass?: DietClass | null; allergens?: Allergen[]; allergensReviewed?: boolean }

export function listIngredients(householdId: string) {
  return prisma.ingredient.findMany({
    where: { OR: [{ householdId: null }, { householdId }] },
    select: ingredientSelect,
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })
}

const tagData = (input: FoodTags) => ({
  ...(input.dietClass !== undefined ? { dietClass: input.dietClass } : {}),
  ...(input.allergens ? { allergens: [...new Set(input.allergens)] } : {}),
  ...(input.allergensReviewed !== undefined ? { allergensReviewed: input.allergensReviewed } : {}),
})

export async function createIngredient(householdId: string, input: { name: string; category: string; canonicalUnit: CanonicalUnit } & FoodTags) {
  const nameKey = input.name.trim().toLowerCase()
  const existing = await prisma.ingredient.findFirst({ where: { nameKey, OR: [{ householdId: null }, { householdId }] } })
  if (existing) throw new AppError(409, `"${existing.name}" is already in your ingredient list.`)
  return prisma.ingredient.create({
    data: { householdId, name: input.name.trim(), nameKey, category: input.category.trim() || 'Other', canonicalUnit: input.canonicalUnit, ...tagData(input) },
    select: ingredientSelect,
  })
}

export async function tagIngredient(householdId: string, ingredientId: string, input: FoodTags) {
  const ingredient = await prisma.ingredient.findFirst({ where: { id: ingredientId, OR: [{ householdId: null }, { householdId }] }, select: { householdId: true } })
  if (!ingredient) throw notFound('Ingredient')
  if (ingredient.householdId === null) throw new AppError(403, 'Built-in ingredients are tagged by KitchenSync and can’t be changed.')
  return prisma.ingredient.update({ where: { id: ingredientId }, data: tagData(input), select: ingredientSelect })
}

// ---- Pantry ----

export async function listPantry(householdId: string) {
  const items = await prisma.pantryItem.findMany({ where: { householdId }, include: itemInclude, orderBy: { ingredient: { name: 'asc' } } })
  const now = new Date()
  return items.map(item => serializePantryItem(item, now))
}

export type AddPantryInput = QuantityInput & {
  ingredientId: string
  lowStockThreshold?: string | number | null
  confidence?: StockConfidence
  source?: Extract<StockSource, 'MANUAL' | 'PURCHASE'>
  purchasedAt?: Date | null
  expiresAt?: Date | null
}

export async function addPantryItem(householdId: string, actorUserId: string, input: AddPantryInput) {
  const ingredient = await prisma.ingredient.findFirst({ where: { id: input.ingredientId, OR: [{ householdId: null }, { householdId }] } })
  if (!ingredient) throw notFound('Ingredient')
  const canonical = canonicalOf(ingredient)
  const quantity = convert(input, canonical)
  const threshold = input.lowStockThreshold == null ? null : convert({ quantity: input.lowStockThreshold, unit: input.unit }, canonical)
  const confidence = input.confidence ?? 'ESTIMATED'

  return prisma.$transaction(async tx => {
    const duplicate = await tx.pantryItem.findUnique({ where: { householdId_ingredientId: { householdId, ingredientId: ingredient.id } } })
    if (duplicate) throw new AppError(409, `${ingredient.name} is already in your pantry. Update its quantity instead.`)
    const item = await tx.pantryItem.create({
      data: {
        householdId, ingredientId: ingredient.id, quantity, unit: canonical, lowStockThreshold: threshold, confidence,
        source: input.source ?? 'MANUAL', purchasedAt: input.purchasedAt ?? null, expiresAt: input.expiresAt ?? null,
        lastVerifiedAt: confidence === 'CONFIRMED' ? new Date() : null,
      },
      include: itemInclude,
    })
    await recordTransaction(tx, item, actorUserId, 'INITIAL_STOCK', quantity, quantity, 'Added to pantry')
    return serializePantryItem(item)
  })
}

export type UpdatePantryInput = Partial<QuantityInput> & {
  lowStockThreshold?: string | number | null
  confidence?: StockConfidence
  purchasedAt?: Date | null
  expiresAt?: Date | null
  note?: string
}

export async function updatePantryItem(householdId: string, actorUserId: string, itemId: string, input: UpdatePantryInput) {
  return prisma.$transaction(async tx => {
    const item = await lockItem(tx, householdId, itemId)
    const canonical = canonicalOf(item.ingredient)
    const data: Prisma.PantryItemUpdateInput = {}
    if (input.quantity !== undefined) {
      const quantity = convert({ quantity: input.quantity, unit: input.unit }, canonical)
      if (!quantity.equals(item.quantity)) {
        data.quantity = quantity
        data.source = 'CORRECTION'
        await recordTransaction(tx, item, actorUserId, 'CORRECTION', quantity.minus(item.quantity), quantity, input.note || 'Quantity edited')
      }
    }
    if (input.lowStockThreshold !== undefined) data.lowStockThreshold = input.lowStockThreshold === null ? null : convert({ quantity: input.lowStockThreshold, unit: input.unit }, canonical)
    if (input.confidence !== undefined) {
      data.confidence = input.confidence
      if (input.confidence === 'CONFIRMED') data.lastVerifiedAt = new Date()
    }
    if (input.purchasedAt !== undefined) data.purchasedAt = input.purchasedAt
    if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt
    const updated = await tx.pantryItem.update({ where: { id: item.id }, data, include: itemInclude })
    return serializePantryItem(updated)
  })
}

/** Records stock that was used outside a planned meal (spillage, snacks, unplanned cooking). */
export async function recordUsage(householdId: string, actorUserId: string, itemId: string, input: QuantityInput & { note?: string }) {
  const item = await prisma.$transaction(async tx => {
    const item = await lockItem(tx, householdId, itemId)
    const used = convert(input, canonicalOf(item.ingredient))
    if (used.isZero()) throw new AppError(400, 'Enter how much was used.')
    if (used.greaterThan(item.quantity)) {
      throw new AppError(409, `Only ${item.quantity.toString()} ${item.unit} of ${item.ingredient.name} is recorded. Verify the actual quantity instead.`)
    }
    const balance = item.quantity.minus(used)
    await recordTransaction(tx, item, actorUserId, 'MANUAL_USE', used.negated(), balance, input.note || 'Used outside meal plan')
    const updated = await tx.pantryItem.update({ where: { id: item.id }, data: { quantity: balance }, include: itemInclude })
    return serializePantryItem(updated)
  })
  const affected = await notifyIfMealsAffected(householdId, item.ingredient.id, `${item.ingredient.name} use was recorded`)
  return { ...item, affected }
}

export type VerifyInput =
  | { action: 'confirm'; note?: string }
  | { action: 'finished'; note?: string }
  | ({ action: 'update'; note?: string } & QuantityInput)

/** A physical stock check. Always ends with CONFIRMED confidence and a fresh verification time. */
export async function verifyPantryItem(householdId: string, actorUserId: string, itemId: string, input: VerifyInput) {
  const result = await prisma.$transaction(async tx => {
    const item = await lockItem(tx, householdId, itemId)
    const newQuantity = input.action === 'confirm' ? item.quantity
      : input.action === 'finished' ? new Prisma.Decimal(0)
      : convert(input, canonicalOf(item.ingredient))
    const note = input.note || { confirm: 'Quantity confirmed', finished: 'Marked as finished', update: 'Quantity corrected after check' }[input.action]
    const changed = !newQuantity.equals(item.quantity)
    if (changed) await recordTransaction(tx, item, actorUserId, 'CORRECTION', newQuantity.minus(item.quantity), newQuantity, note)
    await tx.inventoryVerification.create({
      data: { householdId, pantryItemId: item.id, actorUserId, oldQuantity: item.quantity, newQuantity, unit: item.unit, note },
    })
    const updated = await tx.pantryItem.update({
      where: { id: item.id },
      data: { quantity: newQuantity, confidence: 'CONFIRMED', lastVerifiedAt: new Date(), ...(changed ? { source: 'CORRECTION' as const } : {}) },
      include: itemInclude,
    })
    return { item: serializePantryItem(updated), changed, decreased: newQuantity.lessThan(item.quantity), previousQuantity: item.quantity.toString() }
  })
  // Recalculation is automatic (allocations are computed on read); tell the household if plans now fall short.
  const affected = result.decreased ? await notifyIfMealsAffected(householdId, result.item.ingredient.id, `${result.item.ingredient.name} was corrected after a stock check`) : null
  return { item: result.item, changed: result.changed, previousQuantity: result.previousQuantity, affected }
}

/**
 * Adds stock that has physically arrived (a confirmed shopping receipt or a confirmed assistant action).
 * This is the only path that increases stock outside manual edits. `idempotencyKey` is stored on the
 * stock transaction, whose unique constraint makes a repeated receipt impossible.
 */
export async function receiveStockTx(tx: Tx, householdId: string, actorUserId: string, input: { ingredientId: string; quantity: Prisma.Decimal; idempotencyKey: string; note: string }) {
  const ingredient = await tx.ingredient.findFirst({ where: { id: input.ingredientId, OR: [{ householdId: null }, { householdId }] } })
  if (!ingredient) throw notFound('Ingredient')
  if (!input.quantity.greaterThan(0)) throw new AppError(400, 'Received quantity must be more than zero.')
  const now = new Date()
  // Create the pantry row if it doesn't exist yet, without aborting the transaction on a concurrent insert.
  await tx.$executeRaw`
    INSERT INTO "PantryItem" ("id", "householdId", "ingredientId", "quantity", "unit", "confidence", "source", "purchasedAt", "lastVerifiedAt", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${householdId}, ${ingredient.id}, 0, ${ingredient.canonicalUnit}, 'CONFIRMED'::"StockConfidence", 'PURCHASE'::"StockSource", ${now}, ${now}, ${now}, ${now})
    ON CONFLICT ("householdId", "ingredientId") DO NOTHING`
  const existing = await tx.pantryItem.findUniqueOrThrow({ where: { householdId_ingredientId: { householdId, ingredientId: ingredient.id } }, select: { id: true } })
  const item = await lockItem(tx, householdId, existing.id)
  const balance = item.quantity.plus(input.quantity)
  if (balance.greaterThan(MAX_CANONICAL_QUANTITY)) throw new AppError(400, 'That quantity is too large.')
  await tx.stockTransaction.create({
    data: { idempotencyKey: input.idempotencyKey, householdId, pantryItemId: item.id, ingredientId: item.ingredientId, actorUserId, type: 'PURCHASE_RECEIVED', delta: input.quantity, balanceAfter: balance, unit: item.unit, note: input.note },
  })
  const updated = await tx.pantryItem.update({ where: { id: item.id }, data: { quantity: balance, source: 'PURCHASE', purchasedAt: now }, include: itemInclude })
  return serializePantryItem(updated)
}

export async function receiveStock(householdId: string, actorUserId: string, input: QuantityInput & { ingredientId: string; note?: string; idempotencyKey?: string }) {
  const ingredient = await prisma.ingredient.findFirst({ where: { id: input.ingredientId, OR: [{ householdId: null }, { householdId }] } })
  if (!ingredient) throw notFound('Ingredient')
  const quantity = convert(input, canonicalOf(ingredient))
  try {
    return await prisma.$transaction(tx => receiveStockTx(tx, householdId, actorUserId, { ingredientId: ingredient.id, quantity, idempotencyKey: input.idempotencyKey ?? randomUUID(), note: input.note || 'Stock added' }))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'This stock was already added.')
    throw error
  }
}

export async function deletePantryItem(householdId: string, actorUserId: string, itemId: string) {
  await prisma.$transaction(async tx => {
    const item = await lockItem(tx, householdId, itemId)
    await recordTransaction(tx, item, actorUserId, 'REMOVED', item.quantity.negated(), new Prisma.Decimal(0), 'Removed from pantry')
    await tx.pantryItem.delete({ where: { id: item.id } })
  })
}

const transactionSelect = {
  id: true, type: true, delta: true, balanceAfter: true, unit: true, note: true, createdAt: true,
  ingredient: { select: { id: true, name: true } },
  actor: { select: { id: true, name: true } },
} as const

function serializeTransaction(t: Prisma.StockTransactionGetPayload<{ select: typeof transactionSelect }>) {
  return { ...t, delta: t.delta.toString(), balanceAfter: t.balanceAfter.toString() }
}

export async function listItemTransactions(householdId: string, itemId: string) {
  const item = await prisma.pantryItem.findFirst({ where: { id: itemId, householdId }, select: { id: true } })
  if (!item) throw notFound('Pantry item')
  const rows = await prisma.stockTransaction.findMany({ where: { householdId, pantryItemId: itemId }, select: transactionSelect, orderBy: { createdAt: 'desc' }, take: 50 })
  return rows.map(serializeTransaction)
}

export async function recentActivity(householdId: string, take = 6) {
  const rows = await prisma.stockTransaction.findMany({ where: { householdId }, select: transactionSelect, orderBy: { createdAt: 'desc' }, take })
  return rows.map(serializeTransaction)
}
