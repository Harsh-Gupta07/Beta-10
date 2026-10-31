import type { NextFunction, Request, Response } from 'express'

type Options = {
  windowMs: number
  max: number
  /** Bucket key for a request, e.g. IP + email. Returning null skips limiting. */
  key: (req: Request, res: Response) => string | null
  message: string
}

/**
 * Fixed-window rate limiter kept in memory. Good enough for a single staging instance; with several
 * instances the limit applies per instance (see RELEASE-READINESS.md).
 */
export function rateLimit({ windowMs, max, key, message }: Options) {
  const buckets = new Map<string, { count: number; resetAt: number }>()
  const sweep = setInterval(() => {
    const now = Date.now()
    for (const [k, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(k)
  }, Math.min(windowMs, 60_000))
  sweep.unref()

  return (req: Request, res: Response, next: NextFunction) => {
    const id = key(req, res)
    if (!id) return next()
    const now = Date.now()
    let bucket = buckets.get(id)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(id, bucket)
    }
    bucket.count++
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
      return res.status(429).json({ error: message })
    }
    next()
  }
}
