import type { CanonicalUnit, Household } from './api'

// Household measures: a katori or chammach of liquid (ml) and a mutthi (handful) of dry food (g).
// They are always approximate, so anything entered with them is converted to ml/g on this device and marked Estimated.

export type HomeUnit = 'katori' | 'chammach' | 'mutthi'
export const DEFAULT_MEASURES = { katoriMl: 150, chammachMl: 15, mutthiGrams: 30 } as const

export const HOME_UNIT_LABEL: Record<HomeUnit, string> = { katori: 'katori', chammach: 'chammach', mutthi: 'mutthi' }

/** The household units that make sense for an ingredient measured in `family`, with their size in that family's base unit. */
export function homeUnitsFor(family: CanonicalUnit, household: Pick<Household, 'katoriMl' | 'chammachMl' | 'mutthiGrams'>): Array<{ unit: HomeUnit; size: number; base: 'ml' | 'g' }> {
  if (family === 'ml') return [
    { unit: 'katori', size: household.katoriMl ?? DEFAULT_MEASURES.katoriMl, base: 'ml' },
    { unit: 'chammach', size: household.chammachMl ?? DEFAULT_MEASURES.chammachMl, base: 'ml' },
  ]
  if (family === 'g') return [{ unit: 'mutthi', size: household.mutthiGrams ?? DEFAULT_MEASURES.mutthiGrams, base: 'g' }]
  return []
}

/** "3 katori" with a 150 ml katori → 450 (ml). Rounded to whole units; null if the amount isn't a number. */
export function convertHomeUnit(quantity: string, size: number): number | null {
  const amount = Number(quantity)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * size) : null
}
