import { Prisma, type MealSlot } from '@prisma/client'
import { env } from '../config/env.js'
import { prisma } from '../lib/prisma.js'
import { AppError, notFound } from '../lib/errors.js'
import { fromDbDate, localToday } from './dates.js'
import { daysBetween } from './eatingHistory.js'
import { householdNeeds } from './foodPreferences.js'
import { assessRecipe, type FoodIngredient, type MemberNeeds } from './foodSafety.js'
import { kitchenOutlook } from './planner.js'
import { visibleTo } from './recipes.js'
import { getSuggestions } from './suggestions.js'
import { SWAPS } from './substitutions.js'
import { buildDraft, generateJson } from './assistant.js'
import { listIngredients } from './pantry.js'
import { EXPIRY_WARNING_DAYS, isCanonicalUnit, scaleQuantity, toCanonical, type CanonicalUnit } from './units.js'

// "Meal options": what the household could cook from its own recipes, sorted into three honest groups.
//   FULLY_AVAILABLE     every ingredient is in the pantry and not already reserved for a planned meal
//   NEEDS_SUBSTITUTION  something is short, but a safe swap that is in stock covers every gap
//   NEEDS_PURCHASE      something is short and has to be bought
// All quantities are exact arithmetic on unreserved stock. Nothing here changes data: planning, cooking,
// saving a swapped recipe and adding to the shopping list are separate actions the person confirms.

export type OptionStatus = 'FULLY_AVAILABLE' | 'NEEDS_SUBSTITUTION' | 'NEEDS_PURCHASE'
export const STATUS_ORDER: OptionStatus[] = ['FULLY_AVAILABLE', 'NEEDS_SUBSTITUTION', 'NEEDS_PURCHASE']

/** Extra ranking points on top of What to Cook's score, so the groups and "use it up" stock count. */
export const OPTION_WEIGHTS = { swapCovers: 15, usesExpiring: 8, maxExpiringBonus: 16 } as const

type Ref = { id: string; name: string }
type Amount = { quantity: string; unit: CanonicalUnit }

export type MealOption = {
  status: OptionStatus
  score: number
  recipe: { id: string; name: string; category: string; cuisine: string; description: string; prepMinutes: number; cookMinutes: number; custom: boolean }
  servings: number
  /** Ingredients fully covered by unreserved stock, out of all ingredients. */
  coverage: { inPantry: number; total: number; percent: number }
  /** Ingredients this dish would use that expire soon (or already have) in the pantry. */
  expiring: Array<{ ingredient: Ref; daysLeft: number; expired: boolean }>
  substitutions: Array<{ original: Ref & Amount; substitute: Ref & Amount; note: string }>
  /** What to buy for NEEDS_PURCHASE: the shortfall only, not the whole amount. */
  toBuy: Array<{ ingredient: Ref } & Amount & { swapAvailable: string | null }>
  safety: ReturnType<typeof assessRecipe>
  reasons: Array<{ tone: 'good' | 'warn'; text: string }>
}

export type OptionsQuery = { slot: MealSlot | null; scope: 'household' | 'me'; servings?: number; status?: OptionStatus; exclude: string[]; limit: number }

const lineSelect = { ingredient: { select: { id: true, name: true, nameKey: true, canonicalUnit: true, dietClass: true, allergens: true, allergensReviewed: true } } } as const
type Catalog = Map<string, { id: string; name: string; canonicalUnit: string } & FoodIngredient>

/** Which meal "now" is in the household's timezone: breakfast until 11, lunch until 4 pm, then dinner. */
export function currentSlot(timeZone: string, now = new Date()): MealSlot {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now))
  return hour < 11 ? 'BREAKFAST' : hour < 16 ? 'LUNCH' : 'DINNER'
}

const decimal = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value)
const canonical = (unit: string): CanonicalUnit => { if (!isCanonicalUnit(unit)) throw new Error(`Unsupported unit ${unit}`); return unit }

/**
 * Works out one recipe's status at `servings` against `free` (unreserved) stock.
 * Pure apart from its inputs, so the same pantry always gives the same answer.
 */
