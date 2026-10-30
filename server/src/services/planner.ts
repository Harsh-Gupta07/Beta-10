import { Prisma, type MealSlot, type MealStatus } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { AppError, notFound } from '../lib/errors.js'
import { allocate, compareMeals, SLOT_ORDER, type AllocationResult } from './allocation.js'
import { addDays, fromDbDate, localToday, toDbDate, weekStartOf, type DateString } from './dates.js'
import { visibleTo } from './recipes.js'
import { isCanonicalUnit, scaleQuantity } from './units.js'

const SLOT_LABEL: Record<MealSlot, string> = { BREAKFAST: 'breakfast', LUNCH: 'lunch', DINNER: 'dinner' }

const mealInclude = {
  recipe: {
    select: {
      id: true, name: true, category: true, baseServings: true, householdId: true,
      ingredients: { select: { ingredientId: true, quantity: true, ingredient: { select: { id: true, name: true, category: true, canonicalUnit: true } } }, orderBy: { position: 'asc' } },
    },
  },
} as const satisfies Prisma.PlannedMealInclude
type MealRow = Prisma.PlannedMealGetPayload<{ include: typeof mealInclude }>
type IngredientInfo = MealRow['recipe']['ingredients'][number]['ingredient']

async function household(householdId: string) {
  return prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { defaultServings: true, timezone: true } })
}

function requirements(meal: MealRow) {
  return meal.recipe.ingredients.map(line => {
    const unit = line.ingredient.canonicalUnit
    if (!isCanonicalUnit(unit)) throw new Error(`Unsupported canonical unit "${unit}".`)
    return { ingredient: line.ingredient, unit, quantity: scaleQuantity(line.quantity, meal.recipe.baseServings, meal.servings, unit) }
  })
}

/** Meals that hold a reservation on pantry stock: anything being cooked, and planned meals from today on. */
const reservingMeals = (householdId: string, today: DateString): Prisma.PlannedMealWhereInput => ({
  mealPlan: { householdId },
  OR: [{ status: 'COOKING' }, { status: 'PLANNED', date: { gte: toDbDate(today) } }],
})

const reserves = (meal: { status: MealStatus; date: Date }, today: DateString) =>
  meal.status === 'COOKING' || (meal.status === 'PLANNED' && fromDbDate(meal.date) >= today)

/** Recomputes every reservation from current pantry stock and upcoming meals. Never stale, never stored. */
async function computeAllocation(householdId: string, today: DateString) {
  const [meals, pantry] = await Promise.all([
    prisma.plannedMeal.findMany({ where: reservingMeals(householdId, today), include: mealInclude }),
    prisma.pantryItem.findMany({ where: { householdId }, select: { ingredientId: true, quantity: true } }),
  ])
  const ingredients = new Map<string, IngredientInfo>()
  const demands = meals.map(meal => ({
    mealId: meal.id, date: fromDbDate(meal.date), slot: meal.slot, createdAt: meal.createdAt,
    lines: requirements(meal).map(line => { ingredients.set(line.ingredient.id, line.ingredient); return { ingredientId: line.ingredient.id, quantity: line.quantity } }),
  }))
  const result = allocate(new Map(pantry.map(item => [item.ingredientId, item.quantity])), demands)
  return { meals, result, ingredients }
}

function serializeMeal(meal: MealRow, result: AllocationResult, today: DateString) {
  const active = reserves(meal, today)
  const allocations = result.byMeal.get(meal.id)
  const lines = requirements(meal).map(line => {
    const allocation = active ? allocations?.get(line.ingredient.id) : undefined
    return {
      ingredient: { id: line.ingredient.id, name: line.ingredient.name },
      unit: line.unit,
      required: line.quantity.toString(),
      allocated: allocation?.allocated.toString() ?? null,
      shortage: allocation?.shortage.toString() ?? null,
    }
  })
  return {
    id: meal.id,
    date: fromDbDate(meal.date),
    slot: meal.slot,
    servings: meal.servings,
    status: meal.status,
    recipe: { id: meal.recipe.id, name: meal.recipe.name, category: meal.recipe.category, baseServings: meal.recipe.baseServings, custom: meal.recipe.householdId !== null },
    reservesStock: active,
    isPast: fromDbDate(meal.date) < today,
    shortCount: lines.filter(line => line.shortage !== null && line.shortage !== '0').length,
    lines,
  }
}

