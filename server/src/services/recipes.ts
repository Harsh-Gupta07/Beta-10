import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { AppError, notFound } from '../lib/errors.js'
import { isCanonicalUnit, scaleQuantity, toCanonical, unitsFor, type CanonicalUnit, type InputUnit } from './units.js'
import { assessRecipe, type MemberNeeds } from './foodSafety.js'
import { householdNeeds } from './foodPreferences.js'

export type RecipeIngredientInput = { ingredientId: string; quantity: string | number; unit?: InputUnit; note?: string }
export type RecipeInput = {
  name: string
  description: string
  category: string
  baseServings: number
  prepMinutes: number
  cookMinutes: number
  instructions: string[]
  cuisine?: string
  spiceLevel?: number | null
  tags?: string[]
  ingredients: RecipeIngredientInput[]
}

/** Recipes a household can see: its own plus the shared (seeded) catalog. */
export const visibleTo = (householdId: string): Prisma.RecipeWhereInput => ({ OR: [{ householdId }, { householdId: null, isShared: true }] })

const lineInclude = { ingredient: { select: { id: true, name: true, category: true, canonicalUnit: true, dietClass: true, allergens: true, allergensReviewed: true } } } as const
const recipeInclude = { ingredients: { include: lineInclude, orderBy: { position: 'asc' } } } as const satisfies Prisma.RecipeInclude
type RecipeRow = Prisma.RecipeGetPayload<{ include: typeof recipeInclude }>

function canonical(unit: string): CanonicalUnit {
  if (!isCanonicalUnit(unit)) throw new Error(`Unsupported canonical unit "${unit}".`)
  return unit
}

async function pantryByIngredient(householdId: string) {
  const items = await prisma.pantryItem.findMany({ where: { householdId }, select: { ingredientId: true, quantity: true } })
  return new Map(items.map(item => [item.ingredientId, item.quantity]))
}

async function householdServings(householdId: string) {
  return (await prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { defaultServings: true } })).defaultServings
}

/**
 * Scales every line to `servings` and compares it with what is physically in the pantry.
 * This is an on-hand check only; reservations across planned meals belong to the allocation engine.
 */
function scaleLines(recipe: RecipeRow, servings: number, pantry: Map<string, Prisma.Decimal>) {
  return recipe.ingredients.map(line => {
    const unit = canonical(line.ingredient.canonicalUnit)
    const needed = scaleQuantity(line.quantity, recipe.baseServings, servings, unit)
    const onHand = pantry.get(line.ingredientId) ?? null
    const missing = onHand === null ? needed : Prisma.Decimal.max(needed.minus(onHand), 0)
    return {
      ingredient: { id: line.ingredient.id, name: line.ingredient.name, category: line.ingredient.category, canonicalUnit: line.ingredient.canonicalUnit },
      allergens: line.ingredient.allergens,
      quantity: needed.toString(),
      unit,
      note: line.note,
      inPantry: onHand?.toString() ?? null,
      missing: missing.toString(),
      enough: missing.isZero(),
    }
  })
}

function summary(recipe: RecipeRow, servings: number, pantry: Map<string, Prisma.Decimal>, needs: MemberNeeds[]) {
  const lines = scaleLines(recipe, servings, pantry)
  const safety = assessRecipe(recipe.ingredients.map(line => line.ingredient), needs)
  return {
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    category: recipe.category,
    baseServings: recipe.baseServings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    cuisine: recipe.cuisine,
    spiceLevel: recipe.spiceLevel,
    tags: recipe.tags,
    custom: recipe.householdId !== null,
    ingredientCount: lines.length,
    missingCount: lines.filter(line => !line.enough).length,
    dietType: safety.dietType,
    allergens: safety.allergens,
    safety: { status: safety.status, conflicts: safety.conflicts, uncertain: safety.uncertain, unreviewed: safety.unreviewed },
    updatedAt: recipe.updatedAt,
  }
}

export async function listRecipes(householdId: string) {
  const [recipes, pantry, servings] = await Promise.all([
    prisma.recipe.findMany({ where: visibleTo(householdId), include: recipeInclude, orderBy: { name: 'asc' } }),
    pantryByIngredient(householdId),
    householdServings(householdId),
  ])
  const needs = await householdNeeds(householdId)
  return { servings, recipes: recipes.map(recipe => summary(recipe, servings, pantry, needs)) }
}

async function findVisible(householdId: string, recipeId: string) {
  const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, ...visibleTo(householdId) }, include: recipeInclude })
  if (!recipe) throw notFound('Recipe')
  return recipe
}

