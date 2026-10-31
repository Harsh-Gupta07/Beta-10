import { Prisma, type MealSlot } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { AppError, notFound } from '../lib/errors.js'
import { SLOT_ORDER } from './allocation.js'
import { addDays, fromDbDate, localToday, toDbDate, type DateString } from './dates.js'
import { visibleTo } from './recipes.js'

// What the household has eaten, read from meals marked cooked plus meals logged by hand.
// Nothing is copied: a cooked meal counts for every member who had joined by that day, minus anyone marked absent.

/** History is kept for this many days. */
export const HISTORY_DAYS = 60
/** Who's eating can be changed for meals up to this many days old. */
export const ABSENCE_WINDOW_DAYS = 7

type Person = { id: string; name: string }
export type EatenMeal = { source: 'COOKED' | 'LOGGED'; id: string; recipe: { id: string; name: string }; date: DateString; slot: MealSlot; eaters: Person[]; absent: Person[] }

export const daysBetween = (from: DateString, to: DateString) => Math.round((toDbDate(to).getTime() - toDbDate(from).getTime()) / 86_400_000)

async function householdContext(householdId: string) {
  const [household, members] = await Promise.all([
    prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { timezone: true } }),
    prisma.householdMember.findMany({ where: { householdId }, select: { joinedAt: true, user: { select: { id: true, name: true } } }, orderBy: { joinedAt: 'asc' } }),
  ])
  const today = localToday(household.timezone)
  return { today, members: members.map(m => ({ ...m.user, joinedAt: m.joinedAt, joinedOn: localToday(household.timezone, m.joinedAt) })) }
}
type Member = Awaited<ReturnType<typeof householdContext>>['members'][number]

/**
 * Who could have eaten a meal. A cooked meal counts for members who had joined by that day (or anyone, for
 * meals still ahead). A logged meal is usually back-dated, so it counts for members who had joined when it was logged.
 */
const presence = (meal: { date: DateString; loggedAt?: Date }, today: DateString) => (m: Member) =>
  meal.loggedAt ? m.joinedAt <= meal.loggedAt : meal.date >= today || m.joinedOn <= meal.date

export async function eatenMeals(householdId: string, days = HISTORY_DAYS) {
  const { today, members } = await householdContext(householdId)
  const since = toDbDate(addDays(today, -days))
  const recipe = { select: { id: true, name: true } } as const
  const absences = { select: { userId: true } } as const
  const [cooked, logged] = await Promise.all([
    prisma.plannedMeal.findMany({ where: { mealPlan: { householdId }, status: 'COMPLETED', date: { gte: since } }, select: { id: true, date: true, slot: true, recipe, absences } }),
    prisma.eatenLog.findMany({ where: { householdId, date: { gte: since } }, select: { id: true, date: true, slot: true, recipe, absences, createdAt: true } }),
  ])
  const toMeal = (source: EatenMeal['source']) => (row: (typeof cooked)[number] & { createdAt?: Date }): EatenMeal => {
    const date = fromDbDate(row.date)
    const away = new Set(row.absences.map(a => a.userId))
    const present = members.filter(presence({ date, loggedAt: row.createdAt }, today))
    return {
      source, id: row.id, recipe: row.recipe, date, slot: row.slot,
      eaters: present.filter(m => !away.has(m.id)).map(({ id, name }) => ({ id, name })),
      absent: present.filter(m => away.has(m.id)).map(({ id, name }) => ({ id, name })),
    }
  }
  const meals = [...cooked.map(toMeal('COOKED')), ...logged.map(toMeal('LOGGED'))]
    .sort((a, b) => b.date.localeCompare(a.date) || SLOT_ORDER[b.slot] - SLOT_ORDER[a.slot])
  return { today, members, meals }
}

/** "Recently eaten": every meal in the window and a per-dish summary, optionally only meals one person ate. */
export async function getHistory(householdId: string, days: number, userId?: string) {
  const { today, meals: all } = await eatenMeals(householdId, days)
  const meals = all.filter(meal => meal.eaters.length && (!userId || meal.eaters.some(e => e.id === userId)))
  const byRecipe = new Map<string, { recipe: EatenMeal['recipe']; times: number; lastDate: DateString }>()
  for (const meal of meals) {
    const entry = byRecipe.get(meal.recipe.id)
    if (entry) entry.times++
    else byRecipe.set(meal.recipe.id, { recipe: meal.recipe, times: 1, lastDate: meal.date })
  }
  const dishes = [...byRecipe.values()].map(d => ({ ...d, daysAgo: daysBetween(d.lastDate, today) }))
    .sort((a, b) => b.times - a.times || a.daysAgo - b.daysAgo || a.recipe.name.localeCompare(b.recipe.name))
  return { today, days, meals, dishes }
}