export function evaluateRecipe(
  recipe: { baseServings: number; ingredients: Array<{ quantity: Prisma.Decimal; ingredient: { id: string; name: string; nameKey: string; canonicalUnit: string } & FoodIngredient }> },
  servings: number, free: ReadonlyMap<string, Prisma.Decimal>, catalogByKey: Catalog, needs: MemberNeeds[],
) {
  const lines = recipe.ingredients.map(line => {
    const unit = canonical(line.ingredient.canonicalUnit)
    const need = scaleQuantity(line.quantity, recipe.baseServings, servings, unit)
    const have = free.get(line.ingredient.id) ?? decimal(0)
    return { ingredient: line.ingredient, unit, need, short: Prisma.Decimal.max(need.minus(have), 0) }
  })
  const inRecipe = new Set(lines.map(l => l.ingredient.id))
  const shortLines = lines.filter(l => l.short.greaterThan(0))

  // A swap must be in the same unit, have enough unreserved stock for the whole amount (stock it already
  // needs for this recipe, or for an earlier swap, is set aside first), and keep the dish safe for everyone.
  const usedBySwaps = new Map<string, Prisma.Decimal>()
  const swapFor = (line: (typeof lines)[number]) => {
    for (const swap of SWAPS[line.ingredient.nameKey] ?? []) {
      const sub = catalogByKey.get(swap.name)
      if (!sub || sub.canonicalUnit !== line.unit || inRecipe.has(sub.id)) continue
      const amount = line.unit === 'count' ? line.need.times(swap.ratio).toDecimalPlaces(0, Prisma.Decimal.ROUND_CEIL) : line.need.times(swap.ratio).toDecimalPlaces(3)
      const available = (free.get(sub.id) ?? decimal(0)).minus(usedBySwaps.get(sub.id) ?? 0)
      if (available.lessThan(amount)) continue
      const swapped = lines.map(l => l.ingredient.id === line.ingredient.id ? sub : l.ingredient)
      if (assessRecipe(swapped, needs).status === 'CONFLICT') continue
      return { sub, amount, note: swap.note }
    }
    return null
  }
  const swaps = shortLines.map(line => ({ line, swap: swapFor(line) }))
  // Reserve stock for the swaps in order, so two short lines can't both count on the same substitute.
  const substitutions: MealOption['substitutions'] = []
  for (const { line, swap } of swaps) {
    if (!swap) continue
    usedBySwaps.set(swap.sub.id, (usedBySwaps.get(swap.sub.id) ?? decimal(0)).plus(swap.amount))
    substitutions.push({
      original: { id: line.ingredient.id, name: line.ingredient.name, quantity: line.need.toString(), unit: line.unit },
      substitute: { id: swap.sub.id, name: swap.sub.name, quantity: swap.amount.toString(), unit: line.unit },
      note: swap.note,
    })
  }
  const allSwappable = shortLines.length > 0 && swaps.every(s => s.swap)
  const status: OptionStatus = shortLines.length === 0 ? 'FULLY_AVAILABLE' : allSwappable ? 'NEEDS_SUBSTITUTION' : 'NEEDS_PURCHASE'
  return {
    status, lines,
    substitutions: status === 'NEEDS_SUBSTITUTION' ? substitutions : [],
    toBuy: status === 'NEEDS_PURCHASE' ? swaps.map(({ line, swap }) => ({ ingredient: { id: line.ingredient.id, name: line.ingredient.name }, quantity: line.short.toString(), unit: line.unit, swapAvailable: swap ? swap.sub.name : null })) : [],
    coverage: { inPantry: lines.length - shortLines.length, total: lines.length, percent: lines.length ? Math.round(100 * (lines.length - shortLines.length) / lines.length) : 0 },
  }
}

async function loadCatalog(householdId: string): Promise<Catalog> {
  const rows = await prisma.ingredient.findMany({ where: { OR: [{ householdId: null }, { householdId }] }, select: { id: true, name: true, nameKey: true, canonicalUnit: true, dietClass: true, allergens: true, allergensReviewed: true, householdId: true } })
  // A household's own ingredient wins over a catalog one with the same name.
  rows.sort((a, b) => Number(a.householdId !== null) - Number(b.householdId !== null))
  return new Map(rows.map(row => [row.nameKey, row]))
}

