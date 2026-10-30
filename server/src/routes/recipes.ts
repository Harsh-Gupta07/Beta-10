import { Router } from 'express'
import { z } from 'zod'
import { INPUT_UNITS } from '../services/units.js'
import * as recipes from '../services/recipes.js'

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
  ingredients: z.array(z.object({
    ingredientId: z.string().min(1),
    quantity: z.union([z.number().positive(), z.string().trim().regex(/^\d+(\.\d+)?$/, 'Quantity must be a number.')]),
    unit: z.enum(INPUT_UNITS).optional(),
    note: z.string().trim().max(80).optional(),
  })).min(1, 'Add at least one ingredient.').max(60),
})

recipeRouter.get('/recipes', async (_req, res) => {
  res.json(await recipes.listRecipes(householdId(res)))
})

recipeRouter.get('/recipes/:recipeId', async (req, res) => {
  const { servings } = z.object({ servings: z.coerce.number().int().min(1).max(50).optional() }).parse(req.query)
  res.json(await recipes.getRecipe(householdId(res), recipeId(req.params), servings))
})

recipeRouter.post('/recipes', async (req, res) => {
  res.status(201).json(await recipes.createRecipe(householdId(res), recipeInput.parse(req.body)))
})

recipeRouter.put('/recipes/:recipeId', async (req, res) => {
  res.json(await recipes.updateRecipe(householdId(res), recipeId(req.params), recipeInput.parse(req.body)))
})

recipeRouter.delete('/recipes/:recipeId', async (req, res) => {
  await recipes.deleteRecipe(householdId(res), recipeId(req.params))
  res.status(204).end()
})

recipeRouter.post('/recipes/:recipeId/duplicate', async (req, res) => {
  res.status(201).json(await recipes.duplicateRecipe(householdId(res), recipeId(req.params)))
})