// ---- Who's eating ----

async function findEatable(householdId: string, kind: 'meal' | 'log', id: string) {
  if (kind === 'meal') {
    const meal = await prisma.plannedMeal.findFirst({ where: { id, mealPlan: { householdId } }, select: { id: true, date: true, status: true } })
    if (!meal) throw notFound('Meal')
    if (meal.status === 'CANCELLED') throw new AppError(409, 'This meal was cancelled.')
    return { date: fromDbDate(meal.date), where: { plannedMealId: meal.id }, windowDays: ABSENCE_WINDOW_DAYS }
  }
  const log = await prisma.eatenLog.findFirst({ where: { id, householdId }, select: { id: true, date: true, createdAt: true } })
  if (!log) throw notFound('Logged meal')
  // Logs are back-dated by design, so they stay editable for the whole history window.
  return { date: fromDbDate(log.date), loggedAt: log.createdAt, where: { eatenLogId: log.id }, windowDays: HISTORY_DAYS }
}

export async function getAttendance(householdId: string, kind: 'meal' | 'log', id: string) {
  const { today, members } = await householdContext(householdId)
  const meal = await findEatable(householdId, kind, id)
  const away = new Set((await prisma.mealAbsence.findMany({ where: meal.where, select: { userId: true } })).map(a => a.userId))
  return {
    editable: daysBetween(meal.date, today) <= meal.windowDays,
    members: members.filter(presence(meal, today)).map(m => ({ id: m.id, name: m.name, eating: !away.has(m.id) })),
  }
}

export async function setAttendance(householdId: string, kind: 'meal' | 'log', id: string, absentUserIds: string[]) {
  const { today, members } = await householdContext(householdId)
  const meal = await findEatable(householdId, kind, id)
  if (daysBetween(meal.date, today) > meal.windowDays) throw new AppError(409, `Who ate a meal can only be changed for the last ${meal.windowDays} days.`)
  const memberIds = new Set(members.filter(presence(meal, today)).map(m => m.id))
  const absent = [...new Set(absentUserIds)]
  if (absent.some(userId => !memberIds.has(userId))) throw new AppError(400, 'Only household members who could have eaten this meal can be marked as not eating.')
  await prisma.$transaction([
    prisma.mealAbsence.deleteMany({ where: meal.where }),
    prisma.mealAbsence.createMany({ data: absent.map(userId => ({ userId, ...meal.where })) }),
  ])
  return getAttendance(householdId, kind, id)
}

// ---- Logging a meal eaten outside the planner ----

export async function logMeal(householdId: string, userId: string, input: { recipeId: string; date: DateString; slot: MealSlot; absentUserIds?: string[] }) {
  const { today, members } = await householdContext(householdId)
  const absent = [...new Set(input.absentUserIds ?? [])]
  if (absent.some(id => !members.some(m => m.id === id))) throw new AppError(400, 'Only household members can be marked as not eating.')
  if (input.date > today) throw new AppError(400, 'You can only log meals that have already been eaten. Use the Meal Planner for future meals.')
  if (daysBetween(input.date, today) > HISTORY_DAYS) throw new AppError(400, `Only the last ${HISTORY_DAYS} days can be logged.`)
  const recipe = await prisma.recipe.findFirst({ where: { id: input.recipeId, ...visibleTo(householdId) }, select: { id: true } })
  if (!recipe) throw notFound('Recipe')
  const planned = await prisma.plannedMeal.findFirst({ where: { mealPlan: { householdId }, date: toDbDate(input.date), slot: input.slot, status: { not: 'CANCELLED' } }, select: { status: true, recipe: { select: { name: true } } } })
  if (planned) throw new AppError(409, `${planned.recipe.name} is already in the planner for that meal. ${planned.status === 'COMPLETED' ? 'It already counts as eaten.' : 'Mark it as cooked instead.'}`)
  try {
    return await prisma.eatenLog.create({
      data: { householdId, recipeId: recipe.id, date: toDbDate(input.date), slot: input.slot, loggedById: userId, absences: { create: absent.map(id => ({ userId: id })) } },
      select: { id: true },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'A meal is already logged for that day and slot. Delete it first to change it.')
    throw error
  }
}

export async function deleteLog(householdId: string, logId: string) {
  const { count } = await prisma.eatenLog.deleteMany({ where: { id: logId, householdId } })
  if (!count) throw notFound('Logged meal')
}
