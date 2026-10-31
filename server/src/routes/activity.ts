import type { MealSlot } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { fromDbDate } from '../services/dates.js'
import { recordActivity, type Activity } from '../services/notifications.js'
import { describeQuantity } from '../services/units.js'

// Household alerts for changes made through the API: "<who> <what>", shown to everyone except the person who did it.

type Locals = { locals: Record<string, unknown> }

/** Records "<signed-in user> <what>" for the rest of the household. `householdId` defaults to the one in the URL. */
export function announce(res: Locals, what: string, details: Omit<Activity, 'title'> = {}, householdId = res.locals.householdId as string) {
  const user = res.locals.user as { id: string; name: string }
  return recordActivity(householdId, user.id, { title: `${user.name} ${what}`, ...details })
}

export const SLOT_WORD: Record<MealSlot, string> = { BREAKFAST: 'breakfast', LUNCH: 'lunch', DINNER: 'dinner' }

/** e.g. "Tue, 3 Nov" for a YYYY-MM-DD date. */
export const dayLabel = (date: string) => new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))

/** A quantity as the person typed it ("500 g", "1 L"), or in the item's own unit when no unit was given. */
export function amount(quantity: string | number, unit: string | undefined, canonical: string) {
  return unit ? `${quantity} ${unit === 'l' ? 'L' : unit}` : describeQuantity(String(quantity), canonical)
}

/** "Dal Tadka for dinner on Tue, 3 Nov" plus a planner link, for messages about one planned meal. */
export async function describeMeal(householdId: string, mealId: string) {
  const meal = await prisma.plannedMeal.findFirst({ where: { id: mealId, mealPlan: { householdId } }, select: { date: true, slot: true, recipe: { select: { name: true } } } })
  if (!meal) return null
  const date = fromDbDate(meal.date)
  const when = `${SLOT_WORD[meal.slot]} on ${dayLabel(date)}`
  return { name: meal.recipe.name, when, text: `${meal.recipe.name} for ${when}`, link: `/planner?week=${date}` }
}
