import { Prisma, type ActivityLevel, type BiologicalSex, type NutritionGoal } from '@prisma/client'
import { AppError } from '../lib/errors.js'

export const NUTRITION_CALCULATION_VERSION = 'mifflin-st-jeor-v1'
export const RECIPE_NUTRITION_VERSION = 'ingredient-per-100-v1'

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value)
const activityMultipliers: Record<ActivityLevel, Prisma.Decimal> = {
  SEDENTARY: D('1.2'), LIGHT: D('1.375'), MODERATE: D('1.55'), VERY_ACTIVE: D('1.725'),
}

export type TargetInput = {
  ageYears: number
  biologicalSex: BiologicalSex
  heightCm: Prisma.Decimal.Value
  weightKg: Prisma.Decimal.Value
  activityLevel: ActivityLevel
  goal: NutritionGoal
  customCalorieTarget?: number | null
  customProteinTargetG?: Prisma.Decimal.Value | null
}

/** Mifflin-St Jeor using Decimal throughout. This is general wellness estimation, not medical advice. */
export function calculateTargets(input: TargetInput) {
  const height = D(input.heightCm)
  const weight = D(input.weightKg)
  const sexConstant = input.biologicalSex === 'MALE' ? D(5) : D(-161)
  const bmr = weight.mul(10).plus(height.mul('6.25')).minus(D(input.ageYears).mul(5)).plus(sexConstant)
  const tdee = bmr.mul(activityMultipliers[input.activityLevel])
  const adjusted = input.goal === 'FAT_LOSS' ? tdee.mul('0.85') : input.goal === 'MUSCLE_GAIN' ? tdee.mul('1.10') : tdee
  const safeFloor = input.biologicalSex === 'MALE' ? D(1500) : D(1200)
  const calculatedCalories = Prisma.Decimal.max(adjusted, safeFloor).toDecimalPlaces(0)
  const calories = input.customCalorieTarget ? D(input.customCalorieTarget) : calculatedCalories
  if (calories.lessThan(safeFloor)) throw new AppError(400, `Calorie target must be at least ${safeFloor.toString()} kcal.`)

  const proteinFactor = input.goal === 'MUSCLE_GAIN' ? D('1.6') : input.goal === 'FAT_LOSS' ? D('1.4') : D('1.2')
  const protein = input.customProteinTargetG != null ? D(input.customProteinTargetG) : weight.mul(proteinFactor)
  const fat = calories.mul('0.25').div(9)
  const carbs = Prisma.Decimal.max(calories.minus(protein.mul(4)).minus(fat.mul(9)).div(4), 0)
  return {
    bmr: bmr.toDecimalPlaces(0), tdee: tdee.toDecimalPlaces(0), calorieTarget: calories.toDecimalPlaces(0).toNumber(),
    proteinTargetG: protein.toDecimalPlaces(2), carbsTargetG: carbs.toDecimalPlaces(2), fatTargetG: fat.toDecimalPlaces(2),
    calculationVersion: NUTRITION_CALCULATION_VERSION,
    explanation: 'Mifflin-St Jeor BMR, multiplied by activity level; goal adjustment is 15% below TDEE for fat loss or 10% above for muscle gain. Fat is 25% of calories and remaining energy is assigned to carbohydrates.',
  }
}

type NutritionRow = { caloriesPer100: Prisma.Decimal; proteinG: Prisma.Decimal; carbsG: Prisma.Decimal; fatG: Prisma.Decimal; fibreG: Prisma.Decimal; source: string; sourceReference: string }
type RecipeLine = { quantity: Prisma.Decimal; ingredient: { name: string; canonicalUnit: string; nutrition: NutritionRow | null } }

export function calculateRecipeNutrition(lines: RecipeLine[], baseServings: number, servings = baseServings) {
  if (baseServings <= 0 || servings <= 0) throw new AppError(400, 'Servings must be greater than zero.')
  const missing = lines.filter(line => !line.ingredient.nutrition).map(line => line.ingredient.name)
  const known = lines.filter((line): line is RecipeLine & { ingredient: RecipeLine['ingredient'] & { nutrition: NutritionRow } } => Boolean(line.ingredient.nutrition))
  const totals = known.reduce((sum, line) => {
    if (!['g', 'ml', 'count'].includes(line.ingredient.canonicalUnit)) throw new AppError(400, `Unsupported unit for ${line.ingredient.name}.`)
    const factor = line.quantity.div(100).mul(D(servings).div(baseServings))
    const n = line.ingredient.nutrition
    return {
      calories: sum.calories.plus(n.caloriesPer100.mul(factor)), proteinG: sum.proteinG.plus(n.proteinG.mul(factor)),
      carbsG: sum.carbsG.plus(n.carbsG.mul(factor)), fatG: sum.fatG.plus(n.fatG.mul(factor)), fibreG: sum.fibreG.plus(n.fibreG.mul(factor)),
    }
  }, { calories: D(0), proteinG: D(0), carbsG: D(0), fatG: D(0), fibreG: D(0) })
  const completeness = lines.length ? D(known.length).div(lines.length) : D(0)
  return {
    ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value.toDecimalPlaces(2)])) as typeof totals,
    completeness: completeness.toDecimalPlaces(4), missingIngredients: missing,
    sources: [...new Map(known.map(line => [line.ingredient.nutrition.sourceReference, { source: line.ingredient.nutrition.source, reference: line.ingredient.nutrition.sourceReference }])).values()],
    explanation: missing.length ? 'Totals include only ingredients with verified nutrition data; missing ingredients are not treated as zero.' : 'Totals are calculated from each ingredient per 100 canonical units and scaled to servings.',
  }
}

