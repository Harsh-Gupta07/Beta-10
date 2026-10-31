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
    if (data?.error) return data.error
    if (error.response.status === 429) return 'Too many requests. Please wait a moment and try again.'
    // A bare 500/502/503/504 comes from a proxy or gateway while the server is down or restarting.
    if (error.response.status >= 500) return 'KitchenSync’s server isn’t answering right now. It may be restarting; please try again in a few seconds.'
    return import.meta.env.DEV
      ? `${fallback} The server responded with ${error.response.status} ${error.response.statusText}; check that the API is running and restart \`npm run dev\`.`
      : `${fallback} (server error ${error.response.status})`
  }
  return fallback
}

export type KitchenRole = 'PLANNER' | 'COOK' | 'SHOPPER' | 'STOCK_CHECKER'
export type KitchenRoles = { members: Array<{ userId: string; name: string; roles: KitchenRole[] }>; family: Array<{ id: string; name: string; roles: KitchenRole[] }> }
export type Appliance = 'GAS_STOVE' | 'INDUCTION' | 'MICROWAVE' | 'AIR_FRYER' | 'OVEN' | 'PRESSURE_COOKER' | 'MIXER_GRINDER'
export type Household = { id: string; name: string; defaultServings: number; peopleCount?: number | null; appliances?: Appliance[]; usualCookMinutes?: number | null; katoriMl?: number | null; chammachMl?: number | null; mutthiGrams?: number | null; onboardingCompletedAt?: string | null; yourRole?: "OWNER" | "MEMBER"; yourKitchenRoles?: KitchenRole[] }
/** isDemo marks a "See a demo kitchen" visitor; their kitchen is deleted at demoExpiresAt. */
export type AppLanguage = 'EN' | 'HI' | 'HINGLISH'
export type User = { id: string; name: string; email: string; language?: AppLanguage; voiceLanguage?: 'en-IN' | 'hi-IN'; hasPassword?: boolean; isDemo?: boolean; demoExpiresAt?: string }

export type CanonicalUnit = 'g' | 'ml' | 'count'
export type InputUnit = 'g' | 'kg' | 'ml' | 'l' | 'pcs'
export type Confidence = 'CONFIRMED' | 'ESTIMATED' | 'CHECK_NEEDED'

export type Allergen = 'MILK' | 'EGG' | 'PEANUT' | 'TREE_NUT' | 'GLUTEN' | 'SOY' | 'SESAME' | 'FISH' | 'SHELLFISH' | 'MUSTARD'
export type DietClass = 'PLANT' | 'DAIRY' | 'EGG' | 'MEAT' | 'SEAFOOD'
export type DietType = 'VEGAN' | 'VEGETARIAN' | 'EGGETARIAN' | 'NON_VEGETARIAN'
export type AgeGroup = 'CHILD' | 'TEEN' | 'ADULT' | 'SENIOR'
export type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'
export type HealthGoal = 'LOW_OIL' | 'LOW_SALT' | 'LOW_SUGAR' | 'HIGH_PROTEIN' | 'HIGH_FIBRE' | 'LIGHT_MEALS'
/** The parts of a person's needs captured on an onboarding card. */
export type PersonNeeds = { ageGroup: AgeGroup | null; dietType: DietType | null; allergens: Allergen[]; healthGoals: HealthGoal[]; weeklyFasts: Weekday[] }
/** Someone who eats at home without a login. */
export type FamilyProfile = PersonNeeds & { id: string; name: string }

export type Ingredient = {
  id: string; name: string; category: string; canonicalUnit: CanonicalUnit; householdId: string | null
  dietClass: DietClass | null; allergens: Allergen[]; allergensReviewed: boolean
}

/** Whether a recipe suits every household member, worked out on the server from ingredient tags. */
export type RecipeSafety = {
  status: 'SUITABLE' | 'CONFLICT' | 'UNKNOWN'
  conflicts: Array<{ member: string; kind: 'ALLERGY' | 'RESTRICTION'; reason: string }>
  uncertain: string[]
  unreviewed: string[]
}

