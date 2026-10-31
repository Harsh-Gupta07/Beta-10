import { Router } from 'express'
import { z } from 'zod'
import * as history from '../services/eatingHistory.js'
import * as suggestions from '../services/suggestions.js'

// Mounted under /households/:householdId, after requireUser + requireHouseholdMember.
export const suggestionsRouter = Router({ mergeParams: true })

const ctx = (res: { locals: Record<string, unknown> }) => ({ householdId: res.locals.householdId as string, userId: (res.locals.user as { id: string }).id })
const slot = z.enum(['BREAKFAST', 'LUNCH', 'DINNER'])
const absentUserIds = z.array(z.string().min(1).max(40)).max(50).default([])

suggestionsRouter.get('/suggestions', async (req, res) => {
  const query = z.object({
    slot: slot.optional(),
    scope: z.enum(['household', 'me']).default('household'),
    limit: z.coerce.number().int().min(1).max(30).default(10),
  }).parse(req.query)
  const { householdId, userId } = ctx(res)
  res.json(await suggestions.getSuggestions(householdId, userId, { slot: query.slot ?? null, scope: query.scope, limit: query.limit }))
})

suggestionsRouter.post('/suggestions/:recipeId/snooze', async (req, res) => {
  const { householdId, userId } = ctx(res)
  res.json(await suggestions.snoozeRecipe(householdId, userId, String(req.params.recipeId)))
})

suggestionsRouter.delete('/suggestions/:recipeId/snooze', async (req, res) => {
  await suggestions.unsnoozeRecipe(ctx(res).householdId, String(req.params.recipeId))
  res.status(204).end()
})

suggestionsRouter.get('/history', async (req, res) => {
  const query = z.object({ days: z.coerce.number().int().min(1).max(history.HISTORY_DAYS).default(30), scope: z.enum(['household', 'me']).default('household') }).parse(req.query)
  const { householdId, userId } = ctx(res)
  res.json(await history.getHistory(householdId, query.days, query.scope === 'me' ? userId : undefined))
})

suggestionsRouter.get('/meals/:mealId/attendance', async (req, res) => {
  res.json(await history.getAttendance(ctx(res).householdId, 'meal', String(req.params.mealId)))
})

suggestionsRouter.put('/meals/:mealId/attendance', async (req, res) => {
  const input = z.object({ absentUserIds }).parse(req.body)
  res.json(await history.setAttendance(ctx(res).householdId, 'meal', String(req.params.mealId), input.absentUserIds))
})

suggestionsRouter.post('/eaten-logs', async (req, res) => {
  const input = z.object({ recipeId: z.string().min(1), date: z.iso.date(), slot, absentUserIds }).parse(req.body)
  const { householdId, userId } = ctx(res)
  res.status(201).json(await history.logMeal(householdId, userId, input))
})

suggestionsRouter.delete('/eaten-logs/:logId', async (req, res) => {
  await history.deleteLog(ctx(res).householdId, String(req.params.logId))
  res.status(204).end()
})

suggestionsRouter.get('/eaten-logs/:logId/attendance', async (req, res) => {
  res.json(await history.getAttendance(ctx(res).householdId, 'log', String(req.params.logId)))
})

suggestionsRouter.put('/eaten-logs/:logId/attendance', async (req, res) => {
  const input = z.object({ absentUserIds }).parse(req.body)
  res.json(await history.setAttendance(ctx(res).householdId, 'log', String(req.params.logId), input.absentUserIds))
})
