import { Prisma, type ActivityLevel, type BiologicalSex, type NutritionGoal, type Weekday } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/errors.js'
import { calculateRecipeNutrition, calculateTargets, RECIPE_NUTRITION_VERSION } from './nutritionEngine.js'

export type ProfileInput = {
  ageYears: number; biologicalSex: BiologicalSex; heightCm: string | number; weightKg: string | number
  activityLevel: ActivityLevel; goal: NutritionGoal; workoutDays: Weekday[]; dailyMealCount: number
  preferredCuisines: string[]; customCalorieTarget?: number | null; customProteinTargetG?: string | number | null; consent: true
}

const profileOutput = (profile: NonNullable<Awaited<ReturnType<typeof prisma.nutritionProfile.findUnique>>>) => ({
  ...profile, heightCm: profile.heightCm.toString(), weightKg: profile.weightKg.toString(), proteinTargetG: profile.proteinTargetG.toString(),
  carbsTargetG: profile.carbsTargetG.toString(), fatTargetG: profile.fatTargetG.toString(), customProteinTargetG: profile.customProteinTargetG?.toString() ?? null,
})

export async function getProfile(userId: string) {
  const profile = await prisma.nutritionProfile.findUnique({ where: { userId } })
  return profile ? profileOutput(profile) : null
}

export async function saveProfile(userId: string, input: ProfileInput) {
  const targets = calculateTargets(input)
  const data = {
    ageYears: input.ageYears, biologicalSex: input.biologicalSex, heightCm: new Prisma.Decimal(input.heightCm), weightKg: new Prisma.Decimal(input.weightKg),
    activityLevel: input.activityLevel, goal: input.goal, workoutDays: [...new Set(input.workoutDays)], dailyMealCount: input.dailyMealCount,
    preferredCuisines: [...new Set(input.preferredCuisines.map(v => v.trim()).filter(Boolean))], calorieTarget: targets.calorieTarget,
    proteinTargetG: targets.proteinTargetG, carbsTargetG: targets.carbsTargetG, fatTargetG: targets.fatTargetG,
    customCalorieTarget: input.customCalorieTarget ?? null, customProteinTargetG: input.customProteinTargetG == null ? null : new Prisma.Decimal(input.customProteinTargetG),
    calculationVersion: targets.calculationVersion,
  }
  const profile = await prisma.nutritionProfile.upsert({
    where: { userId }, update: data, create: { userId, ...data, consentGivenAt: new Date() },
  })
  return { profile: profileOutput(profile), calculation: { bmr: targets.bmr.toString(), tdee: targets.tdee.toString(), explanation: targets.explanation } }
}

export async function deleteProfile(userId: string) {
  await prisma.nutritionProfile.deleteMany({ where: { userId } })
}

export async function recipeNutrition(recipeId: string, servings?: number) {
  const recipe = await prisma.recipe.findUnique({ where: { id: recipeId }, include: { ingredients: { include: { ingredient: { include: { nutrition: true } } } } } })
  if (!recipe) throw notFound('Recipe')
  const result = calculateRecipeNutrition(recipe.ingredients, recipe.baseServings, servings ?? recipe.baseServings)
  if (!servings || servings === recipe.baseServings) {
    const stored = {
      calories: result.calories, proteinG: result.proteinG, carbsG: result.carbsG, fatG: result.fatG, fibreG: result.fibreG,
      completeness: result.completeness, missingIngredients: result.missingIngredients, nutritionVersion: RECIPE_NUTRITION_VERSION,
    }
    await prisma.recipeNutrition.upsert({
      where: { recipeId }, update: { ...stored, calculatedAt: new Date() },
      create: { recipeId, ...stored },
    })
  }
  return { ...result, calories: result.calories.toString(), proteinG: result.proteinG.toString(), carbsG: result.carbsG.toString(), fatG: result.fatG.toString(), fibreG: result.fibreG.toString(), completeness: result.completeness.toString(), servings: servings ?? recipe.baseServings }
}

