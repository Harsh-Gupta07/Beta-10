import type { AgeGroup, Allergen, DietClass, DietType, Weekday } from '@prisma/client'

// Pure: decides whether a recipe suits each household member from tagged ingredients and stated needs.
// Nothing here guesses. An untagged ingredient makes the answer "unknown", never "safe".

export const ALLERGEN_LABEL: Record<Allergen, string> = {
  MILK: 'milk', EGG: 'egg', PEANUT: 'peanut', TREE_NUT: 'tree nuts', GLUTEN: 'gluten',
  SOY: 'soy', SESAME: 'sesame', FISH: 'fish', SHELLFISH: 'shellfish', MUSTARD: 'mustard',
}
export const ALLERGENS = Object.keys(ALLERGEN_LABEL) as [Allergen, ...Allergen[]]
export const DIET_TYPES = ['VEGAN', 'VEGETARIAN', 'EGGETARIAN', 'NON_VEGETARIAN'] as const satisfies readonly DietType[]
export const AGE_GROUPS = ['CHILD', 'TEEN', 'ADULT', 'SENIOR'] as const satisfies readonly AgeGroup[]
export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const satisfies readonly Weekday[]
/** Soft health preferences from onboarding. They guide suggestions later; they never block a dish. */
export const HEALTH_GOALS = ['LOW_OIL', 'LOW_SALT', 'LOW_SUGAR', 'HIGH_PROTEIN', 'HIGH_FIBRE', 'LIGHT_MEALS'] as const
export const DIET_LABEL: Record<DietType, string> = { VEGAN: 'vegan', VEGETARIAN: 'vegetarian', EGGETARIAN: 'eggetarian', NON_VEGETARIAN: 'non-vegetarian' }

// A person with diet X can eat a recipe whose diet ranks at or below X.
const DIET_RANK: Record<DietType, number> = { VEGAN: 0, VEGETARIAN: 1, EGGETARIAN: 2, NON_VEGETARIAN: 3 }
const CLASS_DIET: Record<DietClass, DietType> = { PLANT: 'VEGAN', DAIRY: 'VEGETARIAN', EGG: 'EGGETARIAN', MEAT: 'NON_VEGETARIAN', SEAFOOD: 'NON_VEGETARIAN' }

export type FoodIngredient = { id: string; name: string; dietClass: DietClass | null; allergens: Allergen[]; allergensReviewed: boolean }
export type MemberNeeds = { id?: string; name: string; dietType: DietType | null; allergens: Allergen[]; avoidIngredientIds: string[] }
export type Conflict = { member: string; kind: 'ALLERGY' | 'RESTRICTION'; reason: string }
export type SafetyStatus = 'SUITABLE' | 'CONFLICT' | 'UNKNOWN'
export type RecipeSafety = {
  /** Null when an unclassified ingredient leaves it open. */
  dietType: DietType | null
  allergens: Allergen[]
  /** Ingredients whose allergens nobody has checked yet. */
  unreviewed: string[]
  status: SafetyStatus
  conflicts: Conflict[]
  /** Why the status is UNKNOWN, in plain words. */
  uncertain: string[]
}

/** The strictest diet that can still eat every ingredient. A meat or fish ingredient settles it even if others are unclassified. */
export function recipeDiet(ingredients: FoodIngredient[]): DietType | null {
  let rank = 0
  let unclassified = false
  for (const ingredient of ingredients) {
    if (!ingredient.dietClass) { unclassified = true; continue }
    rank = Math.max(rank, DIET_RANK[CLASS_DIET[ingredient.dietClass]])
  }
  if (rank === DIET_RANK.NON_VEGETARIAN) return 'NON_VEGETARIAN'
  if (unclassified) return null
  return (Object.keys(DIET_RANK) as DietType[]).find(diet => DIET_RANK[diet] === rank)!
}

export function assessRecipe(ingredients: FoodIngredient[], members: MemberNeeds[]): RecipeSafety {
  const dietType = recipeDiet(ingredients)
  const allergens = [...new Set(ingredients.flatMap(ingredient => ingredient.allergens))].sort()
  const unreviewed = ingredients.filter(ingredient => !ingredient.allergensReviewed).map(ingredient => ingredient.name)
  const conflicts: Conflict[] = []
  const uncertain = new Set<string>()

  for (const member of members) {
    for (const allergen of member.allergens) {
      if (allergens.includes(allergen)) conflicts.push({ member: member.name, kind: 'ALLERGY', reason: `Contains ${ALLERGEN_LABEL[allergen]}` })
    }
    if (member.allergens.length && unreviewed.length) uncertain.add(`Allergens not checked for ${unreviewed.join(', ')}`)
    for (const ingredient of ingredients) {
      if (member.avoidIngredientIds.includes(ingredient.id)) conflicts.push({ member: member.name, kind: 'RESTRICTION', reason: `Contains ${ingredient.name}` })
    }
    if (member.dietType && member.dietType !== 'NON_VEGETARIAN') {
      if (dietType === null) uncertain.add('Some ingredients are not classified as veg or non-veg')
      else if (DIET_RANK[dietType] > DIET_RANK[member.dietType]) conflicts.push({ member: member.name, kind: 'RESTRICTION', reason: `Not ${DIET_LABEL[member.dietType]}` })
    }
  }

  const status: SafetyStatus = conflicts.length ? 'CONFLICT' : uncertain.size ? 'UNKNOWN' : 'SUITABLE'
  return { dietType, allergens, unreviewed, status, conflicts, uncertain: [...uncertain] }
}
