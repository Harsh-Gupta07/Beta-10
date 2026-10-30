import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  AI_API_KEY: z.string().trim().optional(),
  /** Gemini model used by the assistant. */
  AI_MODEL: z.string().trim().min(1).default('gemini-2.5-flash'),
  /** Tried once when the main model is overloaded, rate-limited or slow. */
  AI_FALLBACK_MODEL: z.string().trim().min(1).default('gemini-flash-lite-latest'),
})

export const env = schema.parse(process.env)
