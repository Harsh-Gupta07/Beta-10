import { Router } from 'express'
import { z } from 'zod'
import { INPUT_UNITS } from '../services/units.js'
import * as recipes from '../services/recipes.js'
import { prisma } from '../lib/prisma.js'
import { announce } from './activity.js'

// Mounted under /households/:householdId, after requireUser + requireHouseholdMember.
export const recipeRouter = Router({ mergeParams: true })

const householdId = (res: { locals: Record<string, unknown> }) => res.locals.householdId as string
const recipeId = (params: Record<string, string | string[] | undefined>) => String(params.recipeId)

const recipeInput = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(''),
  category: z.string().trim().max(40).default('Other'),
  baseServings: z.coerce.number().int().min(1).max(50),
  prepMinutes: z.coerce.number().int().min(0).max(1440).default(0),
  cookMinutes: z.coerce.number().int().min(0).max(1440).default(0),
  instructions: z.array(z.string().trim().max(1000)).max(40).default([]),
  cuisine: z.string().trim().max(40).default(''),
  spiceLevel: z.coerce.number().int().min(1).max(5).nullable().default(null),
  tags: z.array(z.string().trim().min(1).max(24)).max(10).default([]),
  ingredients: z.array(z.object({
    ingredientId: z.string().min(1),
    quantity: z.union([z.number().positive(), z.string().trim().regex(/^\d+(\.\d+)?$/, 'Quantity must be a number.')]),
    unit: z.enum(INPUT_UNITS).optional(),
    note: z.string().trim().max(80).optional(),
  })).min(1, 'Add at least one ingredient.').max(60),
})

recipeRouter.get('/recipes', async (req, res) => {
  // ?safe=1 keeps only recipes that suit every member; "unknown" ones are left out too.
  const { safe } = z.object({ safe: z.enum(['0', '1']).optional() }).parse(req.query)
  const result = await recipes.listRecipes(householdId(res))
  res.json(safe === '1' ? { ...result, recipes: result.recipes.filter(recipe => recipe.safety.status === 'SUITABLE') } : result)
})

recipeRouter.get('/recipes/:recipeId', async (req, res) => {
  const { servings } = z.object({ servings: z.coerce.number().int().min(1).max(50).optional() }).parse(req.query)
  res.json(await recipes.getRecipe(householdId(res), recipeId(req.params), servings))
})

recipeRouter.post('/recipes', async (req, res) => {
  const recipe = await recipes.createRecipe(householdId(res), recipeInput.parse(req.body))
  await announce(res, `added the recipe ${recipe.name}`, { link: `/recipes/${recipe.id}` })
  res.status(201).json(recipe)
})

recipeRouter.put('/recipes/:recipeId', async (req, res) => {
  const recipe = await recipes.updateRecipe(householdId(res), recipeId(req.params), recipeInput.parse(req.body))
  await announce(res, `edited the recipe ${recipe.name}`, { link: `/recipes/${recipe.id}` })
  res.json(recipe)
})

recipeRouter.delete('/recipes/:recipeId', async (req, res) => {
  const recipe = await prisma.recipe.findFirst({ where: { id: recipeId(req.params), householdId: householdId(res) }, select: { name: true } })
  await recipes.deleteRecipe(householdId(res), recipeId(req.params))
  if (recipe) await announce(res, `removed the recipe ${recipe.name}`, { body: 'Meals already cooked or eaten keep their history.', link: '/recipes' })
  res.status(204).end()
})

recipeRouter.post('/recipes/:recipeId/duplicate', async (req, res) => {
  const recipe = await recipes.duplicateRecipe(householdId(res), recipeId(req.params))
  await announce(res, `made an editable copy of ${recipe.name}`, { link: `/recipes/${recipe.id}` })
  res.status(201).json(recipe)
})
