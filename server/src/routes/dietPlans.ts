import { Router } from 'express'
import { z } from 'zod'
import { requireUser } from '../middleware/auth.js'
import { requirePremium } from '../middleware/entitlements.js'
import * as plans from '../services/dietPlans.js'

export const dietPlansRouter = Router()
dietPlansRouter.use(requireUser, requirePremium)
const uid = (res: any) => res.locals.user.id as string
dietPlansRouter.post('/preview', async (req, res) => { const input = z.object({ startDate: z.iso.date(), maxCookMinutes: z.number().int().min(10).max(240).default(60) }).parse(req.body); res.status(201).json(await plans.preview(uid(res), input)) })
dietPlansRouter.post('/:id/confirm', async (req, res) => res.json(await plans.confirm(uid(res), String(req.params.id))))

