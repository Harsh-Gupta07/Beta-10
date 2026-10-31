import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import type { RecipeSummary } from '../../lib/api'
import { ALLERGEN_LABEL, DIET_LABEL } from '../../lib/food'
import { Badge } from '../../components/ui'

export function DietBadge({ recipe }: { recipe: Pick<RecipeSummary, 'dietType'> }) {
  if (!recipe.dietType) return <Badge tone="grey">Diet unknown</Badge>
  return <Badge tone={recipe.dietType === 'NON_VEGETARIAN' ? 'red' : recipe.dietType === 'EGGETARIAN' ? 'amber' : 'green'}>{DIET_LABEL[recipe.dietType]}</Badge>
}

/** Compact status for recipe cards. */
export function SafetyBadge({ recipe }: { recipe: Pick<RecipeSummary, 'safety'> }) {
  const { status, conflicts } = recipe.safety
  if (status === 'CONFLICT') {
    const people = [...new Set(conflicts.map(c => c.member))]
    return <Badge tone="red">Not for {people.join(', ')}</Badge>
  }
  if (status === 'UNKNOWN') return <Badge tone="grey">Check ingredients</Badge>
  return null
}

/** Full explanation on the recipe page: who it clashes with and why, and what nobody has checked. */
export function SafetyPanel({ recipe }: { recipe: Pick<RecipeSummary, 'safety' | 'allergens'> }) {
  const { status, conflicts, uncertain } = recipe.safety
  return <div className={`safety-panel ${status.toLowerCase()}`} role={status === 'CONFLICT' ? 'alert' : undefined}>
    {status === 'CONFLICT' && <>
      <p className="safety-title"><ShieldAlert size={16} aria-hidden />Not suitable for everyone</p>
      <ul>{conflicts.map((c, i) => <li key={i}><strong>{c.member}</strong>: {c.reason}{c.kind === 'ALLERGY' ? ' (allergy)' : ''}</li>)}</ul>
    </>}
    {status === 'UNKNOWN' && <p className="safety-title"><ShieldQuestion size={16} aria-hidden />Check before cooking</p>}
    {status === 'SUITABLE' && <p className="safety-title"><ShieldCheck size={16} aria-hidden />Suits everyone’s stated needs</p>}
    {uncertain.length > 0 && <ul className="muted">{uncertain.map(note => <li key={note}>{note}.</li>)}</ul>}
    <p className="muted small">
      {recipe.allergens.length ? `Contains: ${recipe.allergens.map(a => ALLERGEN_LABEL[a]).join(', ')}. ` : 'No listed allergens in tagged ingredients. '}
      Based on ingredient tags and each member’s food preferences. Always check packaged products’ labels.
    </p>
  </div>
}
