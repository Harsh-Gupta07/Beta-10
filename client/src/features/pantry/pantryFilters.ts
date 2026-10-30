import type { PantryItem } from '../../lib/api'

export type PantryView = 'all' | 'low' | 'check' | 'expiring'

export const pantryViews: Array<{ value: PantryView; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'low', label: 'Low stock' }, { value: 'check', label: 'Needs check' }, { value: 'expiring', label: 'Expiring' },
]

export function isPantryView(value: string | null): value is PantryView {
  return pantryViews.some(view => view.value === value)
}

const matchesView: Record<PantryView, (item: PantryItem) => boolean> = {
  all: () => true,
  low: item => item.status !== 'OK',
  check: item => item.confidence === 'CHECK_NEEDED' || item.expiry === 'EXPIRED',
  expiring: item => item.expiry !== null,
}

export function countByView(items: PantryItem[]): Record<PantryView, number> {
  return { all: items.length, low: items.filter(matchesView.low).length, check: items.filter(matchesView.check).length, expiring: items.filter(matchesView.expiring).length }
}

/** Applies view, category and search filters, then groups by category (both alphabetical). */
export function groupPantry(items: PantryItem[], { view, category, search }: { view: PantryView; category: string; search: string }) {
  const query = search.trim().toLowerCase()
  const visible = items.filter(item => matchesView[view](item)
    && (category === 'all' || item.ingredient.category === category)
    && (!query || item.ingredient.name.toLowerCase().includes(query) || item.ingredient.category.toLowerCase().includes(query)))
  const groups = new Map<string, PantryItem[]>()
  for (const item of visible) groups.set(item.ingredient.category, [...(groups.get(item.ingredient.category) ?? []), item])
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, rows]) => ({ name, items: rows.sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name)) }))
}

export const categoriesOf = (items: PantryItem[]) => [...new Set(items.map(item => item.ingredient.category))].sort()
