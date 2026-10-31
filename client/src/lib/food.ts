import type { Allergen, DietClass, DietType } from './api'

export const ALLERGEN_LABEL: Record<Allergen, string> = {
  MILK: 'Milk', EGG: 'Egg', PEANUT: 'Peanut', TREE_NUT: 'Tree nuts', GLUTEN: 'Gluten',
  SOY: 'Soy', SESAME: 'Sesame', FISH: 'Fish', SHELLFISH: 'Shellfish', MUSTARD: 'Mustard',
}
export const ALLERGENS = Object.keys(ALLERGEN_LABEL) as Allergen[]

export const DIET_LABEL: Record<DietType, string> = { VEGAN: 'Vegan', VEGETARIAN: 'Vegetarian', EGGETARIAN: 'Eggetarian', NON_VEGETARIAN: 'Non-veg' }
export const DIET_HINT: Record<DietType, string> = {
  VEGAN: 'No dairy, egg, meat or fish',
  VEGETARIAN: 'Dairy is fine; no egg, meat or fish',
  EGGETARIAN: 'Vegetarian plus eggs',
  NON_VEGETARIAN: 'Eats everything',
}
export const DIET_TYPES = Object.keys(DIET_LABEL) as DietType[]

export const DIET_CLASS_LABEL: Record<DietClass, string> = { PLANT: 'Plant', DAIRY: 'Dairy', EGG: 'Egg', MEAT: 'Meat', SEAFOOD: 'Fish / seafood' }

export const SPICE_LABEL = ['', 'Mild', 'Gentle', 'Medium', 'Hot', 'Very hot'] as const
