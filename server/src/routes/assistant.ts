import { Router } from 'express'
import type { AppLanguage } from '@prisma/client'
import { z } from 'zod'
import * as assistant from '../services/assistant.js'
import { env } from '../config/env.js'
import { rateLimit } from '../lib/rateLimit.js'

// Mounted under /households/:householdId, after requireUser + requireHouseholdMember.
export const assistantRouter = Router({ mergeParams: true })

// Each message can cost several paid AI calls, so cap it per user.
const messageLimit = rateLimit({ windowMs: 60_000, max: env.RATE_LIMIT_ASSISTANT, key: (_req, res) => (res.locals.user as { id: string }).id, message: 'You’re sending messages too quickly. Please wait a minute.' })

// Demo kitchens cost nothing to create, so a per-user cap alone could be multiplied by starting more demos.
// All demos from one network share one hourly budget instead.
const demoLimit = rateLimit({ windowMs: 60 * 60_000, max: env.RATE_LIMIT_ASSISTANT_DEMO, key: (req, res) => (res.locals.user as { isDemo?: boolean }).isDemo ? `demo|${req.ip}` : null, message: 'The demo assistant is busy. Create a free account to keep chatting.' })

assistantRouter.get('/assistant', (_req, res) => {
  res.json(assistant.assistantStatus())
})

assistantRouter.post('/assistant/messages', messageLimit, demoLimit, async (req, res) => {
  const input = z.object({
    message: z.string().trim().min(1).max(1000),
    history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) })).max(20).default([]),
  }).parse(req.body)
  res.json(await assistant.chat(res.locals.householdId as string, input.history, input.message, (res.locals.user as { language: AppLanguage }).language))
})
