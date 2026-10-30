import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { AppError, notFound } from '../lib/errors.js'
import { describeQuantity, isCanonicalUnit, scaleQuantity, toCanonical, unitsFor, type InputUnit } from './units.js'

type Tx = Prisma.TransactionClient

export type UsageInput = { ingredientId: string; quantity: string | number; unit?: InputUnit }

async function findMeal(householdId: string, mealId: string) {
  const meal = await prisma.plannedMeal.findFirst({
    where: { id: mealId, mealPlan: { householdId } },
    include: {
      recipe: { select: { id: true, name: true, baseServings: true, instructions: true, ingredients: { include: { ingredient: true }, orderBy: { position: 'asc' } } } },
      cookingEvent: { include: { transactions: { select: { ingredientId: true, delta: true, unit: true } } } },
    },
  })
  if (!meal) throw notFound('Meal')
  return meal
}

/** Locks the meal row so concurrent start/complete requests for one meal run one after another. */
async function lockMeal(tx: Tx, householdId: string, mealId: string) {
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT pm.status::text AS status FROM "PlannedMeal" pm JOIN "MealPlan" mp ON mp.id = pm."mealPlanId"
    WHERE pm.id = ${mealId} AND mp."householdId" = ${householdId} FOR UPDATE OF pm`
  if (!rows.length) throw notFound('Meal')
  return rows[0]!.status
}

/** The cooking screen: recipe lines scaled to the meal's servings next to what the pantry holds now. */
export async function getCookingView(householdId: string, mealId: string) {
  const meal = await findMeal(householdId, mealId)
  const pantry = new Map((await prisma.pantryItem.findMany({ where: { householdId }, select: { ingredientId: true, quantity: true } })).map(p => [p.ingredientId, p.quantity]))
  const used = new Map(meal.cookingEvent?.transactions.map(t => [t.ingredientId, t.delta.negated().toString()]) ?? [])
  return {
    id: meal.id, status: meal.status, servings: meal.servings, slot: meal.slot, date: meal.date.toISOString().slice(0, 10),
    cookingStartedAt: meal.cookingStartedAt, completedAt: meal.cookingEvent?.completedAt ?? null,
    recipe: { id: meal.recipe.id, name: meal.recipe.name, instructions: meal.recipe.instructions },
    lines: meal.recipe.ingredients.map(line => {
      const unit = line.ingredient.canonicalUnit
      if (!isCanonicalUnit(unit)) throw new Error(`Unsupported canonical unit "${unit}".`)
      return {
        ingredient: { id: line.ingredient.id, name: line.ingredient.name },
        unit, note: line.note,
        planned: scaleQuantity(line.quantity, meal.recipe.baseServings, meal.servings, unit).toString(),
        inPantry: pantry.get(line.ingredient.id)?.toString() ?? null,
        used: used.get(line.ingredient.id) ?? null,
      }
    }),
  }
}

export async function startCooking(householdId: string, mealId: string) {
  return prisma.$transaction(async tx => {
    const status = await lockMeal(tx, householdId, mealId)
    if (status === 'COOKING') return { id: mealId, status }
    if (status !== 'PLANNED') throw new AppError(409, `This meal is ${status.toLowerCase()} and can’t be started.`)
    await tx.plannedMeal.update({ where: { id: mealId }, data: { status: 'COOKING', cookingStartedAt: new Date() } })
    return { id: mealId, status: 'COOKING' }
  })
}

/** Returns a COOKING meal to PLANNED without touching stock. */
export async function stopCooking(householdId: string, mealId: string) {
  return prisma.$transaction(async tx => {
    const status = await lockMeal(tx, householdId, mealId)
    if (status === 'PLANNED') return { id: mealId, status }
    if (status !== 'COOKING') throw new AppError(409, `This meal is ${status.toLowerCase()}.`)
    await tx.plannedMeal.update({ where: { id: mealId }, data: { status: 'PLANNED', cookingStartedAt: null } })
    return { id: mealId, status: 'PLANNED' }
  })
}

/**
 * Completes a meal and deducts what was actually used, exactly once.
 *
 * - The meal row is locked, so simultaneous completions run one after another; the second one sees
 *   COMPLETED and gets the original result back without deducting anything.
 * - CookingEvent.plannedMealId is unique, so even a bug elsewhere can't record a second deduction.
 * - Each stock transaction's idempotency key is derived from the cooking event and ingredient.
 * - If the pantry holds less than was used, stock goes to zero (never negative) and is flagged CHECK_NEEDED.
 */
export async function completeMeal(householdId: string, actorUserId: string, mealId: string, input: { idempotencyKey: string; usage: UsageInput[]; note?: string }) {
  const ids = input.usage.map(u => u.ingredientId)
  if (new Set(ids).size !== ids.length) throw new AppError(400, 'Each ingredient can only be listed once.')
  const ingredients = new Map((await prisma.ingredient.findMany({ where: { id: { in: ids }, OR: [{ householdId: null }, { householdId }] } })).map(i => [i.id, i]))
  const usage = input.usage.map(u => {
    const ingredient = ingredients.get(u.ingredientId)
    if (!ingredient || !isCanonicalUnit(ingredient.canonicalUnit)) throw notFound('Ingredient')
    try { return { ingredient, quantity: toCanonical(u.quantity, u.unit ?? unitsFor(ingredient.canonicalUnit)[0]!, ingredient.canonicalUnit) } }
    catch (error) { throw error instanceof AppError ? new AppError(error.status, `${ingredient.name}: ${error.message}`) : error }
  }).filter(u => u.quantity.greaterThan(0))

  const outcome = await prisma.$transaction(async tx => {
    const status = await lockMeal(tx, householdId, mealId)
    const existing = await tx.cookingEvent.findUnique({ where: { plannedMealId: mealId } })
    if (status === 'COMPLETED' || existing) return { alreadyCompleted: true, eventId: existing?.id ?? null, warnings: [] as string[] }
    if (status === 'CANCELLED') throw new AppError(409, 'This meal was cancelled. Plan it again before cooking.')
    const reused = await tx.cookingEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (reused) throw new AppError(409, 'This completion request was already used for a different meal.')

    const event = await tx.cookingEvent.create({ data: { plannedMealId: mealId, idempotencyKey: input.idempotencyKey, actorUserId, note: input.note ?? '' } })
    const warnings: string[] = []
    // Lock pantry rows in a stable order so two meals sharing ingredients can't deadlock.
    for (const line of [...usage].sort((a, b) => a.ingredient.id.localeCompare(b.ingredient.id))) {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PantryItem" WHERE "householdId" = ${householdId} AND "ingredientId" = ${line.ingredient.id} FOR UPDATE`
      if (!rows.length) { warnings.push(`${line.ingredient.name} isn’t tracked in your pantry, so nothing was deducted.`); continue }
      const item = await tx.pantryItem.findUniqueOrThrow({ where: { id: rows[0]!.id } })
      const deducted = Prisma.Decimal.min(line.quantity, item.quantity)
      const balance = item.quantity.minus(deducted)
      const shortfall = line.quantity.minus(deducted)
      if (shortfall.greaterThan(0)) warnings.push(`You used ${describeQuantity(line.quantity, item.unit)} of ${line.ingredient.name} but only ${describeQuantity(item.quantity, item.unit)} was recorded. Stock is now 0 and marked for a check.`)
      if (deducted.greaterThan(0)) {
        await tx.stockTransaction.create({
          data: {
            idempotencyKey: `cook:${event.id}:${line.ingredient.id}`, householdId, pantryItemId: item.id, ingredientId: line.ingredient.id, actorUserId,
            cookingEventId: event.id, type: 'COOKING_CONSUMPTION', delta: deducted.negated(), balanceAfter: balance, unit: item.unit,
            note: shortfall.greaterThan(0) ? `Cooked (used ${describeQuantity(line.quantity, item.unit)}, only ${describeQuantity(item.quantity, item.unit)} recorded)` : 'Cooked',
          },
        })
      }
      await tx.pantryItem.update({ where: { id: item.id }, data: { quantity: balance, ...(shortfall.greaterThan(0) ? { confidence: 'CHECK_NEEDED' as const } : {}) } })
    }
    await tx.plannedMeal.update({ where: { id: mealId }, data: { status: 'COMPLETED' } })
    return { alreadyCompleted: false, eventId: event.id, warnings }
  }, { timeout: 15000 })

  return { ...outcome, meal: await getCookingView(householdId, mealId) }
}
