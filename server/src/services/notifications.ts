import { prisma } from '../lib/prisma.js'
import { getShortages } from './planner.js'
import { describeQuantity } from './units.js'

const SLOT = { BREAKFAST: 'breakfast', LUNCH: 'lunch', DINNER: 'dinner' } as const

/**
 * After a stock decrease, checks whether planned meals now fall short of this ingredient and, if so,
 * records a notification for the household. Returns the shortage so the caller can show it immediately.
 */
export async function notifyIfMealsAffected(householdId: string, ingredientId: string, cause: string) {
  const shortage = (await getShortages(householdId)).find(s => s.ingredient.id === ingredientId)
  if (!shortage) return null
  const first = shortage.firstAffected
  const meals = shortage.affectedMeals
  await prisma.notification.create({
    data: {
      householdId,
      title: `${shortage.ingredient.name} is now short for ${meals} planned meal${meals === 1 ? '' : 's'}`,
      body: `${cause}. You need ${describeQuantity(shortage.shortage, shortage.unit)} more, starting with ${first.recipeName} (${SLOT[first.slot]} on ${first.date}).`,
      link: `/planner?week=${first.date}`,
    },
  })
  return shortage
}

export async function listNotifications(householdId: string) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { householdId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.notification.count({ where: { householdId, readAt: null } }),
  ])
  return { unread, items }
}

export async function markAllRead(householdId: string) {
  await prisma.notification.updateMany({ where: { householdId, readAt: null }, data: { readAt: new Date() } })
}
