import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireHouseholdMember, requireUser } from '../middleware/auth.js'
import { listPantry, recentActivity } from '../services/pantry.js'
import { pantryRouter } from './pantry.js'
import { recipeRouter } from './recipes.js'
import { plannerRouter } from './planner.js'
import { overview } from '../services/planner.js'
import { cookingRouter } from './cooking.js'
import { shoppingRouter } from './shopping.js'
import { assistantRouter } from './assistant.js'
import { suggestionsRouter } from './suggestions.js'
import * as households from '../services/household.js'
import { listNotifications, markAllRead } from '../services/notifications.js'
import { getVerificationQueue } from '../services/verification.js'
import * as foodPreferences from '../services/foodPreferences.js'
import { getKitchenRoles, KITCHEN_ROLES, setKitchenRoles } from '../services/kitchenRoles.js'
import { AGE_GROUPS, ALLERGENS, DIET_TYPES, HEALTH_GOALS, WEEKDAYS } from '../services/foodSafety.js'
import type { HouseholdRole } from '@prisma/client'
import { env } from '../config/env.js'
import { rateLimit } from '../lib/rateLimit.js'

export const householdRouter = Router()
householdRouter.use(requireUser)

// Slows down invite-code guessing.
const joinLimit = rateLimit({ windowMs: 15 * 60_000, max: env.RATE_LIMIT_JOIN, key: (_req, res) => (res.locals.user as { id: string }).id, message: 'Too many attempts to join. Please wait a few minutes and check the code.' })

// Must be registered before the '/:householdId' middleware, which would treat "join" as an id.
householdRouter.post('/join', joinLimit, async (req, res) => {
  const { code } = z.object({ code: z.string().trim().min(4).max(20) }).parse(req.body)
  res.status(201).json(await households.joinHousehold((res.locals.user as { id: string }).id, code))
})

householdRouter.use('/:householdId', requireHouseholdMember, pantryRouter, recipeRouter, plannerRouter, cookingRouter, shoppingRouter, assistantRouter, suggestionsRouter)

const role = (res: { locals: Record<string, unknown> }) => res.locals.role as HouseholdRole
const hid = (res: { locals: Record<string, unknown> }) => res.locals.householdId as string

householdRouter.get('/:householdId', requireHouseholdMember, async (_req, res) => {
  res.json(await households.getHousehold(hid(res), role(res)))
})

householdRouter.patch('/:householdId', requireHouseholdMember, async (req, res) => {
  const input = z.object({ name: z.string().trim().min(2).max(80).optional(), defaultServings: z.coerce.number().int().min(1).max(20).optional(), timezone: z.string().trim().max(64).optional(),
    appliances: z.array(z.enum(['GAS_STOVE', 'INDUCTION', 'MICROWAVE', 'AIR_FRYER', 'OVEN', 'PRESSURE_COOKER', 'MIXER_GRINDER'])).max(7).optional(),
    usualCookMinutes: z.coerce.number().int().min(5).max(240).nullable().optional(),
    katoriMl: z.coerce.number().int().min(50).max(500).nullable().optional(),
    chammachMl: z.coerce.number().int().min(2).max(30).nullable().optional(),
    mutthiGrams: z.coerce.number().int().min(10).max(150).nullable().optional() }).parse(req.body)
  res.json(await households.updateHousehold(hid(res), role(res), input))
})

householdRouter.post('/:householdId/invite-code', requireHouseholdMember, async (_req, res) => {
  res.json({ inviteCode: await households.createInviteCode(hid(res), role(res)) })
})

householdRouter.delete('/:householdId/invite-code', requireHouseholdMember, async (_req, res) => {
  await households.disableInvites(hid(res), role(res))
  res.status(204).end()
})

householdRouter.delete('/:householdId/members/:userId', requireHouseholdMember, async (req, res) => {
  await households.removeMember(hid(res), role(res), (res.locals.user as { id: string }).id, String(req.params.userId))
  res.status(204).end()
})

householdRouter.get('/:householdId/notifications', requireHouseholdMember, async (_req, res) => {
  res.json(await listNotifications(hid(res)))
})

householdRouter.post('/:householdId/notifications/read', requireHouseholdMember, async (_req, res) => {
  await markAllRead(hid(res))
  res.status(204).end()
})

householdRouter.get('/:householdId/verification', requireHouseholdMember, async (_req, res) => {
  res.json(await getVerificationQueue(hid(res)))
})