export async function getMealOptions(householdId: string, userId: string, query: OptionsQuery) {
  const household = await prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { timezone: true, defaultServings: true } })
  const servings = query.servings ?? household.defaultServings
  const today = localToday(household.timezone)
  const [ranked, outlook, allNeeds, catalog, pantry, todayMeals] = await Promise.all([
    // What to Cook's ranking already handles safety, history, favourites, snoozes and cooking time.
    getSuggestions(householdId, userId, { slot: query.slot, scope: query.scope, limit: 500, servings }),
    kitchenOutlook(householdId),
    householdNeeds(householdId),
    loadCatalog(householdId),
    prisma.pantryItem.findMany({ where: { householdId, expiresAt: { not: null } }, select: { ingredientId: true, expiresAt: true, quantity: true } }),
    prisma.plannedMeal.findMany({ where: { mealPlan: { householdId }, date: new Date(`${today}T00:00:00.000Z`), status: { not: 'CANCELLED' } }, select: { id: true, slot: true, status: true, recipe: { select: { id: true, name: true } } } }),
  ])
  const needs = query.scope === 'me' ? allNeeds.filter(n => n.id === userId) : allNeeds
  const recipes = await prisma.recipe.findMany({ where: { id: { in: ranked.suggestions.map(s => s.recipe.id) }, ...visibleTo(householdId) }, select: { id: true, baseServings: true, householdId: true, ingredients: { select: { quantity: true, ...lineSelect } } } })
  const byId = new Map(recipes.map(r => [r.id, r]))

  const expiry = new Map(pantry.filter(p => p.quantity.greaterThan(0)).map(p => [p.ingredientId, daysBetween(today, fromDbDate(p.expiresAt!))]))
  const options: MealOption[] = ranked.suggestions.flatMap(suggestion => {
    const recipe = byId.get(suggestion.recipe.id)
    if (!recipe) return []
    const result = evaluateRecipe(recipe, servings, outlook.free, catalog, needs)
    const expiring = result.lines.flatMap(line => {
      const daysLeft = expiry.get(line.ingredient.id)
      return daysLeft !== undefined && daysLeft <= EXPIRY_WARNING_DAYS ? [{ ingredient: { id: line.ingredient.id, name: line.ingredient.name }, daysLeft, expired: daysLeft < 0 }] : []
    })
    const usable = expiring.filter(e => !e.expired)
    const reasons = suggestion.reasons.filter(r => !/^Ready with what you have$|^Missing \d+ of \d+ ingredients$/.test(r.text)).map(({ tone, text }) => ({ tone, text }))
    let score = suggestion.score
    if (result.status === 'NEEDS_SUBSTITUTION') { score += OPTION_WEIGHTS.swapCovers; reasons.unshift({ tone: 'good', text: `Ready with ${result.substitutions.length === 1 ? 'one swap' : `${result.substitutions.length} swaps`} from your pantry` }) }
    if (result.status === 'FULLY_AVAILABLE') reasons.unshift({ tone: 'good', text: 'Everything is in your pantry' })
    if (usable.length) {
      score += Math.min(OPTION_WEIGHTS.usesExpiring * usable.length, OPTION_WEIGHTS.maxExpiringBonus)
      reasons.push({ tone: 'good', text: `Uses up ${usable.map(e => `${e.ingredient.name} (${e.daysLeft === 0 ? 'expires today' : `${e.daysLeft} day${e.daysLeft === 1 ? '' : 's'} left`})`).join(', ')}` })
    }
    for (const e of expiring.filter(e => e.expired)) reasons.push({ tone: 'warn', text: `Your ${e.ingredient.name} is past its expiry date; check it before cooking` })
    const { recipe: r } = suggestion
    return [{
      status: result.status, score, servings,
      recipe: { id: r.id, name: r.name, category: r.category, cuisine: r.cuisine, description: r.description, prepMinutes: r.prepMinutes, cookMinutes: r.cookMinutes, custom: recipe.householdId !== null },
      coverage: result.coverage, expiring, substitutions: result.substitutions, toBuy: result.toBuy,
      safety: assessRecipe(recipe.ingredients.map(l => l.ingredient), needs), reasons,
    }]
  })

  // Best first; within the same score, the easier group first, then by name, so the order never jumps around.
  options.sort((a, b) => b.score - a.score || STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.recipe.name.localeCompare(b.recipe.name))
  const counts = Object.fromEntries(STATUS_ORDER.map(s => [s, options.filter(o => o.status === s).length])) as Record<OptionStatus, number>
  const pool = query.status ? options.filter(o => o.status === query.status) : options
  // "Regenerate" sends what is on screen; once every option has been shown, start again from the top.
  const exclude = new Set(query.exclude)
  const fresh = pool.filter(o => !exclude.has(o.recipe.id))
  const wrapped = exclude.size > 0 && fresh.length === 0 && pool.length > 0

  const slot = currentSlot(household.timezone)
  return {
    today, servings, scope: query.scope, slot: query.slot,
    counts, total: pool.length, wrapped,
    options: (wrapped ? pool : fresh).slice(0, query.limit),
    excludedForSafety: ranked.excludedForSafety,
    /** For "Cook now": the meal it would be planned for, and what is already planned today. */
    cookNow: { date: today, slot, planned: todayMeals.map(m => ({ mealId: m.id, slot: m.slot, status: m.status, recipe: m.recipe })) },
    /** Gemini ideas are an optional extra; everything above works without them. */
    aiAvailable: Boolean(env.AI_API_KEY),
  }
}

