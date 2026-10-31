import { Router } from 'express'
import { z } from 'zod'
import * as history from '../services/eatingHistory.js'
import * as suggestions from '../services/suggestions.js'
import { prisma } from '../lib/prisma.js'
import { announce, dayLabel, describeMeal, SLOT_WORD } from './activity.js'

const recipeName = async (recipeId: string) => (await prisma.recipe.findUnique({ where: { id: recipeId }, select: { name: true } }))?.name ?? 'A dish'
const describeLog = async (householdId: string, logId: string) => {
  const log = await prisma.eatenLog.findFirst({ where: { id: logId, householdId }, select: { date: true, slot: true, recipe: { select: { name: true } } } })
  return log && `${log.recipe.name} (${SLOT_WORD[log.slot]} on ${dayLabel(log.date.toISOString().slice(0, 10))})`
}

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
  const result = await suggestions.snoozeRecipe(householdId, userId, String(req.params.recipeId))
  await announce(res, `hid ${await recipeName(result.recipeId)} from suggestions for ${suggestions.SNOOZE_DAYS} days`, { link: '/suggestions' })
  res.json(result)
})

suggestionsRouter.delete('/suggestions/:recipeId/snooze', async (req, res) => {
  await suggestions.unsnoozeRecipe(ctx(res).householdId, String(req.params.recipeId))
  await announce(res, `brought ${await recipeName(String(req.params.recipeId))} back into suggestions`, { link: '/suggestions' })
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
  const attendance = await history.setAttendance(ctx(res).householdId, 'meal', String(req.params.mealId), input.absentUserIds)
  const about = await describeMeal(ctx(res).householdId, String(req.params.mealId))
  if (about) await announce(res, `updated who’s eating ${about.text}`, { link: about.link })
  res.json(attendance)
})

suggestionsRouter.post('/eaten-logs', async (req, res) => {
  const input = z.object({ recipeId: z.string().min(1), date: z.iso.date(), slot, absentUserIds }).parse(req.body)
  const { householdId, userId } = ctx(res)
  const log = await history.logMeal(householdId, userId, input)
  await announce(res, `logged ${await recipeName(input.recipeId)} for ${SLOT_WORD[input.slot]} on ${dayLabel(input.date)}`, { body: 'History only; the pantry was not changed.', link: '/suggestions' })
  res.status(201).json(log)
})

suggestionsRouter.delete('/eaten-logs/:logId', async (req, res) => {
  const about = await describeLog(ctx(res).householdId, String(req.params.logId))
  await history.deleteLog(ctx(res).householdId, String(req.params.logId))
  if (about) await announce(res, `removed ${about} from the eating history`, { link: '/suggestions' })
  res.status(204).end()
})

suggestionsRouter.get('/eaten-logs/:logId/attendance', async (req, res) => {
  res.json(await history.getAttendance(ctx(res).householdId, 'log', String(req.params.logId)))
})

suggestionsRouter.put('/eaten-logs/:logId/attendance', async (req, res) => {
  const input = z.object({ absentUserIds }).parse(req.body)
  const attendance = await history.setAttendance(ctx(res).householdId, 'log', String(req.params.logId), input.absentUserIds)
  const about = await describeLog(ctx(res).householdId, String(req.params.logId))
  if (about) await announce(res, `updated who ate ${about}`, { link: '/suggestions' })
  res.json(attendance)
})
