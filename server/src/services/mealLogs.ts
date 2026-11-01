import { Prisma, type NutritionMealSlot } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { AppError } from '../lib/errors.js'
import { recipeNutrition } from './nutrition.js'

export async function createMealLog(userId: string, input: { recipeId: string; mealSlot: NutritionMealSlot; servings: number; loggedAt?: Date }) {
  const membership = await prisma.householdMember.findFirst({ where: { userId }, select: { householdId: true } })
  if (!membership) throw new AppError(400, 'Join a household first.')
  const recipe = await prisma.recipe.findFirst({ where: { id: input.recipeId, OR: [{ isShared: true }, { householdId: membership.householdId }] }, select: { id: true, baseServings: true } })
  if (!recipe) throw new AppError(404, 'Recipe not found.')
  const n = await recipeNutrition(recipe.id, input.servings)
  return prisma.mealLog.create({ data: { userId, recipeId: recipe.id, mealSlot: input.mealSlot, servings: new Prisma.Decimal(input.servings), source: 'MANUAL', calories: n.calories, proteinG: n.proteinG, carbsG: n.carbsG, fatG: n.fatG, fibreG: n.fibreG, loggedAt: input.loggedAt ?? new Date() } })
}

export async function updateMealLog(userId: string, id: string, input: { servings: number; mealSlot: NutritionMealSlot }) {
  const log = await prisma.mealLog.findFirst({ where: { id, userId } })
  if (!log) throw new AppError(404, 'Meal log not found.')
  if (!log.recipeId) throw new AppError(400, 'This meal has no linked recipe.')
  const n = await recipeNutrition(log.recipeId, input.servings)
  return prisma.mealLog.update({ where: { id }, data: { servings: input.servings, mealSlot: input.mealSlot, calories: n.calories, proteinG: n.proteinG, carbsG: n.carbsG, fatG: n.fatG, fibreG: n.fibreG } })
}

export async function consumePlannedMeal(householdId: string, plannedMealId: string, actorUserId: string, portions: Array<{ userId: string; servings: number }>) {
  const meal = await prisma.plannedMeal.findFirst({ where: { id: plannedMealId, mealPlan: { householdId }, status: { not: 'CANCELLED' } }, include: { recipe: { select: { id: true } } } })
  if (!meal) throw new AppError(404, 'Planned meal not found.')
  const unique = new Map(portions.map(portion => [portion.userId, portion]))
  const members = await prisma.householdMember.findMany({ where: { householdId, userId: { in: [...unique.keys()] } }, select: { userId: true } })
  if (members.length !== unique.size) throw new AppError(400, 'Every consumer must be a member of this household.')
  const rows = await Promise.all([...unique.values()].map(async portion => {
    const n = await recipeNutrition(meal.recipe.id, portion.servings)
    return { userId: portion.userId, plannedMealId: meal.id, recipeId: meal.recipe.id, mealSlot: meal.slot, servings: new Prisma.Decimal(portion.servings), source: 'PLANNED' as const, calories: new Prisma.Decimal(n.calories), proteinG: new Prisma.Decimal(n.proteinG), carbsG: new Prisma.Decimal(n.carbsG), fatG: new Prisma.Decimal(n.fatG), fibreG: new Prisma.Decimal(n.fibreG), idempotencyKey: `consume:${meal.id}:${portion.userId}` }
  }))
  await prisma.mealLog.createMany({ data: rows, skipDuplicates: true })
  const logs = await prisma.mealLog.findMany({ where: { plannedMealId: meal.id, userId: { in: rows.map(row => row.userId) } }, orderBy: { userId: 'asc' } })
  return { plannedMealId: meal.id, recordedBy: actorUserId, logs: logs.map(serializeLog) }
}

export async function plannedMealConsumption(householdId: string, plannedMealId: string) {
  const meal = await prisma.plannedMeal.findFirst({ where: { id: plannedMealId, mealPlan: { householdId } }, select: { id: true } })
  if (!meal) throw new AppError(404, 'Planned meal not found.')
  const logs = await prisma.mealLog.findMany({ where: { plannedMealId }, include: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: 'asc' } } })
  return logs.map(log => ({ ...serializeLog(log), user: log.user }))
}

export function serializeLog(log: { id: string; userId: string; plannedMealId: string | null; recipeId: string | null; mealSlot: NutritionMealSlot; servings: Prisma.Decimal; source: string; calories: Prisma.Decimal; proteinG: Prisma.Decimal; carbsG: Prisma.Decimal; fatG: Prisma.Decimal; fibreG: Prisma.Decimal; loggedAt: Date }) {
  return { ...log, servings: log.servings.toString(), calories: log.calories.toString(), proteinG: log.proteinG.toString(), carbsG: log.carbsG.toString(), fatG: log.fatG.toString(), fibreG: log.fibreG.toString() }
}

export async function deleteMealLog(userId: string, id: string) {
  const result = await prisma.mealLog.deleteMany({ where: { id, userId } })
  if (!result.count) throw new AppError(404, 'Meal log not found.')
}

