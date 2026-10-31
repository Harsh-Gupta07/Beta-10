import { Router } from 'express'
import { z } from 'zod'
import { requireUser } from '../middleware/auth.js'
import { requirePremium } from '../middleware/entitlements.js'
import * as scans from '../services/scans.js'

export const scansRouter = Router()
scansRouter.use(requireUser, requirePremium)
const uid = (res: any) => res.locals.user.id as string
scansRouter.post('/', async (req, res) => {
  const input = z.object({ scanType: z.enum(['COOKED_MEAL', 'GROCERY']), image: z.object({ mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']), base64: z.string().max(7_000_000) }).optional() }).parse(req.body)
  res.status(201).json(await scans.createScan(uid(res), input.scanType, input.image))
})
scansRouter.get('/:id', async (req, res) => res.json(await scans.getScan(uid(res), String(req.params.id))))
scansRouter.post('/:id/cancel', async (req, res) => { await scans.cancelScan(uid(res), String(req.params.id)); res.status(204).end() })
scansRouter.post('/:id/confirm', async (req, res) => {
  const id = String(req.params.id); const scan = await scans.getScan(uid(res), id)
  if (scan.scanType === 'GROCERY') {
    const { items } = z.object({ items: z.array(z.object({ ingredientId: z.string().min(1), quantity: z.number().positive().max(100000) })).min(1).max(50) }).parse(req.body)
    return res.json(await scans.confirmGrocery(uid(res), id, items))
  }
  const input = z.object({ recipeId: z.string().min(1), servings: z.number().positive().max(20), mealSlot: z.enum(['BREAKFAST', 'LUNCH', 'DINNER']) }).parse(req.body)
  res.json(await scans.confirmMeal(uid(res), id, input))
})