/**
 * A copy of a recipe with the chosen swaps applied, for the person to review and save as their own recipe.
 * It is returned as a draft only; nothing is saved here.
 */
export async function substitutedDraft(householdId: string, recipeId: string, servings: number, swaps: Array<{ originalId: string; substituteId: string }>) {
  const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, ...visibleTo(householdId) }, select: { name: true, category: true, description: true, cuisine: true, spiceLevel: true, tags: true, prepMinutes: true, cookMinutes: true, instructions: true, baseServings: true, ingredients: { select: { quantity: true, note: true, position: true, ...lineSelect }, orderBy: { position: 'asc' } } } })
  if (!recipe) throw notFound('Recipe')
  const catalog = await loadCatalog(householdId)
  const byId = new Map([...catalog.values()].map(i => [i.id, i]))
  const chosen = new Map(swaps.map(s => [s.originalId, s.substituteId]))
  const used: string[] = []
  const ingredients = recipe.ingredients.map(line => {
    const unit = canonical(line.ingredient.canonicalUnit)
    const quantity = scaleQuantity(line.quantity, recipe.baseServings, servings, unit)
    const substituteId = chosen.get(line.ingredient.id)
    if (!substituteId) return { ingredientId: line.ingredient.id, ingredientName: line.ingredient.name, quantity: quantity.toString(), unit: unit === 'count' ? 'pcs' as const : unit, note: line.note }
    const swap = (SWAPS[line.ingredient.nameKey] ?? []).find(s => catalog.get(s.name)?.id === substituteId)
    const sub = byId.get(substituteId)
    if (!swap || !sub) throw new AppError(400, `${line.ingredient.name} can’t be swapped for that ingredient.`)
    used.push(`${line.ingredient.name} → ${sub.name}`)
    const amount = unit === 'count' ? quantity.times(swap.ratio).toDecimalPlaces(0, Prisma.Decimal.ROUND_CEIL) : quantity.times(swap.ratio).toDecimalPlaces(3)
    return { ingredientId: sub.id, ingredientName: sub.name, quantity: amount.toString(), unit: unit === 'count' ? 'pcs' as const : unit, note: [`instead of ${line.ingredient.name}`, line.note].filter(Boolean).join('; ').slice(0, 80) }
  })
  if (used.length !== chosen.size) throw new AppError(400, 'Some of those swaps don’t belong to this recipe.')
  if (new Set(ingredients.map(i => i.ingredientId)).size !== ingredients.length) throw new AppError(400, 'That swap uses an ingredient the recipe already has.')
  const subNames = swaps.map(s => byId.get(s.substituteId)!.name)
  return {
    kind: 'SWAP' as const,
    name: `${recipe.name} (with ${subNames.join(' and ')})`.slice(0, 80),
    category: recipe.category, description: [recipe.description, `Swapped: ${used.join(', ')}.`].filter(Boolean).join(' ').slice(0, 500),
    cuisine: recipe.cuisine, spiceLevel: recipe.spiceLevel, tags: recipe.tags,
    baseServings: servings, prepMinutes: recipe.prepMinutes, cookMinutes: recipe.cookMinutes, instructions: recipe.instructions,
    ingredients, unresolved: [] as string[],
  }
}

const IDEAS_SCHEMA = {
  type: 'OBJECT', required: ['ideas'],
  properties: { ideas: { type: 'ARRAY', items: { type: 'OBJECT', required: ['name', 'ingredients', 'steps'], properties: {
    name: { type: 'STRING' }, description: { type: 'STRING' }, category: { type: 'STRING' },
    prep_minutes: { type: 'NUMBER' }, cook_minutes: { type: 'NUMBER' }, steps: { type: 'ARRAY', items: { type: 'STRING' } },
    ingredients: { type: 'ARRAY', items: { type: 'OBJECT', required: ['name', 'quantity', 'unit'], properties: { name: { type: 'STRING' }, quantity: { type: 'NUMBER' }, unit: { type: 'STRING' }, note: { type: 'STRING' } } } },
  } } } },
} as const

