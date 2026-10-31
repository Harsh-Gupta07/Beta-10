import { Prisma, type MealSlot } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { AppError } from '../lib/errors.js'
import { recipeNutrition } from './nutrition.js'

export async function createMealLog(userId: string, input: { recipeId: string; mealSlot: MealSlot; servings: number; loggedAt?: Date }) {
  const membership = await prisma.householdMember.findFirst({ where: { userId }, select: { householdId: true } })
  if (!membership) throw new AppError(400, 'Join a household first.')
  const recipe = await prisma.recipe.findFirst({ where: { id: input.recipeId, OR: [{ isShared: true }, { householdId: membership.householdId }] }, select: { id: true, baseServings: true } })
  if (!recipe) throw new AppError(404, 'Recipe not found.')
  const n = await recipeNutrition(recipe.id, input.servings)
  return prisma.mealLog.create({ data: { userId, recipeId: recipe.id, mealSlot: input.mealSlot, servings: new Prisma.Decimal(input.servings), source: 'MANUAL', calories: n.calories, proteinG: n.proteinG, carbsG: n.carbsG, fatG: n.fatG, fibreG: n.fibreG, loggedAt: input.loggedAt ?? new Date() } })
}

export async function updateMealLog(userId: string, id: string, input: { servings: number; mealSlot: MealSlot }) {
  const log = await prisma.mealLog.findFirst({ where: { id, userId } })
  if (!log) throw new AppError(404, 'Meal log not found.')
  if (!log.recipeId) throw new AppError(400, 'This meal has no linked recipe.')
  const n = await recipeNutrition(log.recipeId, input.servings)
  return prisma.mealLog.update({ where: { id }, data: { servings: input.servings, mealSlot: input.mealSlot, calories: n.calories, proteinG: n.proteinG, carbsG: n.carbsG, fatG: n.fatG, fibreG: n.fibreG } })
}

export async function deleteMealLog(userId: string, id: string) {
  const result = await prisma.mealLog.deleteMany({ where: { id, userId } })
  if (!result.count) throw new AppError(404, 'Meal log not found.')
}

