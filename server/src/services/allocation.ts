import { Prisma, type MealSlot } from '@prisma/client'

type Decimal = Prisma.Decimal
const ZERO = new Prisma.Decimal(0)

export const SLOT_ORDER: Record<MealSlot, number> = { BREAKFAST: 0, LUNCH: 1, DINNER: 2 }

export type MealDemand = {
  mealId: string
  date: string // YYYY-MM-DD
  slot: MealSlot
  /** Tie-breaker for meals in the same slot (only possible in hand-built inputs); earlier first. */
  createdAt: Date
  /** Scaled requirements in canonical units. */
  lines: Array<{ ingredientId: string; quantity: Decimal }>
}

export type LineAllocation = { required: Decimal; allocated: Decimal; shortage: Decimal }

export type IngredientPosition = {
  ingredientId: string
  onHand: Decimal
  required: Decimal
  allocated: Decimal
  /** On-hand stock not reserved by any upcoming meal. */
  unallocated: Decimal
  /** Additional quantity needed to cover every upcoming meal. */
  shortage: Decimal
  /** Earliest meal that cannot be fully covered, if any. */
  firstShortMealId: string | null
  shortMealIds: string[]
  mealIds: string[]
}

export type AllocationResult = {
  byMeal: Map<string, Map<string, LineAllocation>>
  byIngredient: Map<string, IngredientPosition>
}

export function compareMeals(a: Pick<MealDemand, 'date' | 'slot' | 'createdAt' | 'mealId'>, b: typeof a) {
  return a.date.localeCompare(b.date) || SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] || a.createdAt.getTime() - b.createdAt.getTime() || a.mealId.localeCompare(b.mealId)
}

/**
 * Deterministically reserves on-hand stock for upcoming meals, earliest meal first.
 *
 * This never changes physical stock. Each unit of stock is reserved for at most one meal (no
 * double allocation); a meal that can't be fully covered gets what is left and records the
 * shortage. The result depends only on the inputs, not on the order they're passed in.
 */
export function allocate(onHand: ReadonlyMap<string, Decimal>, meals: readonly MealDemand[]): AllocationResult {
  const remaining = new Map(onHand)
  const byMeal = new Map<string, Map<string, LineAllocation>>()
  const byIngredient = new Map<string, IngredientPosition>()

  const position = (ingredientId: string) => {
    let entry = byIngredient.get(ingredientId)
    if (!entry) {
      const stock = onHand.get(ingredientId) ?? ZERO
      entry = { ingredientId, onHand: stock, required: ZERO, allocated: ZERO, unallocated: stock, shortage: ZERO, firstShortMealId: null, shortMealIds: [], mealIds: [] }
      byIngredient.set(ingredientId, entry)
    }
    return entry
  }

  for (const meal of [...meals].sort(compareMeals)) {
    const lines = new Map<string, LineAllocation>()
    for (const line of meal.lines) {
      const available = remaining.get(line.ingredientId) ?? ZERO
      const allocated = Prisma.Decimal.min(line.quantity, available)
      const shortage = line.quantity.minus(allocated)
      remaining.set(line.ingredientId, available.minus(allocated))

      const previous = lines.get(line.ingredientId)
      lines.set(line.ingredientId, previous
        ? { required: previous.required.plus(line.quantity), allocated: previous.allocated.plus(allocated), shortage: previous.shortage.plus(shortage) }
        : { required: line.quantity, allocated, shortage })

      const entry = position(line.ingredientId)
      entry.required = entry.required.plus(line.quantity)
      entry.allocated = entry.allocated.plus(allocated)
      entry.unallocated = entry.onHand.minus(entry.allocated)
      entry.shortage = entry.shortage.plus(shortage)
      if (!entry.mealIds.includes(meal.mealId)) entry.mealIds.push(meal.mealId)
      if (shortage.greaterThan(0)) {
        entry.firstShortMealId ??= meal.mealId
        if (!entry.shortMealIds.includes(meal.mealId)) entry.shortMealIds.push(meal.mealId)
      }
    }
    byMeal.set(meal.mealId, lines)
  }

  return { byMeal, byIngredient }
}
