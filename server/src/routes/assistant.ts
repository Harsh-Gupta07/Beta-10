import { Router } from 'express'
import { z } from 'zod'
import * as assistant from '../services/assistant.js'

// Mounted under /households/:householdId, after requireUser + requireHouseholdMember.
export const assistantRouter = Router({ mergeParams: true })

assistantRouter.get('/assistant', (_req, res) => {
  res.json(assistant.assistantStatus())
})

assistantRouter.post('/assistant/messages', async (req, res) => {
  const input = z.object({
    message: z.string().trim().min(1).max(1000),
    history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) })).max(20).default([]),
  }).parse(req.body)
  res.json(await assistant.chat(res.locals.householdId as string, input.history, input.message))
})
