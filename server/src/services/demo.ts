import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'
import { addDays, localToday } from './dates.js'
import { logMeal } from './eatingHistory.js'
import { addPantryItem } from './pantry.js'
import { createMeal } from './planner.js'
import type { InputUnit } from './units.js'

// "See a demo kitchen": a private, ready-to-explore household for one visitor, deleted after DEMO_HOURS.
// It is built through the normal services, so it behaves exactly like a real household.

export const DEMO_HOURS = 24

const PANTRY: Array<[name: string, quantity: number, unit: InputUnit, lowStockThreshold?: number]> = [
  ['Basmati rice', 2, 'kg'], ['Rice', 3, 'kg'], ['Wheat flour (atta)', 5, 'kg', 1000], ['Toor dal', 1, 'kg', 250],
  ['Moong dal', 500, 'g'], ['Masoor dal', 500, 'g'], ['Onion', 2, 'kg', 500], ['Tomato', 1, 'kg'], ['Potato', 2, 'kg'],
  ['Milk', 1, 'l', 500], ['Curd', 400, 'g'], ['Paneer', 200, 'g'], ['Ghee', 500, 'ml'], ['Oil', 1, 'l'], ['Spinach', 250, 'g'],
  ['Green chilli', 100, 'g'], ['Ginger', 100, 'g'], ['Garlic', 150, 'g'], ['Coriander leaves', 50, 'g'], ['Cumin seeds', 100, 'g'],
  ['Mustard seeds', 100, 'g'], ['Turmeric powder', 100, 'g'], ['Red chilli powder', 100, 'g'], ['Coriander powder', 100, 'g'],
  ['Garam masala', 50, 'g'], ['Asafoetida (hing)', 50, 'g'], ['Salt', 1, 'kg'], ['Sugar', 1, 'kg'], ['Tea leaves', 250, 'g'], ['Eggs', 6, 'pcs'],
]

/** Removes demo accounts past their expiry, with everything their households hold. */
export async function purgeExpiredDemos() {
  const expired = await prisma.user.findMany({ where: { demoExpiresAt: { lt: new Date() } }, select: { id: true, memberships: { select: { householdId: true } } } })
  for (const user of expired) {
    const householdIds = user.memberships.map(m => m.householdId)
    await prisma.$transaction([
      // These rows point at the user with "restrict", so they go first.
      prisma.stockTransaction.deleteMany({ where: { householdId: { in: householdIds } } }),
      prisma.cookingEvent.deleteMany({ where: { plannedMeal: { mealPlan: { householdId: { in: householdIds } } } } }),
      prisma.inventoryVerification.deleteMany({ where: { householdId: { in: householdIds } } }),
      prisma.household.deleteMany({ where: { id: { in: householdIds } } }),
      prisma.user.delete({ where: { id: user.id } }),
    ])
  }
  return expired.length
}

/** Creates a demo user with a stocked pantry, a few planned meals and some eating history. Returns the user id. */
export async function createDemoKitchen() {
  await purgeExpiredDemos()
  const user = await prisma.user.create({
    data: {
      name: 'Demo Cook', email: `demo-${randomUUID()}@demo.kitchensync.invalid`,
      // Nobody knows this password, so the account can only be used through its demo session.
      passwordHash: await bcrypt.hash(randomUUID(), 10),
      demoExpiresAt: new Date(Date.now() + DEMO_HOURS * 3_600_000),
    },
    select: { id: true },
  })
  const household = await prisma.household.create({
    data: { name: 'Demo kitchen', defaultServings: 3, peopleCount: 3, onboardingCompletedAt: new Date(), members: { create: { userId: user.id, role: 'OWNER' } }, shoppingLists: { create: { name: 'Weekly shopping' } } },
    select: { id: true, timezone: true },
  })

  const catalog = new Map((await prisma.ingredient.findMany({ where: { householdId: null }, select: { id: true, name: true } })).map(i => [i.name, i.id]))
  for (const [name, quantity, unit, lowStockThreshold] of PANTRY) {
    const ingredientId = catalog.get(name)
    if (ingredientId) await addPantryItem(household.id, user.id, { ingredientId, quantity, unit, lowStockThreshold: lowStockThreshold ?? null, confidence: 'CONFIRMED' })
  }

  const recipes = new Map((await prisma.recipe.findMany({ where: { householdId: null, isShared: true }, select: { id: true, name: true } })).map(r => [r.name, r.id]))
  const today = localToday(household.timezone)
  const plan: Array<[day: number, slot: 'BREAKFAST' | 'LUNCH' | 'DINNER', recipe: string]> = [
    [0, 'DINNER', 'Dal Tadka'], [1, 'BREAKFAST', 'Kanda Batata Poha'], [1, 'LUNCH', 'Palak Paneer'], [2, 'DINNER', 'Rajma Chawal'],
  ]
  for (const [day, slot, name] of plan) {
    const recipeId = recipes.get(name)
    if (recipeId) await createMeal(household.id, { date: addDays(today, day), slot, recipeId })
  }
  const history: Array<[day: number, slot: 'LUNCH' | 'DINNER', recipe: string]> = [[-1, 'DINNER', 'Chole'], [-2, 'LUNCH', 'Aloo Paratha'], [-4, 'DINNER', 'Chole']]
  for (const [day, slot, name] of history) {
    const recipeId = recipes.get(name)
    if (recipeId) await logMeal(household.id, user.id, { recipeId, date: addDays(today, day), slot })
  }
  return user.id
}
