import { Prisma } from '@prisma/client'
import { env } from '../config/env.js'
import { prisma } from '../lib/prisma.js'
import { AppError } from '../lib/errors.js'
import { addDays, toDbDate, weekStartOf } from './dates.js'
import { listRecipes } from './recipes.js'
import { recipeNutrition } from './nutrition.js'

type Candidate = { id: string; name: string; proteinG: string; calories: string; missingCount: number; minutes: number }

async function aiOrder(candidates: Candidate[], context: { goal: string; workoutDays: string[]; cuisines: string[] }) {
  if (!env.AI_API_KEY) return null
  try {
    const response = await fetch(`${env.AI_API_BASE_URL}/models/${encodeURIComponent(env.AI_MODEL)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.AI_API_KEY }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `Order these already safety-validated recipes for a 7-day Indian home diet plan. Prefer pantry coverage, protein and variety for ${context.goal}. Workout days: ${context.workoutDays.join(',')}. Preferred cuisines: ${context.cuisines.join(',')}. Return JSON only: {"recipeIds":[string]}. Candidates: ${JSON.stringify(candidates)}` }] }], generationConfig: { temperature: .2, responseMimeType: 'application/json' } }) })
    if (!response.ok) return null
    const body = await response.json() as any; const text = body.candidates?.[0]?.content?.parts?.find((part: any) => part.text)?.text
    const ids = text ? JSON.parse(text).recipeIds : null
    return Array.isArray(ids) ? ids.filter((id: unknown): id is string => typeof id === 'string' && candidates.some(candidate => candidate.id === id)) : null
  } catch { return null }
}

export async function preview(userId: string, input: { startDate: string; maxCookMinutes: number }) {
  const [profile, membership] = await Promise.all([prisma.nutritionProfile.findUnique({ where: { userId } }), prisma.householdMember.findFirst({ where: { userId }, select: { householdId: true } })])
  if (!profile || !membership) throw new AppError(400, 'Create a fitness profile and join a household first.')
  const listed = await listRecipes(membership.householdId)
  const safe = listed.recipes.filter(recipe => recipe.safety.status === 'SUITABLE' && recipe.prepMinutes + recipe.cookMinutes <= input.maxCookMinutes)
  const candidates = (await Promise.all(safe.map(async recipe => { const n = await recipeNutrition(recipe.id, 1); return { id: recipe.id, name: recipe.name, proteinG: n.proteinG, calories: n.calories, missingCount: recipe.missingCount, minutes: recipe.prepMinutes + recipe.cookMinutes, completeness: Number(n.completeness) } }))).filter(recipe => recipe.completeness > 0)
    .sort((a, b) => a.missingCount - b.missingCount || Number(b.proteinG) - Number(a.proteinG))
  if (!candidates.length) throw new AppError(409, 'No safe recipes with nutrition data match that cooking time.')
  const orderedIds = await aiOrder(candidates, { goal: profile.goal, workoutDays: profile.workoutDays, cuisines: profile.preferredCuisines })
  const ordered = [...(orderedIds ?? []).map(id => candidates.find(candidate => candidate.id === id)!).filter(Boolean), ...candidates.filter(candidate => !orderedIds?.includes(candidate.id))]
  const start = weekStartOf(input.startDate); const slots = ['BREAKFAST', 'LUNCH', 'DINNER'] as const
  const meals = Array.from({ length: 21 }, (_, index) => { const recipe = ordered[index % ordered.length]!; return { date: addDays(start, Math.floor(index / 3)), slot: slots[index % 3]!, recipeId: recipe.id, recipeName: recipe.name, calories: recipe.calories, proteinG: recipe.proteinG, pantryCovered: recipe.missingCount === 0, missingCount: recipe.missingCount } })
  const days = Array.from({ length: 7 }, (_, day) => { const date = addDays(start, day); const rows = meals.filter(meal => meal.date === date); return { date, workoutDay: profile.workoutDays.includes(['SUN','MON','TUE','WED','THU','FRI','SAT'][new Date(`${date}T12:00:00Z`).getUTCDay()] as any), calories: rows.reduce((sum, row) => sum + Number(row.calories), 0).toFixed(0), proteinG: rows.reduce((sum, row) => sum + Number(row.proteinG), 0).toFixed(1), meals: rows } })
  const proposal = { generatedBy: orderedIds?.length ? 'ai-assisted-validated' : 'deterministic-fallback', target: { calories: profile.calorieTarget, proteinG: profile.proteinTargetG.toString() }, days }
  const plan = await prisma.dietPlan.create({ data: { userId, householdId: membership.householdId, weekStart: toDbDate(start), proposal } })
  return { id: plan.id, ...proposal }
}

export async function confirm(userId: string, planId: string) {
  const plan = await prisma.dietPlan.findFirst({ where: { id: planId, userId, status: 'DRAFT' } })
  if (!plan) throw new AppError(404, 'Diet-plan preview not found.')
  const proposal = plan.proposal as any; const meals = proposal.days.flatMap((day: any) => day.meals)
  const allowed = new Set((await listRecipes(plan.householdId)).recipes.filter(recipe => recipe.safety.status === 'SUITABLE').map(recipe => recipe.id))
  if (meals.some((meal: any) => !allowed.has(meal.recipeId))) throw new AppError(409, 'A proposed recipe is no longer safe or available. Generate the plan again.')
  await prisma.$transaction(async tx => {
    for (const meal of meals) {
      const weekStart = toDbDate(weekStartOf(meal.date)); const mealPlan = await tx.mealPlan.upsert({ where: { householdId_weekStart: { householdId: plan.householdId, weekStart } }, update: {}, create: { householdId: plan.householdId, weekStart } })
      const conflict = await tx.plannedMeal.findFirst({ where: { mealPlanId: mealPlan.id, date: toDbDate(meal.date), slot: meal.slot, status: { not: 'CANCELLED' } } })
      if (conflict) throw new AppError(409, `${meal.slot.toLowerCase()} on ${meal.date} already has a meal.`)
      await tx.plannedMeal.deleteMany({ where: { mealPlanId: mealPlan.id, date: toDbDate(meal.date), slot: meal.slot, status: 'CANCELLED' } })
      await tx.plannedMeal.create({ data: { mealPlanId: mealPlan.id, recipeId: meal.recipeId, date: toDbDate(meal.date), slot: meal.slot, servings: 1 } })
    }
    await tx.dietPlan.update({ where: { id: plan.id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } })
  })
  return { id: plan.id, status: 'CONFIRMED', mealsAdded: meals.length }
}