export async function getRecipe(householdId: string, recipeId: string, servings?: number) {
  const [recipe, pantry, defaultServings, needs] = await Promise.all([findVisible(householdId, recipeId), pantryByIngredient(householdId), householdServings(householdId), householdNeeds(householdId)])
  const target = servings ?? defaultServings
  return { ...summary(recipe, target, pantry, needs), servings: target, instructions: recipe.instructions, ingredients: scaleLines(recipe, target, pantry) }
}

/** Validates ingredient references and converts every line into canonical units. */
async function buildLines(householdId: string, lines: RecipeIngredientInput[]) {
  const ids = lines.map(line => line.ingredientId)
  if (new Set(ids).size !== ids.length) throw new AppError(400, 'Each ingredient can only appear once in a recipe. Combine the quantities instead.')
  const ingredients = await prisma.ingredient.findMany({ where: { id: { in: ids }, OR: [{ householdId: null }, { householdId }] } })
  const byId = new Map(ingredients.map(ingredient => [ingredient.id, ingredient]))
  return lines.map((line, position) => {
    const ingredient = byId.get(line.ingredientId)
    if (!ingredient) throw notFound('Ingredient')
    const unit = canonical(ingredient.canonicalUnit)
    let quantity: Prisma.Decimal
    try { quantity = toCanonical(line.quantity, line.unit ?? unitsFor(unit)[0]!, unit) }
    catch (error) { throw error instanceof AppError ? new AppError(error.status, `${ingredient.name}: ${error.message}`) : error }
    if (quantity.isZero()) throw new AppError(400, `${ingredient.name}: quantity must be more than zero.`)
    return { ingredientId: ingredient.id, quantity, unit, note: line.note?.trim() ?? '', position }
  })
}

const recipeData = (input: RecipeInput) => ({
  name: input.name.trim(), description: input.description.trim(), category: input.category.trim() || 'Other',
  baseServings: input.baseServings, prepMinutes: input.prepMinutes, cookMinutes: input.cookMinutes,
  instructions: input.instructions.map(step => step.trim()).filter(Boolean),
  cuisine: input.cuisine?.trim() ?? '', spiceLevel: input.spiceLevel ?? null,
  tags: [...new Set((input.tags ?? []).map(tag => tag.trim().toLowerCase()).filter(Boolean))],
})

export async function createRecipe(householdId: string, input: RecipeInput) {
  const lines = await buildLines(householdId, input.ingredients)
  const recipe = await prisma.recipe.create({ data: { ...recipeData(input), householdId, ingredients: { create: lines } } })
  return getRecipe(householdId, recipe.id, input.baseServings)
}

async function findOwned(householdId: string, recipeId: string) {
  const recipe = await findVisible(householdId, recipeId)
  if (recipe.householdId !== householdId) throw new AppError(403, 'Built-in recipes can’t be changed. Make your own copy to edit it.')
  return recipe
}

export async function updateRecipe(householdId: string, recipeId: string, input: RecipeInput) {
  await findOwned(householdId, recipeId)
  const lines = await buildLines(householdId, input.ingredients)
  await prisma.$transaction([
    prisma.recipeIngredient.deleteMany({ where: { recipeId } }),
    prisma.recipe.update({ where: { id: recipeId }, data: { ...recipeData(input), ingredients: { create: lines } } }),
  ])
  return getRecipe(householdId, recipeId, input.baseServings)
}

export async function deleteRecipe(householdId: string, recipeId: string) {
  await findOwned(householdId, recipeId)
  const planned = await prisma.plannedMeal.count({ where: { recipeId } })
  if (planned) throw new AppError(409, `This recipe is used by ${planned} planned meal${planned === 1 ? '' : 's'}. Change or cancel those meals first.`)
  await prisma.recipe.delete({ where: { id: recipeId } })
}

/** Copies any visible recipe into the household so it can be customised. */
export async function duplicateRecipe(householdId: string, recipeId: string) {
  const source = await findVisible(householdId, recipeId)
  const copy = await prisma.recipe.create({
    data: {
      householdId, name: source.householdId ? `${source.name} (copy)` : source.name, description: source.description, category: source.category,
      baseServings: source.baseServings, prepMinutes: source.prepMinutes, cookMinutes: source.cookMinutes, instructions: source.instructions,
      cuisine: source.cuisine, spiceLevel: source.spiceLevel, tags: source.tags,
      ingredients: { create: source.ingredients.map(({ ingredientId, quantity, unit, note, position }) => ({ ingredientId, quantity, unit, note, position })) },
    },
  })
  return getRecipe(householdId, copy.id, copy.baseServings)
}