/** Per-ingredient view of upcoming demand: on hand, reserved, free, and additional quantity needed. */
function stockPositions(result: AllocationResult, meals: MealRow[], ingredients: Map<string, IngredientInfo>) {
  const mealsById = new Map(meals.map(meal => [meal.id, meal]))
  return [...result.byIngredient.values()]
    .map(position => {
      const ingredient = ingredients.get(position.ingredientId)!
      const first = position.firstShortMealId ? mealsById.get(position.firstShortMealId)! : null
      return {
        ingredient: { id: ingredient.id, name: ingredient.name, category: ingredient.category },
        unit: ingredient.canonicalUnit,
        onHand: position.onHand.toString(),
        required: position.required.toString(),
        allocated: position.allocated.toString(),
        unallocated: position.unallocated.toString(),
        shortage: position.shortage.toString(),
        neededBy: position.mealIds.length,
        affectedMeals: position.shortMealIds.length,
        firstAffected: first && { mealId: first.id, date: fromDbDate(first.date), slot: first.slot, recipeName: first.recipe.name },
      }
    })
    .sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name))
}

type StockPosition = ReturnType<typeof stockPositions>[number]
type Shortage = StockPosition & { firstAffected: NonNullable<StockPosition['firstAffected']> }

/** Ingredients that run out before every upcoming meal is covered, earliest affected meal first. */
function shortages(positions: StockPosition[]): Shortage[] {
  return positions
    .filter((position): position is Shortage => position.firstAffected !== null)
    .sort((a, b) => a.firstAffected.date.localeCompare(b.firstAffected.date)
      || SLOT_ORDER[a.firstAffected.slot] - SLOT_ORDER[b.firstAffected.slot]
      || a.ingredient.name.localeCompare(b.ingredient.name))
}

export async function getWeek(householdId: string, week?: DateString) {
  const { timezone, defaultServings } = await household(householdId)
  const today = localToday(timezone)
  const weekStart = weekStartOf(week ?? today)
  const weekEnd = addDays(weekStart, 6)
  const [weekMeals, { meals, result, ingredients }] = await Promise.all([
    prisma.plannedMeal.findMany({ where: { mealPlan: { householdId }, date: { gte: toDbDate(weekStart), lte: toDbDate(weekEnd) } }, include: mealInclude }),
    computeAllocation(householdId, today),
  ])
  const positions = stockPositions(result, meals, ingredients)
  return {
    today, weekStart, weekEnd, defaultServings,
    meals: weekMeals.map(meal => serializeMeal(meal, result, today)),
    stock: positions,
    shortages: shortages(positions),
  }
}

export async function getShortages(householdId: string) {
  const { timezone } = await household(householdId)
  const { meals, result, ingredients } = await computeAllocation(householdId, localToday(timezone))
  return shortages(stockPositions(result, meals, ingredients))
}

/** Dashboard view: today's meals, the next few upcoming meals, and shortages. */
export async function overview(householdId: string) {
  const { timezone } = await household(householdId)
  const today = localToday(timezone)
  const [todays, { meals, result, ingredients }] = await Promise.all([
    prisma.plannedMeal.findMany({ where: { mealPlan: { householdId }, date: toDbDate(today), status: { not: 'CANCELLED' } }, include: mealInclude }),
    computeAllocation(householdId, today),
  ])
  const upcoming = meals.filter(meal => fromDbDate(meal.date) > today)
    .sort((a, b) => compareMeals({ mealId: a.id, date: fromDbDate(a.date), slot: a.slot, createdAt: a.createdAt }, { mealId: b.id, date: fromDbDate(b.date), slot: b.slot, createdAt: b.createdAt }))
    .slice(0, 5)
  const byTime = (list: MealRow[]) => list.sort((a, b) => compareMeals({ mealId: a.id, date: '', slot: a.slot, createdAt: a.createdAt }, { mealId: b.id, date: '', slot: b.slot, createdAt: b.createdAt }))
  return {
    today,
    todayMeals: byTime(todays).map(meal => serializeMeal(meal, result, today)),
    upcomingMeals: upcoming.map(meal => serializeMeal(meal, result, today)),
    shortages: shortages(stockPositions(result, meals, ingredients)),
  }
}

// ---- Mutations ----

async function assertRecipeVisible(householdId: string, recipeId: string) {
  const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, ...visibleTo(householdId) }, select: { id: true } })
  if (!recipe) throw notFound('Recipe')
}

function assertNotPast(date: DateString, today: DateString) {
  if (date < today) throw new AppError(400, 'Meals can only be planned for today or later.')
}

