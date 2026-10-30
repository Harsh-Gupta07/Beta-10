import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireHouseholdMember, requireUser } from '../middleware/auth.js'

export const householdRouter = Router()
householdRouter.use(requireUser)

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
    const [household, pantryCount, recipeCount, meals, shoppingCount] = await Promise.all([
      prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { id: true, name: true, defaultServings: true } }),
      prisma.pantryItem.count({ where: { householdId } }),
      prisma.recipe.count({ where: { OR: [{ householdId }, { isShared: true }] } }),
      prisma.plannedMeal.findMany({ where: { mealPlan: { householdId }, date: new Date(new Date().toISOString().slice(0, 10)), status: { in: ['PLANNED', 'COOKING'] } }, include: { recipe: { select: { name: true } } }, orderBy: { slot: 'asc' } }),
      prisma.shoppingListItem.count({ where: { shoppingList: { householdId }, status: 'NEEDED' } }),
    ])
    res.json({ household, pantryCount, recipeCount, meals, shoppingCount })
  } catch (error) { next(error) }
})

householdRouter.get('/:householdId/members', requireHouseholdMember, async (_req, res, next) => {
  try {
    const householdId = res.locals.householdId as string
    const members = await prisma.householdMember.findMany({ where: { householdId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { joinedAt: 'asc' } })
    res.json(members.map(({ user, role, joinedAt }) => ({ ...user, role, joinedAt })))
  } catch (error) { next(error) }
})
