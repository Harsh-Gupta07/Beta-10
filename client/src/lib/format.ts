import type { CanonicalUnit, Confidence, InputUnit, MealSlot, MealStatus, StockTransaction } from './api'

// Display-only helpers. Quantities arrive as decimal strings; Number() is used purely for presentation,
// never for values sent back to the server.

export const unitOptions: Record<CanonicalUnit, InputUnit[]> = { g: ['g', 'kg'], ml: ['ml', 'l'], count: ['pcs'] }
export const baseUnit: Record<CanonicalUnit, InputUnit> = { g: 'g', ml: 'ml', count: 'pcs' }

const trim = (value: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)

export function formatQuantity(quantity: string | number, unit: CanonicalUnit): string {
  const value = Number(quantity)
  if (unit === 'count') return `${trim(value)} pcs`
  if (Math.abs(value) >= 1000) return `${trim(value / 1000)} ${unit === 'g' ? 'kg' : 'L'}`
  return `${trim(value)} ${unit}`
}

export function formatDelta(delta: string, unit: CanonicalUnit): string {
  const value = Number(delta)
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatQuantity(Math.abs(value), unit)}`
}

export const confidenceLabel: Record<Confidence, string> = { CONFIRMED: 'Confirmed', ESTIMATED: 'Estimated', CHECK_NEEDED: 'Check needed' }

export const transactionLabel: Record<StockTransaction['type'], string> = {
  INITIAL_STOCK: 'Added', PURCHASE_RECEIVED: 'Received', COOKING_CONSUMPTION: 'Cooked', CORRECTION: 'Corrected', MANUAL_USE: 'Used', REMOVED: 'Removed',
}

export function formatDate(value: string | null): string {
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(value))
}

export function relativeTime(value: string | null): string {
  if (!value) return 'Never'
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'Yesterday' : `${days} days ago`
}

/** yyyy-mm-dd for <input type="date"> from an ISO timestamp stored at UTC midnight. */
export const toDateInput = (value: string | null) => value ? value.slice(0, 10) : ''

export const slots: MealSlot[] = ['BREAKFAST', 'LUNCH', 'DINNER']
export const slotLabel: Record<MealSlot, string> = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner' }
export const statusLabel: Record<MealStatus, string> = { PLANNED: 'Planned', COOKING: 'Cooking', COMPLETED: 'Completed', CANCELLED: 'Cancelled' }

/** Formats a YYYY-MM-DD calendar date; parsed as UTC so the day never shifts with the browser's zone. */
export function formatDay(value: string, style: 'short' | 'long' = 'short'): string {
  const options: Intl.DateTimeFormatOptions = style === 'short' ? { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' } : { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }
  return new Intl.DateTimeFormat('en-IN', options).format(new Date(`${value}T00:00:00Z`))
}

export function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** "Today", "Tomorrow" or a short date, relative to the household's today. */
export function relativeDay(value: string, today: string): string {
  if (value === today) return 'Today'
  if (value === addDays(today, 1)) return 'Tomorrow'
  return formatDay(value)
}