const familyInput = z.object({
  name: z.string().trim().min(1).max(60),
  ageGroup: z.enum(AGE_GROUPS).nullable().default(null),
  dietType: z.enum(DIET_TYPES).nullable().default(null),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).default([]),
  healthGoals: z.array(z.enum(HEALTH_GOALS)).max(HEALTH_GOALS.length).default([]),
  weeklyFasts: z.array(z.enum(WEEKDAYS)).max(7).default([]),
})

// Family profiles: people who eat at home without a login. Any member can keep them up to date.
householdRouter.get('/:householdId/family', requireHouseholdMember, async (_req, res) => {
  res.json(await foodPreferences.listFamily(hid(res)))
})

householdRouter.post('/:householdId/family', requireHouseholdMember, async (req, res) => {
  res.status(201).json(await foodPreferences.addFamilyProfile(hid(res), familyInput.parse(req.body)))
})

householdRouter.put('/:householdId/family/:profileId', requireHouseholdMember, async (req, res) => {
  res.json(await foodPreferences.updateFamilyProfile(hid(res), String(req.params.profileId), familyInput.parse(req.body)))
})

householdRouter.delete('/:householdId/family/:profileId', requireHouseholdMember, async (req, res) => {
  await foodPreferences.deleteFamilyProfile(hid(res), String(req.params.profileId))
  res.status(204).end()
})

const rolesList = z.array(z.enum(KITCHEN_ROLES)).max(KITCHEN_ROLES.length)
householdRouter.get('/:householdId/roles', requireHouseholdMember, async (_req, res) => {
  res.json(await getKitchenRoles(hid(res)))
})

householdRouter.put('/:householdId/roles', requireHouseholdMember, async (req, res) => {
  const input = z.object({
    members: z.array(z.object({ userId: z.string().min(1).max(40), roles: rolesList })).max(50).default([]),
    family: z.array(z.object({ id: z.string().min(1).max(40), roles: rolesList })).max(20).default([]),
  }).parse(req.body)
  res.json(await setKitchenRoles(hid(res), (res.locals.user as { id: string }).id, role(res), input))
})

/** The owner finishes the onboarding cards; from then on the app opens on the dashboard. */
householdRouter.post('/:householdId/onboarding/complete', requireHouseholdMember, async (_req, res) => {
  if (role(res) !== 'OWNER') return res.status(403).json({ error: 'Only the household owner can finish setup.' })
  res.json(await prisma.household.update({ where: { id: hid(res) }, data: { onboardingCompletedAt: new Date() }, select: { id: true, onboardingCompletedAt: true } }))
})

householdRouter.get('/:householdId/food-profile', requireHouseholdMember, async (_req, res) => {
  res.json(await foodPreferences.getHouseholdFoodProfile(hid(res)))
})

householdRouter.put('/:householdId/food-profile', requireHouseholdMember, async (req, res) => {
  const input = z.object({ cuisines: z.array(z.string().trim().min(1).max(40)).max(20).default([]), usualSpice: z.coerce.number().int().min(1).max(5).nullable().default(null) }).parse(req.body)
  res.json(await foodPreferences.updateHouseholdFoodProfile(hid(res), role(res), input))
})

householdRouter.post('/', async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(80), defaultServings: z.coerce.number().int().min(1).max(20), peopleCount: z.coerce.number().int().min(1).max(30).optional() }).parse(req.body)
    const user = res.locals.user as { id: string }
    // Phase 1 is one household per user; a second one would be unreachable from the app.
    if (await prisma.householdMember.findFirst({ where: { userId: user.id }, select: { id: true } })) return res.status(409).json({ error: 'You already belong to a household.' })
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
    const unreadNotifications = await prisma.notification.count({ where: { householdId, readAt: null } })
    res.json({ household, today: plan.today, unreadNotifications, pantryCount: pantry.length, lowStock, lowStockCount: pantry.filter(item => item.status !== 'OK').length, needsCheck, recipeCount, todayMeals: plan.todayMeals, upcomingMeals: plan.upcomingMeals, shortages: plan.shortages, shoppingCount, activity })
  } catch (error) { next(error) }
})

householdRouter.get('/:householdId/members', requireHouseholdMember, async (_req, res, next) => {
  try {
    const householdId = res.locals.householdId as string
    const members = await prisma.householdMember.findMany({ where: { householdId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { joinedAt: 'asc' } })
    res.json(members.map(({ user, role, joinedAt }) => ({ ...user, role, joinedAt })))
  } catch (error) { next(error) }
})
