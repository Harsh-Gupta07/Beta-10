import { Router } from 'express'
import { z } from 'zod'
import { requireUser } from '../middleware/auth.js'
import * as logs from '../services/mealLogs.js'

export const mealLogsRouter = Router()
mealLogsRouter.use(requireUser)
const body = z.object({ recipeId: z.string().min(1), mealSlot: z.enum(['BREAKFAST', 'LUNCH', 'DINNER']), servings: z.number().positive().max(20), loggedAt: z.coerce.date().optional() })
const uid = (res: any) => res.locals.user.id as string
mealLogsRouter.post('/', async (req, res) => res.status(201).json(await logs.createMealLog(uid(res), body.parse(req.body))))
mealLogsRouter.patch('/:id', async (req, res) => { const value = body.omit({ recipeId: true, loggedAt: true }).parse(req.body); res.json(await logs.updateMealLog(uid(res), String(req.params.id), value)) })
mealLogsRouter.delete('/:id', async (req, res) => { await logs.deleteMealLog(uid(res), String(req.params.id)); res.status(204).end() })