type NamedRef = { id: string; name: string }
export type FoodPreferences = {
  dietType: DietType | null; allergens: Allergen[]; maxSpice: number | null; cuisines: string[]
  ageGroup: AgeGroup | null; healthGoals: HealthGoal[]; weeklyFasts: Weekday[]
  avoidIngredients: NamedRef[]; likedIngredients: NamedRef[]; favouriteRecipes: NamedRef[]; dislikedRecipes: NamedRef[]
}
export type SuggestionReason = { tone: 'good' | 'warn'; text: string }
export type Suggestion = {
  score: number
  reasons: SuggestionReason[]
  recipe: Pick<RecipeSummary, 'id' | 'name' | 'category' | 'cuisine' | 'description' | 'prepMinutes' | 'cookMinutes' | 'dietType' | 'safety' | 'missingCount' | 'ingredientCount'>
}
export type SuggestionsData = {
  today: string
  scope: 'household' | 'me'
  slot: MealSlot | null
  hasHistory: boolean
  suggestions: Suggestion[]
  excludedForSafety: number
  snoozed: Array<{ recipe: { id: string; name: string }; until: string }>
}
type Person = { id: string; name: string }
export type EatenMeal = { source: 'COOKED' | 'LOGGED'; id: string; recipe: { id: string; name: string }; date: string; slot: MealSlot; eaters: Person[]; absent: Person[] }
export type HistoryData = { today: string; days: number; meals: EatenMeal[]; dishes: Array<{ recipe: { id: string; name: string }; times: number; lastDate: string; daysAgo: number }> }
export type Attendance = { editable: boolean; members: Array<Person & { eating: boolean }> }

export type HouseholdFoodProfile = {
  cuisines: string[]; usualSpice: number | null
  family: FamilyProfile[]
  members: Array<{ id: string; name: string; dietType: DietType | null; allergens: Allergen[]; avoidIngredients: NamedRef[] }>
}

export type PantryItem = {
  id: string
  ingredient: { id: string; name: string; category: string; canonicalUnit: CanonicalUnit; custom: boolean; dietClass: DietClass | null; allergens: Allergen[]; allergensReviewed: boolean }
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
  cuisine: string
  spiceLevel: number | null
  tags: string[]
  custom: boolean
  ingredientCount: number
  /** Lines the pantry can't cover at the household's usual servings. */
  missingCount: number
  /** Null when an ingredient isn't classified yet. */
  dietType: DietType | null
  allergens: Allergen[]
  safety: RecipeSafety
  updatedAt: string
}

export type RecipeLine = {
  ingredient: { id: string; name: string; category: string; canonicalUnit: CanonicalUnit }
  allergens: Allergen[]
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
  unreadNotifications: number
}

export type CookingView = {
  id: string; status: MealStatus; servings: number; slot: MealSlot; date: string
  cookingStartedAt: string | null; completedAt: string | null
  recipe: { id: string; name: string; instructions: string[] }
  lines: Array<{ ingredient: { id: string; name: string }; unit: CanonicalUnit; note: string; planned: string; inPantry: string | null; used: string | null }>
}

export type ShoppingItem = {
  id: string; name: string; category: string
  ingredient: { id: string; name: string; category: string; canonicalUnit: CanonicalUnit } | null
  quantity: string; unit: string; status: 'NEEDED' | 'PURCHASED' | 'RECEIVED'; source: 'MANUAL' | 'SHORTAGE' | 'ASSISTANT'; note: string
  receivedQty: string | null; purchasedAt: string | null; receivedAt: string | null; createdAt: string
}
export type ShoppingSuggestion = {
  ingredient: { id: string; name: string; category: string }; unit: CanonicalUnit
  shortage: string; onList: string; suggested: string; affectedMeals: number; firstAffected: Shortage['firstAffected']
}
export type ShoppingData = { today: string; items: ShoppingItem[]; suggestions: ShoppingSuggestion[] }

export type VerificationEntry = { item: PantryItem; reasons: string[]; score: number; neededBy: number; priority: 'HIGH' | 'MEDIUM' | 'LOW' }

/** `read` is per person: each member has their own unread count. */
export type AppNotification = { id: string; title: string; body: string; link: string | null; read: boolean; createdAt: string }

export type HouseholdDetails = Household & {
  timezone: string; inviteCode: string | null; createdAt: string; yourRole: 'OWNER' | 'MEMBER'
  members: Array<User & { role: 'OWNER' | 'MEMBER'; joinedAt: string }>
}

export type RecipeDraft = {
  name: string; category: string; description: string; baseServings: number; prepMinutes: number; cookMinutes: number; instructions: string[]
  ingredients: Array<{ ingredientId: string; ingredientName: string; quantity: string; unit: InputUnit; note: string }>
  unresolved: string[]
}
export type AssistantAction =
  | { id: string; type: 'ADD_STOCK'; ingredientId: string; ingredientName: string; quantity: string; unit: InputUnit; summary: string }
  | { id: string; type: 'ADD_TO_SHOPPING'; items: Array<{ ingredientId: string; ingredientName: string; quantity: string; unit: InputUnit }>; summary: string }
  | { id: string; type: 'RECIPE_DRAFT'; draft: RecipeDraft; summary: string }
export type AssistantReply = { mode: 'ai' | 'fallback'; reply: string; actions: AssistantAction[] }
