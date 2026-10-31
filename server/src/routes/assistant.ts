import { Router } from 'express'
import { z } from 'zod'
import * as assistant from '../services/assistant.js'
import { env } from '../config/env.js'
import { rateLimit } from '../lib/rateLimit.js'

// Mounted under /households/:householdId, after requireUser + requireHouseholdMember.
export const assistantRouter = Router({ mergeParams: true })

// Each message can cost several paid AI calls, so cap it per user.
const messageLimit = rateLimit({ windowMs: 60_000, max: env.RATE_LIMIT_ASSISTANT, key: (_req, res) => (res.locals.user as { id: string }).id, message: 'You’re sending messages too quickly. Please wait a minute.' })

assistantRouter.get('/assistant', (_req, res) => {
  res.json(assistant.assistantStatus())
})

assistantRouter.post('/assistant/messages', messageLimit, async (req, res) => {
  const input = z.object({
    message: z.string().trim().min(1).max(1000),
    history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) })).max(20).default([]),
  }).parse(req.body)
  res.json(await assistant.chat(res.locals.householdId as string, input.history, input.message))
})
