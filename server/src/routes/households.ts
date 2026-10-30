import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireHouseholdMember, requireUser } from '../middleware/auth.js'
import { listPantry, recentActivity } from '../services/pantry.js'
import { pantryRouter } from './pantry.js'
import { recipeRouter } from './recipes.js'
import { plannerRouter } from './planner.js'
import { overview } from '../services/planner.js'

export const householdRouter = Router()
householdRouter.use(requireUser)
householdRouter.use('/:householdId', requireHouseholdMember, pantryRouter, recipeRouter, plannerRouter)

householdRouter.post('/', async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(80), defaultServings: z.coerce.number().int().min(1).max(20) }).parse(req.body)
    const user = res.locals.user as { id: string }
    const household = await prisma.household.create({ data: { ...input, members: { create: { userId: user.id, role: 'OWNER' } }, shoppingLists: { create: { name: 'Weekly shopping' } } } })
    res.status(201).json(household)
  } catch (error) { next(error) }
})

householdRouter.get('/:householdId/dashboard', requireHouseholdMember, async (_req, res, next) => {
  try {
    const householdId = res.locals.householdId as string
    const [household, pantry, recipeCount, plan, shoppingCount, activity] = await Promise.all([
      prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { id: true, name: true, defaultServings: true, timezone: true } }),
      listPantry(householdId),
      prisma.recipe.count({ where: { OR: [{ householdId }, { isShared: true }] } }),
      overview(householdId),
      prisma.shoppingListItem.count({ where: { shoppingList: { householdId }, status: 'NEEDED' } }),
      recentActivity(householdId),
    ])
    const lowStock = pantry.filter(item => item.status !== 'OK').slice(0, 5)
    const needsCheck = pantry.filter(item => item.confidence === 'CHECK_NEEDED' || item.expiry === 'EXPIRED').length
    res.json({ household, today: plan.today, pantryCount: pantry.length, lowStock, lowStockCount: pantry.filter(item => item.status !== 'OK').length, needsCheck, recipeCount, todayMeals: plan.todayMeals, upcomingMeals: plan.upcomingMeals, shortages: plan.shortages, shoppingCount, activity })
  } catch (error) { next(error) }
})

householdRouter.get('/:householdId/members', requireHouseholdMember, async (_req, res, next) => {
  try {
    const householdId = res.locals.householdId as string
    const members = await prisma.householdMember.findMany({ where: { householdId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { joinedAt: 'asc' } })
    res.json(members.map(({ user, role, joinedAt }) => ({ ...user, role, joinedAt })))
  } catch (error) { next(error) }
})
