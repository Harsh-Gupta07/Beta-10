import type { Prisma } from '@prisma/client'
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

/** Notifications a member should see: everything since they joined, except changes they made themselves. */
async function visibleTo(householdId: string, userId: string): Promise<Prisma.NotificationWhereInput> {
  const member = await prisma.householdMember.findUnique({ where: { householdId_userId: { householdId, userId } }, select: { joinedAt: true } })
  return { householdId, createdAt: { gte: member?.joinedAt ?? new Date() }, OR: [{ actorUserId: null }, { actorUserId: { not: userId } }] }
}

export async function listNotifications(householdId: string, userId: string) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: await visibleTo(householdId, userId), orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, title: true, body: true, link: true, createdAt: true, readBy: true } }),
    unreadCount(householdId, userId),
  ])
  return { unread, items: items.map(({ readBy, ...item }) => ({ ...item, read: readBy.includes(userId) })) }
}

export async function unreadCount(householdId: string, userId: string) {
  return prisma.notification.count({ where: { ...await visibleTo(householdId, userId), NOT: { readBy: { has: userId } } } })
}

export async function markAllRead(householdId: string, userId: string) {
  await prisma.notification.updateMany({ where: { ...await visibleTo(householdId, userId), NOT: { readBy: { has: userId } } }, data: { readBy: { push: userId } } })
}

export type Activity = { title: string; body?: string; link?: string }

/**
 * Tells the rest of the household about a change. The person who made it already sees a confirmation on screen,
 * so it is hidden from them. A failure here never undoes or fails the change itself.
 */
export async function recordActivity(householdId: string, actorUserId: string, activity: Activity) {
  try {
    await prisma.notification.create({ data: { householdId, actorUserId, title: activity.title.slice(0, 200), body: (activity.body ?? '').slice(0, 500), link: activity.link ?? null } })
  } catch (error) { console.error('Could not record household activity', error) }
}
