import { Prisma } from '@prisma/client'
import { AppError } from '../lib/errors.js'

const Decimal = Prisma.Decimal
type Decimal = Prisma.Decimal

export const CANONICAL_UNITS = ['g', 'ml', 'count'] as const
export type CanonicalUnit = (typeof CANONICAL_UNITS)[number]

export const INPUT_UNITS = ['g', 'kg', 'ml', 'l', 'pcs'] as const
export type InputUnit = (typeof INPUT_UNITS)[number]

const UNITS: Record<InputUnit, { canonical: CanonicalUnit; factor: number }> = {
  g: { canonical: 'g', factor: 1 },
  kg: { canonical: 'g', factor: 1000 },
  ml: { canonical: 'ml', factor: 1 },
  l: { canonical: 'ml', factor: 1000 },
  pcs: { canonical: 'count', factor: 1 },
}

/** Largest canonical quantity we accept; keeps values well inside numeric(12,3). */
export const MAX_CANONICAL_QUANTITY = new Decimal(100_000_000)

export function isCanonicalUnit(value: string): value is CanonicalUnit {
  return (CANONICAL_UNITS as readonly string[]).includes(value)
}

export function unitsFor(canonical: CanonicalUnit): InputUnit[] {
  return INPUT_UNITS.filter(unit => UNITS[unit].canonical === canonical)
}

/**
 * Converts a user-entered quantity into the ingredient's canonical unit using decimal math.
 * Conversions are only allowed within one family (mass, volume, count); anything else is rejected
 * rather than guessed, because e.g. "ml of rice" has no safe meaning without a density.
 */
export function toCanonical(quantity: Prisma.Decimal.Value, unit: InputUnit, canonical: CanonicalUnit): Decimal {
  const def = UNITS[unit]
  if (def.canonical !== canonical) {
    throw new AppError(422, `This ingredient is measured in ${canonical === 'count' ? 'pieces' : canonical}. Use ${unitsFor(canonical).join(' or ')} instead of ${unit}.`)
  }
  let value: Decimal
  try { value = new Decimal(quantity) } catch { throw new AppError(400, 'Quantity must be a number.') }
  if (!value.isFinite() || value.isNegative()) throw new AppError(400, 'Quantity must be zero or more.')
  const result = value.times(def.factor).toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
  if (canonical === 'count' && !result.isInteger()) throw new AppError(400, 'Piece counts must be whole numbers.')
  if (result.greaterThan(MAX_CANONICAL_QUANTITY)) throw new AppError(400, 'That quantity is too large.')
  return result
}

/**
 * Scales a recipe quantity written for `baseServings` to `servings` with decimal math.
 * Piece counts round up (you can't use 1.5 eggs from the pantry); mass/volume keep 3 decimals.
 */
export function scaleQuantity(quantity: Decimal, baseServings: number, servings: number, unit: CanonicalUnit): Decimal {
  if (!Number.isInteger(baseServings) || baseServings < 1 || !Number.isInteger(servings) || servings < 1) throw new AppError(400, 'Servings must be a whole number of at least 1.')
  const scaled = quantity.times(servings).dividedBy(baseServings)
  return unit === 'count' ? scaled.toDecimalPlaces(0, Decimal.ROUND_CEIL) : scaled.toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
}

export type StockStatus = 'OUT' | 'LOW' | 'OK'

export function stockStatus(quantity: Decimal, lowStockThreshold: Decimal | null): StockStatus {
  if (quantity.lessThanOrEqualTo(0)) return 'OUT'
  if (lowStockThreshold && quantity.lessThanOrEqualTo(lowStockThreshold)) return 'LOW'
  return 'OK'
}

export const EXPIRY_WARNING_DAYS = 3

export function expiryState(expiresAt: Date | null, now = new Date()): 'EXPIRED' | 'SOON' | null {
  if (!expiresAt) return null
  const msLeft = expiresAt.getTime() - now.getTime()
  if (msLeft < 0) return 'EXPIRED'
  return msLeft <= EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000 ? 'SOON' : null
}
