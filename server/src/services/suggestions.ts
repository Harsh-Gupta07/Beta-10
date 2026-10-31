import type { MealSlot } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/errors.js'
import { addDays } from './dates.js'
import { daysBetween, eatenMeals } from './eatingHistory.js'
import { householdNeeds } from './foodPreferences.js'
import { kitchenOutlook } from './planner.js'
import { listRecipes, visibleTo } from './recipes.js'
import { rankRecipes, type Candidate } from './recommend.js'

/** "Not today" hides a dish from suggestions for this long. */
export const SNOOZE_DAYS = 3

export type SuggestionOptions = { slot: MealSlot | null; scope: 'household' | 'me'; limit: number }

/** Ranked dishes to cook next, for the whole household or just the signed-in member. */
export async function getSuggestions(householdId: string, userId: string, options: SuggestionOptions) {
  const [outlook, history, allNeeds, household] = await Promise.all([
    kitchenOutlook(householdId),
    eatenMeals(householdId),
    householdNeeds(householdId),
    prisma.householdFoodProfile.findUnique({ where: { householdId }, select: { cuisines: true } }),
  ])
  const needs = options.scope === 'me' ? allNeeds.filter(n => n.id === userId) : allNeeds
  const scopeIds = needs.map(n => n.id!)
  const [{ recipes }, prefs, profiles, snoozes] = await Promise.all([
    listRecipes(householdId, { stock: outlook.free, needs }),
    prisma.userRecipePref.findMany({ where: { userId: { in: scopeIds } }, select: { recipeId: true, kind: true, user: { select: { name: true } } } }),
    prisma.userFoodProfile.findMany({ where: { userId: { in: scopeIds } }, select: { maxSpice: true, cuisines: true, user: { select: { name: true } } } }),
    prisma.recommendationSnooze.findMany({ where: { householdId, until: { gt: new Date() } }, select: { until: true, recipe: { select: { id: true, name: true } } } }),
  ])

  // Only meals someone in scope actually ate count towards "recently eaten".
  const inScope = new Set(scopeIds)
  const eaten = history.meals.filter(meal => meal.eaters.some(e => inScope.has(e.id)))
  const soon = addDays(outlook.today, 6)
  const plannedSoon = new Set(outlook.upcoming.filter(m => m.date <= soon).map(m => m.recipeId))
  const snoozed = new Set(snoozes.map(s => s.recipe.id))

  const candidates: Candidate[] = recipes.filter(r => !snoozed.has(r.id)).map(r => {
    const mine = eaten.filter(meal => meal.recipe.id === r.id)
    const eatenInSlot: Candidate['eatenInSlot'] = {}
    for (const meal of mine) eatenInSlot[meal.slot] = (eatenInSlot[meal.slot] ?? 0) + 1
    return {
      id: r.id, name: r.name, category: r.category, cuisine: r.cuisine, spiceLevel: r.spiceLevel, tags: r.tags,
      safety: r.safety.status, minutes: r.prepMinutes + r.cookMinutes, missingCount: r.missingCount, ingredientCount: r.ingredientCount,
      lastEatenDaysAgo: mine.length ? daysBetween(mine[0]!.date, outlook.today) : null,
      timesEaten30: mine.filter(meal => daysBetween(meal.date, outlook.today) <= 30).length,
      eatenInSlot,
      plannedSoon: plannedSoon.has(r.id),
      favouriteOf: prefs.filter(p => p.recipeId === r.id && p.kind === 'FAVOURITE').map(p => p.user.name),
      dislikedBy: prefs.filter(p => p.recipeId === r.id && p.kind === 'DISLIKE').map(p => p.user.name),
    }
  })
  const cuisines = [...new Set([...(household?.cuisines ?? []), ...profiles.flatMap(p => p.cuisines)].map(c => c.toLowerCase()))]
  const spiceLimits = profiles.filter(p => p.maxSpice !== null).map(p => ({ name: p.user.name, max: p.maxSpice! }))
  const usualMinutes = (await prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { usualCookMinutes: true } })).usualCookMinutes
  const ranked = rankRecipes(candidates, { slot: options.slot, cuisines, spiceLimits, usualMinutes })

  const byId = new Map(recipes.map(r => [r.id, r]))
  return {
    today: outlook.today,
    scope: options.scope,
    slot: options.slot,
    hasHistory: eaten.length > 0,
    suggestions: ranked.slice(0, options.limit).map(({ id, score, reasons }) => {
      const r = byId.get(id)!
      return {
        score, reasons,
        recipe: { id: r.id, name: r.name, category: r.category, cuisine: r.cuisine, description: r.description, prepMinutes: r.prepMinutes, cookMinutes: r.cookMinutes,
          dietType: r.dietType, safety: r.safety, missingCount: r.missingCount, ingredientCount: r.ingredientCount },
      }
    }),
    /** Dishes left out because they clash with someone's allergy or diet. */
    excludedForSafety: recipes.filter(r => r.safety.status === 'CONFLICT').length,
    snoozed: snoozes.map(s => ({ recipe: s.recipe, until: s.until })),
  }
}

export async function snoozeRecipe(householdId: string, userId: string, recipeId: string) {
  const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, ...visibleTo(householdId) }, select: { id: true } })
  if (!recipe) throw notFound('Recipe')
  const until = new Date(Date.now() + SNOOZE_DAYS * 86_400_000)
  await prisma.recommendationSnooze.upsert({ where: { householdId_recipeId: { householdId, recipeId } }, update: { until, snoozedById: userId }, create: { householdId, recipeId, snoozedById: userId, until } })
  return { recipeId, until }
}

export async function unsnoozeRecipe(householdId: string, recipeId: string) {
  await prisma.recommendationSnooze.deleteMany({ where: { householdId, recipeId } })
}
