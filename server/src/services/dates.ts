// Calendar dates are plain 'YYYY-MM-DD' strings in app code and PostgreSQL `date` columns in the
// database (Prisma maps them to UTC midnight). "Today" always depends on the household's timezone.

export type DateString = string

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isDateString(value: string): value is DateString {
  if (!DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const toDbDate = (value: DateString) => new Date(`${value}T00:00:00.000Z`)
export const fromDbDate = (value: Date): DateString => value.toISOString().slice(0, 10)

/** The calendar date it currently is in `timeZone`. */
export function localToday(timeZone: string, now = new Date()): DateString {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function addDays(value: DateString, days: number): DateString {
  const date = toDbDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return fromDbDate(date)
}

/** Monday of the week containing `value`. */
export function weekStartOf(value: DateString): DateString {
  const weekday = toDbDate(value).getUTCDay() // 0 = Sunday
  return addDays(value, weekday === 0 ? -6 : 1 - weekday)
}

export function isValidTimeZone(timeZone: string) {
  try { new Intl.DateTimeFormat('en-US', { timeZone }); return true } catch { return false }
}