async function planFor(tx: Prisma.TransactionClient, householdId: string, date: DateString) {
  const weekStart = toDbDate(weekStartOf(date))
  return tx.mealPlan.upsert({ where: { householdId_weekStart: { householdId, weekStart } }, update: {}, create: { householdId, weekStart }, select: { id: true } })
}

/** Frees a slot for a new meal: cancelled meals give way, anything else is a conflict. */
async function clearSlot(tx: Prisma.TransactionClient, householdId: string, date: DateString, slot: MealSlot, exceptMealId?: string) {
  const existing = await tx.plannedMeal.findFirst({ where: { mealPlan: { householdId }, date: toDbDate(date), slot, ...(exceptMealId ? { id: { not: exceptMealId } } : {}) }, include: { recipe: { select: { name: true } } } })
  if (!existing) return
  if (existing.status !== 'CANCELLED') throw new AppError(409, `${SLOT_LABEL[slot][0]!.toUpperCase()}${SLOT_LABEL[slot].slice(1)} on ${date} already has ${existing.recipe.name}. Change or cancel it first.`)
  await tx.plannedMeal.delete({ where: { id: existing.id } })
}

function conflictOnRace(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'Someone just planned a meal in that slot. Refresh and try again.')
  throw error
}

export type CreateMealInput = { date: DateString; slot: MealSlot; recipeId: string; servings?: number }

export async function createMeal(householdId: string, input: CreateMealInput) {
  const { timezone, defaultServings } = await household(householdId)
  assertNotPast(input.date, localToday(timezone))
  await assertRecipeVisible(householdId, input.recipeId)
  try {
    return await prisma.$transaction(async tx => {
      await clearSlot(tx, householdId, input.date, input.slot)
      const plan = await planFor(tx, householdId, input.date)
      return tx.plannedMeal.create({
        data: { mealPlanId: plan.id, recipeId: input.recipeId, date: toDbDate(input.date), slot: input.slot, servings: input.servings ?? defaultServings },
        select: { id: true },
      })
    })
  } catch (error) { conflictOnRace(error) }
}

export type UpdateMealInput = { recipeId?: string; servings?: number; date?: DateString; slot?: MealSlot }

export async function updateMeal(householdId: string, mealId: string, input: UpdateMealInput) {
  const meal = await prisma.plannedMeal.findFirst({ where: { id: mealId, mealPlan: { householdId } } })
  if (!meal) throw notFound('Meal')
  if (meal.status !== 'PLANNED') throw new AppError(409, `This meal is ${meal.status.toLowerCase()} and can no longer be changed.`)
  const { timezone } = await household(householdId)
  const today = localToday(timezone)
  if (fromDbDate(meal.date) < today) throw new AppError(409, 'Past meals can’t be changed.')
  if (input.recipeId) await assertRecipeVisible(householdId, input.recipeId)

  const date = input.date ?? fromDbDate(meal.date)
  const slot = input.slot ?? meal.slot
  const moving = date !== fromDbDate(meal.date) || slot !== meal.slot
  if (moving) assertNotPast(date, today)
  try {
    return await prisma.$transaction(async tx => {
      const data: Prisma.PlannedMealUncheckedUpdateInput = {}
      if (input.recipeId) data.recipeId = input.recipeId
      if (input.servings) data.servings = input.servings
      if (moving) {
        await clearSlot(tx, householdId, date, slot, meal.id)
        data.date = toDbDate(date)
        data.slot = slot
        data.mealPlanId = (await planFor(tx, householdId, date)).id
      }
      return tx.plannedMeal.update({ where: { id: meal.id }, data, select: { id: true } })
    })
  } catch (error) { conflictOnRace(error) }
}

/** Cancels a meal. Its reservation is released because cancelled meals no longer reserve stock. */
export async function cancelMeal(householdId: string, mealId: string) {
  const meal = await prisma.plannedMeal.findFirst({ where: { id: mealId, mealPlan: { householdId } } })
  if (!meal) throw notFound('Meal')
  if (meal.status === 'CANCELLED') return { id: meal.id }
  if (meal.status === 'COMPLETED') throw new AppError(409, 'This meal has already been cooked and can’t be cancelled.')
  const updated = await prisma.plannedMeal.updateMany({ where: { id: meal.id, status: { in: ['PLANNED', 'COOKING'] } }, data: { status: 'CANCELLED' } })
  if (!updated.count) throw new AppError(409, 'This meal changed while you were cancelling it. Refresh and try again.')
  return { id: meal.id }
}
