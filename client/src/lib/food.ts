import type { AgeGroup, Allergen, Appliance, DietClass, DietType, HealthGoal, KitchenRole, Weekday } from './api'

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

export const AGE_GROUP_LABEL: Record<AgeGroup, string> = { CHILD: 'Child (under 13)', TEEN: 'Teen (13–19)', ADULT: 'Adult', SENIOR: 'Senior (60+)' }
export const AGE_GROUPS = Object.keys(AGE_GROUP_LABEL) as AgeGroup[]
export const WEEKDAY_LABEL: Record<Weekday, string> = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' }
export const WEEKDAYS = Object.keys(WEEKDAY_LABEL) as Weekday[]
export const HEALTH_GOAL_LABEL: Record<HealthGoal, string> = {
  LOW_OIL: 'Less oil', LOW_SALT: 'Less salt', LOW_SUGAR: 'Less sugar / diabetic-friendly', HIGH_PROTEIN: 'More protein', HIGH_FIBRE: 'More fibre', LIGHT_MEALS: 'Light meals',
}
export const HEALTH_GOALS = Object.keys(HEALTH_GOAL_LABEL) as HealthGoal[]

export const APPLIANCE_LABEL: Record<Appliance, string> = {
  GAS_STOVE: 'Gas stove', INDUCTION: 'Induction', PRESSURE_COOKER: 'Pressure cooker', MIXER_GRINDER: 'Mixer grinder',
  MICROWAVE: 'Microwave', AIR_FRYER: 'Air fryer', OVEN: 'Oven',
}
export const APPLIANCES = Object.keys(APPLIANCE_LABEL) as Appliance[]
/** Choices for "how long do you usually have to cook?" in minutes. */
export const COOK_TIMES = [15, 30, 45, 60, 90] as const
export const CUISINE_OPTIONS = ['North Indian', 'Punjabi', 'South Indian', 'Gujarati', 'Maharashtrian', 'Bengali', 'Rajasthani', 'Indo-Chinese', 'Continental'] as const

export const KITCHEN_ROLE_LABEL: Record<KitchenRole, string> = { PLANNER: 'Plans meals', COOK: 'Cooks', SHOPPER: 'Brings groceries', STOCK_CHECKER: 'Checks stock' }
export const KITCHEN_ROLES = Object.keys(KITCHEN_ROLE_LABEL) as KitchenRole[]
