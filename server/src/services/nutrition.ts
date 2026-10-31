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
  const logs = await prisma.mealLog.findMany({ where: { userId, loggedAt: { gte: start, lt: end } }, orderBy: { loggedAt: 'asc' } })
  const consumed = logs.reduce((sum, log) => ({ calories: sum.calories.plus(log.calories), proteinG: sum.proteinG.plus(log.proteinG), carbsG: sum.carbsG.plus(log.carbsG), fatG: sum.fatG.plus(log.fatG) }), { calories: new Prisma.Decimal(0), proteinG: new Prisma.Decimal(0), carbsG: new Prisma.Decimal(0), fatG: new Prisma.Decimal(0) })
  const targets = profile ? { calories: new Prisma.Decimal(profile.calorieTarget), proteinG: profile.proteinTargetG, carbsG: profile.carbsTargetG, fatG: profile.fatTargetG } : null
  const serial = (v: Record<string, Prisma.Decimal>) => Object.fromEntries(Object.entries(v).map(([k, n]) => [k, n.toDecimalPlaces(2).toString()]))
  return { date: start.toISOString().slice(0, 10), profile: profile ? profileOutput(profile) : null, consumed: serial(consumed), remaining: targets ? serial(Object.fromEntries(Object.entries(targets).map(([k, n]) => [k, Prisma.Decimal.max(n.minus(consumed[k as keyof typeof consumed]), 0)]))) : null, logs: logs.map(log => ({ ...log, servings: log.servings.toString(), calories: log.calories.toString(), proteinG: log.proteinG.toString(), carbsG: log.carbsG.toString(), fatG: log.fatG.toString(), fibreG: log.fibreG.toString() })) }
}

