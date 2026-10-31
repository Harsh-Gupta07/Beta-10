import type { MealSlot } from '@prisma/client'
import type { SafetyStatus } from './foodSafety.js'

// Pure: ranks recipes for "what to cook" from facts the app already holds. No AI and no randomness,
// so the same data always gives the same list, and every point of score has a reason attached.

export const WEIGHTS = {
  ready: 30,
  perMissing: -5,
  maxMissingPenalty: -25,
  eatenWithin2Days: -40,
  eatenWithin7Days: -20,
  frequent: -15,
  notRecently: 10,
  planned: -25,
  favourite: 15,
  dislike: -20,
  cuisine: 5,
  tooSpicy: -10,
  slotFit: 10,
  tooLong: -10,
} as const

/** Eaten at least this often in 30 days counts as "frequent". */
export const FREQUENT_TIMES = 3
/** Not eaten for at least this many days (or never) earns "haven't had it in a while". */
export const WHILE_DAYS = 14

export type Candidate = {
  id: string
  name: string
  category: string
  cuisine: string
  spiceLevel: number | null
  tags: string[]
  safety: SafetyStatus
  /** Prep plus cook time. */
  minutes: number
  missingCount: number
  ingredientCount: number
  /** Days since it was last eaten by the people in scope; null if never (in the history window). */
  lastEatenDaysAgo: number | null
  timesEaten30: number
  /** Slots it has been eaten in before, e.g. { BREAKFAST: 3 }. */
  eatenInSlot: Partial<Record<MealSlot, number>>
  plannedSoon: boolean
  favouriteOf: string[]
  dislikedBy: string[]
}

export type RankContext = {
  slot: MealSlot | null
  /** Lower-cased cuisines anyone in scope likes, plus household defaults. */
  cuisines: string[]
  /** Each person's spice limit. */
  spiceLimits: Array<{ name: string; max: number }>
  /** Minutes the household usually has for cooking; null if not set. */
  usualMinutes?: number | null
}

export type Reason = { tone: 'good' | 'warn'; text: string; /** Same reason without people's names, for the AI. */ anonymous: string }
export type Ranked = { id: string; score: number; reasons: Reason[] }

const isDrink = (c: Candidate) => c.category.toLowerCase() === 'beverages' || c.tags.includes('beverage')
const isBreakfastDish = (c: Candidate) => c.category.toLowerCase().includes('breakfast')
const people = (names: string[]) => names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

/** Dishes that are never suggested: they clash with someone, or are drinks rather than meals. */
export const isEligible = (c: Candidate) => c.safety !== 'CONFLICT' && !isDrink(c)

export function scoreRecipe(c: Candidate, context: RankContext): Ranked {
  let score = 0
  const reasons: Reason[] = []
  const add = (points: number, tone: Reason['tone'], text: string, anonymous = text) => { score += points; reasons.push({ tone, text, anonymous }) }

  if (c.missingCount === 0) add(WEIGHTS.ready, 'good', 'Ready with what you have')
  else add(Math.max(WEIGHTS.perMissing * c.missingCount, WEIGHTS.maxMissingPenalty), 'warn', `Missing ${c.missingCount} of ${c.ingredientCount} ingredients`)

  const ago = c.lastEatenDaysAgo
  if (ago !== null && ago <= 2) add(WEIGHTS.eatenWithin2Days, 'warn', ago === 0 ? 'You had this today' : ago === 1 ? 'You had this yesterday' : 'You had this 2 days ago')
  else if (ago !== null && ago <= 7) add(WEIGHTS.eatenWithin7Days, 'warn', `You had this ${ago} days ago`)
  else if (ago === null) add(WEIGHTS.notRecently, 'good', 'Something you haven’t had recently')
  else if (ago >= WHILE_DAYS) add(WEIGHTS.notRecently, 'good', `Haven’t had it in ${ago} days`)
  if (c.timesEaten30 >= FREQUENT_TIMES) add(WEIGHTS.frequent, 'warn', `Eaten ${c.timesEaten30} times this month`)

  if (c.plannedSoon) add(WEIGHTS.planned, 'warn', 'Already planned this week')

  if (c.favouriteOf.length) add(WEIGHTS.favourite * c.favouriteOf.length, 'good', `${people(c.favouriteOf)}’s favourite`, c.favouriteOf.length > 1 ? 'Several people’s favourite' : 'Someone’s favourite')
  if (c.dislikedBy.length) add(WEIGHTS.dislike * c.dislikedBy.length, 'warn', `${people(c.dislikedBy)} would rather skip it`, 'Someone would rather skip it')

  if (c.cuisine && context.cuisines.includes(c.cuisine.toLowerCase())) add(WEIGHTS.cuisine, 'good', `${c.cuisine}, a cuisine you like`)

  const tooHot = c.spiceLevel === null ? [] : context.spiceLimits.filter(limit => c.spiceLevel! > limit.max).map(limit => limit.name)
  if (tooHot.length) add(WEIGHTS.tooSpicy, 'warn', `Spicier than ${people(tooHot)} likes`, 'Spicier than someone likes')
  if (context.usualMinutes && c.minutes > context.usualMinutes) add(WEIGHTS.tooLong, 'warn', `Takes ${c.minutes} min; you usually have ${context.usualMinutes}`)

  if (context.slot) {
    const before = c.eatenInSlot[context.slot] ?? 0
    const breakfastSlot = context.slot === 'BREAKFAST'
    if (before > 0) add(WEIGHTS.slotFit, 'good', `You’ve had it for ${context.slot.toLowerCase()} before`)
    else if (breakfastSlot === isBreakfastDish(c)) add(WEIGHTS.slotFit, 'good', breakfastSlot ? 'A breakfast dish' : `Suits ${context.slot.toLowerCase()}`)
    else add(-WEIGHTS.slotFit, 'warn', breakfastSlot ? 'Not usually a breakfast dish' : 'Usually a breakfast dish')
  }

  if (c.safety === 'UNKNOWN') reasons.push({ tone: 'warn', text: 'Check ingredients for allergies', anonymous: 'Some ingredients are unchecked for allergies' })
  return { id: c.id, score, reasons }
}

/** Highest score first; ties broken by name so the order is stable. */
export function rankRecipes(candidates: Candidate[], context: RankContext): Ranked[] {
  const names = new Map(candidates.map(c => [c.id, c.name]))
  return candidates.filter(isEligible).map(c => scoreRecipe(c, context))
    .sort((a, b) => b.score - a.score || names.get(a.id)!.localeCompare(names.get(b.id)!))
}
