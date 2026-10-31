import 'dotenv/config'
import { z } from 'zod'

const bool = (fallback: boolean) => z.enum(['true', 'false']).default(fallback ? 'true' : 'false').transform(value => value === 'true')
const limit = (fallback: number) => z.coerce.number().int().positive().default(fallback)

const PLACEHOLDER_SECRET = 'replace-with-a-long-random-secret-at-least-32-characters'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  /**
   * Express "trust proxy" setting. Set it when the API runs behind an HTTPS reverse proxy or load
   * balancer (e.g. "1" for one hop) so secure cookies, req.ip and rate limits use the real client.
   */
  TRUST_PROXY: z.string().trim().optional(),
  /** Overrides the cookie Secure flag (defaults to on in production). Only turn off for local HTTP testing. */
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  /** Serve the built client (client/dist) from the API so app and API share one origin. */
  SERVE_CLIENT: bool(false),
  CLIENT_DIST_DIR: z.string().trim().default('../client/dist'),
  /** One JSON line per request on stdout. Defaults to on in production. */
  LOG_REQUESTS: z.enum(['true', 'false']).optional(),
  // Rate limits (per window). In-memory, so they apply per server instance.
  RATE_LIMIT_LOGIN: limit(10),        // per IP + email, 15 minutes
  RATE_LIMIT_REGISTER: limit(20),     // per IP, 1 hour
  RATE_LIMIT_JOIN: limit(10),         // per user, 15 minutes
  RATE_LIMIT_ASSISTANT: limit(10),    // per user, 1 minute
  AI_API_KEY: z.string().trim().optional(),
  /** Gemini model used by the assistant. */
  AI_MODEL: z.string().trim().min(1).default('gemini-2.5-flash'),
  /** Tried once when the main model is overloaded, rate-limited or slow. */
  AI_FALLBACK_MODEL: z.string().trim().min(1).default('gemini-flash-lite-latest'),
  /** OAuth Web client ID from Google Cloud Console. Public, not a secret. Empty hides "Continue with Google". */
  GOOGLE_CLIENT_ID: z.string().trim().optional(),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production' && value.SESSION_SECRET === PLACEHOLDER_SECRET) {
    ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'Set a real random SESSION_SECRET in production.' })
  }
})

const parsed = schema.parse(process.env)

/** Accepts "true"/"false", a hop count, or a comma-separated list of trusted addresses/subnets. */
function trustProxy(value: string | undefined): boolean | number | string[] {
  if (!value || value === 'false') return false
  if (value === 'true') return true
  if (/^\d+$/.test(value)) return Number(value)
  return value.split(',').map(part => part.trim()).filter(Boolean)
}

export const env = {
  ...parsed,
  TRUST_PROXY: trustProxy(parsed.TRUST_PROXY),
  LOG_REQUESTS: parsed.LOG_REQUESTS ? parsed.LOG_REQUESTS === 'true' : parsed.NODE_ENV === 'production',
  COOKIE_SECURE: parsed.COOKIE_SECURE ? parsed.COOKIE_SECURE === 'true' : parsed.NODE_ENV === 'production',
}

if (env.COOKIE_SECURE && env.NODE_ENV === 'production' && env.TRUST_PROXY === false) {
  console.warn('[config] Secure session cookies are on but TRUST_PROXY is not set. Behind an HTTPS proxy or load balancer, set TRUST_PROXY=1 or sign-in will not persist.')
}