export async function today(userId: string, now = new Date()) {
  const profile = await prisma.nutritionProfile.findUnique({ where: { userId } })
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + 1)
  const logs = await prisma.mealLog.findMany({ where: { userId, loggedAt: { gte: start, lt: end } }, include: { recipe: { select: { id: true, name: true } } }, orderBy: { loggedAt: 'asc' } })
  const consumed = logs.reduce((sum, log) => ({ calories: sum.calories.plus(log.calories), proteinG: sum.proteinG.plus(log.proteinG), carbsG: sum.carbsG.plus(log.carbsG), fatG: sum.fatG.plus(log.fatG) }), { calories: new Prisma.Decimal(0), proteinG: new Prisma.Decimal(0), carbsG: new Prisma.Decimal(0), fatG: new Prisma.Decimal(0) })
  const targets = profile ? { calories: new Prisma.Decimal(profile.calorieTarget), proteinG: profile.proteinTargetG, carbsG: profile.carbsTargetG, fatG: profile.fatTargetG } : null
  const serial = (v: Record<string, Prisma.Decimal>) => Object.fromEntries(Object.entries(v).map(([k, n]) => [k, n.toDecimalPlaces(2).toString()]))
  const membership = await prisma.householdMember.findFirst({ where: { userId }, select: { householdId: true } })
  const plannedMeals = membership ? await prisma.plannedMeal.findMany({ where: { mealPlan: { householdId: membership.householdId }, date: start, status: { in: ['PLANNED', 'COOKING', 'COMPLETED'] } }, include: { recipe: { select: { id: true, name: true } } }, orderBy: { slot: 'asc' } }) : []
  const plannedRows = await Promise.all(plannedMeals.map(async meal => ({ id: meal.id, slot: meal.slot, recipe: meal.recipe, nutrition: await recipeNutrition(meal.recipe.id, 1), consumed: logs.some(log => log.plannedMealId === meal.id) })))
  const planned = plannedRows.filter(row => !row.consumed).reduce((sum, row) => ({ calories: sum.calories.plus(row.nutrition.calories), proteinG: sum.proteinG.plus(row.nutrition.proteinG), carbsG: sum.carbsG.plus(row.nutrition.carbsG), fatG: sum.fatG.plus(row.nutrition.fatG) }), { calories: new Prisma.Decimal(0), proteinG: new Prisma.Decimal(0), carbsG: new Prisma.Decimal(0), fatG: new Prisma.Decimal(0) })
  return { date: start.toISOString().slice(0, 10), profile: profile ? profileOutput(profile) : null, consumed: serial(consumed), planned: serial(planned), remaining: targets ? serial(Object.fromEntries(Object.entries(targets).map(([k, n]) => [k, Prisma.Decimal.max(n.minus(consumed[k as keyof typeof consumed]), 0)]))) : null, timeline: { planned: plannedRows, consumed: logs.map(log => ({ ...log, servings: log.servings.toString(), calories: log.calories.toString(), proteinG: log.proteinG.toString(), carbsG: log.carbsG.toString(), fatG: log.fatG.toString(), fibreG: log.fibreG.toString() })) } }
}

export async function history(userId: string, days = 7, now = new Date()) {
  const end = new Date(now); end.setHours(23, 59, 59, 999)
  const start = new Date(end); start.setDate(start.getDate() - days + 1); start.setHours(0, 0, 0, 0)
  const logs = await prisma.mealLog.findMany({ where: { userId, loggedAt: { gte: start, lte: end } }, orderBy: { loggedAt: 'asc' } })
  const byDate = new Map<string, { calories: Prisma.Decimal; proteinG: Prisma.Decimal; carbsG: Prisma.Decimal; fatG: Prisma.Decimal }>()
  for (let i = 0; i < days; i++) { const d = new Date(start); d.setDate(d.getDate() + i); byDate.set(d.toISOString().slice(0, 10), { calories: new Prisma.Decimal(0), proteinG: new Prisma.Decimal(0), carbsG: new Prisma.Decimal(0), fatG: new Prisma.Decimal(0) }) }
  for (const log of logs) { const key = log.loggedAt.toISOString().slice(0, 10); const row = byDate.get(key); if (row) { row.calories = row.calories.plus(log.calories); row.proteinG = row.proteinG.plus(log.proteinG); row.carbsG = row.carbsG.plus(log.carbsG); row.fatG = row.fatG.plus(log.fatG) } }
  return { days: [...byDate].map(([date, values]) => ({ date, ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.toDecimalPlaces(2).toString()])) })) }
}