/**
 * Optional Gemini ideas: new dishes built around what is in the pantry, returned as AI drafts to review.
 * Gemini only sees ingredient names and amounts plus anonymous diet and allergy limits (no names, no health
 * details). Its quantities are re-checked here: ingredients are matched to the catalog, stock coverage and
 * safety are calculated by the same code as every other option, and unsafe ideas are dropped.
 */
export async function aiMealIdeas(householdId: string, userId: string, query: { servings?: number; slot: MealSlot | null; scope: 'household' | 'me' }) {
  const household = await prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { defaultServings: true, timezone: true } })
  const servings = query.servings ?? household.defaultServings
  const [outlook, allNeeds, ingredients, catalogByKey, existing] = await Promise.all([
    kitchenOutlook(householdId), householdNeeds(householdId), listIngredients(householdId), loadCatalog(householdId),
    prisma.recipe.findMany({ where: visibleTo(householdId), select: { name: true } }),
  ])
  const needs = query.scope === 'me' ? allNeeds.filter(n => n.id === userId) : allNeeds
  const names = new Map(ingredients.map(i => [i.id, i]))
  const stock = [...outlook.free].filter(([, q]) => q.greaterThan(0)).flatMap(([id, q]) => { const i = names.get(id); return i ? [`${i.name}: ${q.toString()} ${i.canonicalUnit === 'count' ? 'pcs' : i.canonicalUnit}`] : [] })
  if (!stock.length) throw new AppError(409, 'Your pantry has no free stock yet, so there is nothing to build ideas from. Add what you have first.')

  const strictest = needs.map(n => n.dietType).filter(Boolean)
  const allergens = [...new Set(needs.flatMap(n => n.allergens))]
  const avoid = [...new Set(needs.flatMap(n => n.avoidIngredientIds))].map(id => names.get(id)?.name).filter(Boolean)
  const prompt = [
    `Suggest 3 Indian home-cooked dishes for ${query.slot ? query.slot.toLowerCase() : 'a meal'}, each for ${servings} servings, using mainly this unreserved pantry stock:`,
    ...stock.map(s => `- ${s}`),
    `Diets to respect: ${strictest.length ? [...new Set(strictest)].join(', ').toLowerCase() : 'none stated'}. Allergens to avoid completely: ${allergens.length ? allergens.join(', ').toLowerCase() : 'none stated'}. Never use: ${avoid.length ? avoid.join(', ') : 'nothing stated'}.`,
    `Do not suggest these existing recipes: ${existing.map(r => r.name).join(', ')}.`,
    'Use ingredient names exactly as written above where possible. Give quantities for the whole dish in g, kg, ml, l or pcs only. Steps: short, one action each.',
  ].join('\n')
  const system = 'You are a careful Indian home-cooking assistant. Only use measurable quantities. Never invent nutrition or health claims.'
  const raw = await generateJson(prompt, system, IDEAS_SCHEMA) as { ideas?: Array<Record<string, unknown>> }

  const ideas = (Array.isArray(raw?.ideas) ? raw.ideas : []).slice(0, 3).flatMap(idea => {
    const draft = buildDraft({ ...idea, servings }, ingredients)
    if (!draft.ingredients.length) return []
    const lines = draft.ingredients.map(line => {
      const ingredient = names.get(line.ingredientId)!
      const unit = canonical(ingredient.canonicalUnit)
      return { quantity: toCanonical(line.quantity, line.unit, unit), ingredient: { ...ingredient, nameKey: ingredient.name.toLowerCase() } }
    })
    const safety = assessRecipe(lines.map(l => l.ingredient), needs)
    if (safety.status === 'CONFLICT') return []
    const result = evaluateRecipe({ baseServings: servings, ingredients: lines }, servings, outlook.free, catalogByKey, needs)
    return [{ kind: 'AI' as const, draft: { ...draft, kind: 'AI' as const }, status: result.status, coverage: result.coverage, toBuy: result.toBuy, substitutions: result.substitutions, safety }]
  })
  return { servings, ideas }
}
