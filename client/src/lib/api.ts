import axios from 'axios'

export const api = axios.create({
  // Same-origin by default (Vite proxies /api to the server in development).
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  withCredentials: true,
})

/** Pulls the user-facing message out of an API error, falling back to a generic one. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Could not reach KitchenSync. Check that the API is running.'
    const data = error.response.data as { error?: string; details?: Array<{ path: string; message: string }> } | undefined
    if (data?.details?.length) return `${data.error ?? fallback} (${data.details.map(d => `${d.path || 'request'}: ${d.message}`).join('; ')})`
    // No API error body means something in between answered (dev proxy, gateway): say so instead of hiding it.
    return data?.error ?? `${fallback} The server responded with ${error.response.status} ${error.response.statusText}; check that the API is running and restart \`npm run dev\`.`
  }
  return fallback
}

export type Household = { id: string; name: string; defaultServings: number }
export type User = { id: string; name: string; email: string }

export type CanonicalUnit = 'g' | 'ml' | 'count'
export type InputUnit = 'g' | 'kg' | 'ml' | 'l' | 'pcs'
export type Confidence = 'CONFIRMED' | 'ESTIMATED' | 'CHECK_NEEDED'

export type Ingredient = { id: string; name: string; category: string; canonicalUnit: CanonicalUnit; householdId: string | null }

export type PantryItem = {
  id: string
  ingredient: { id: string; name: string; category: string; canonicalUnit: CanonicalUnit; custom: boolean }
  quantity: string
  unit: CanonicalUnit
  lowStockThreshold: string | null
  confidence: Confidence
  source: 'MANUAL' | 'PURCHASE' | 'RECIPE_DEDUCTION' | 'CORRECTION' | 'IMPORT'
  purchasedAt: string | null
  expiresAt: string | null
  lastVerifiedAt: string | null
  createdAt: string
  updatedAt: string
  status: 'OUT' | 'LOW' | 'OK'
  expiry: 'EXPIRED' | 'SOON' | null
}

export type StockTransaction = {
  id: string
  type: 'INITIAL_STOCK' | 'PURCHASE_RECEIVED' | 'COOKING_CONSUMPTION' | 'CORRECTION' | 'MANUAL_USE' | 'REMOVED'
  delta: string
  balanceAfter: string
  unit: CanonicalUnit
  note: string
  createdAt: string
  ingredient: { id: string; name: string }
  actor: { id: string; name: string }
}

export type RecipeSummary = {
  id: string
  name: string
  description: string
  category: string
  baseServings: number
  prepMinutes: number
  cookMinutes: number
  custom: boolean
  ingredientCount: number
  /** Lines the pantry can't cover at the household's usual servings. */
  missingCount: number
  updatedAt: string
}

export type RecipeLine = {
  ingredient: { id: string; name: string; category: string; canonicalUnit: CanonicalUnit }
  quantity: string
  unit: CanonicalUnit
  note: string
  inPantry: string | null
  missing: string
  enough: boolean
}

export type RecipeDetail = RecipeSummary & { servings: number; instructions: string[]; ingredients: RecipeLine[] }

export type MealSlot = 'BREAKFAST' | 'LUNCH' | 'DINNER'
export type MealStatus = 'PLANNED' | 'COOKING' | 'COMPLETED' | 'CANCELLED'

export type PlannedMeal = {
  id: string
  date: string
  slot: MealSlot
  servings: number
  status: MealStatus
  recipe: { id: string; name: string; category: string; baseServings: number; custom: boolean }
  /** Whether this meal currently holds a reservation on pantry stock. */
  reservesStock: boolean
  isPast: boolean
  shortCount: number
  lines: Array<{ ingredient: { id: string; name: string }; unit: CanonicalUnit; required: string; allocated: string | null; shortage: string | null }>
}

export type StockPosition = {
  ingredient: { id: string; name: string; category: string }
  unit: CanonicalUnit
  onHand: string
  required: string
  allocated: string
  unallocated: string
  shortage: string
  neededBy: number
  affectedMeals: number
  firstAffected: { mealId: string; date: string; slot: MealSlot; recipeName: string } | null
}
export type Shortage = StockPosition & { firstAffected: NonNullable<StockPosition['firstAffected']> }

export type PlannerWeek = { today: string; weekStart: string; weekEnd: string; defaultServings: number; meals: PlannedMeal[]; stock: StockPosition[]; shortages: Shortage[] }

export type Dashboard = {
  household: Household
  today: string
  pantryCount: number
  lowStock: PantryItem[]
  lowStockCount: number
  needsCheck: number
  recipeCount: number
  todayMeals: PlannedMeal[]
  upcomingMeals: PlannedMeal[]
  shortages: Shortage[]
  shoppingCount: number
  activity: StockTransaction[]
}
