import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { listRecipes } from './recipes.js'
import { recipeNutrition, today } from './nutrition.js'

export async function recommendations(householdId: string, userId: string, filters: { highProtein?: boolean; maxCalories?: number; ready?: boolean; quick?: boolean }) {
  const [recipes, progress, pantry] = await Promise.all([listRecipes(householdId), today(userId), prisma.pantryItem.findMany({ where: { householdId }, select: { ingredientId: true, expiresAt: true } })])
  const expiring = new Set(pantry.filter(p => p.expiresAt && p.expiresAt <= new Date(Date.now() + 3 * 86400000)).map(p => p.ingredientId))
  const rows = await Promise.all(recipes.recipes.filter(r => r.safety.status !== 'CONFLICT').map(async recipe => {
    const n = await recipeNutrition(recipe.id)
    const lines = await prisma.recipeIngredient.findMany({ where: { recipeId: recipe.id }, select: { ingredientId: true } })
    const usesExpiring = lines.some(line => expiring.has(line.ingredientId))
    const protein = new Prisma.Decimal(n.proteinG); const calories = new Prisma.Decimal(n.calories)
    let score = 100 - recipe.missingCount * 18 + protein.toNumber() + (usesExpiring ? 15 : 0) - Math.max(0, recipe.prepMinutes + recipe.cookMinutes - 30) / 3
    const reasons = [recipe.missingCount === 0 ? 'Ready with your unreserved pantry stock.' : `${recipe.missingCount} ingredient${recipe.missingCount === 1 ? '' : 's'} missing.`, `${protein.toDecimalPlaces(1)} g protein and ${calories.toDecimalPlaces(0)} kcal per serving.`]
    if (usesExpiring) reasons.unshift('Uses an ingredient that expires soon.')
    return { score, recipe, nutrition: n, pantryCoverage: recipe.ingredientCount ? Math.round((recipe.ingredientCount - recipe.missingCount) / recipe.ingredientCount * 100) : 0, reasons }
  }))
  return { remaining: progress.remaining, recommendations: rows.filter(r => !filters.highProtein || Number(r.nutrition.proteinG) >= 20).filter(r => !filters.maxCalories || Number(r.nutrition.calories) <= filters.maxCalories).filter(r => !filters.ready || r.recipe.missingCount === 0).filter(r => !filters.quick || r.recipe.prepMinutes + r.recipe.cookMinutes <= 30).sort((a, b) => b.score - a.score).slice(0, 12) }
}

