import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { api, errorMessage, type MealSlot, type RecipeSummary } from '../../lib/api'
import { useSession } from '../../lib/session'
import { formatDay, slotLabel } from '../../lib/format'
import { Modal, Notice } from '../../components/ui'
import { RecipePicker } from './RecipePicker'

type Props = { date: string; slot: MealSlot; recipes: RecipeSummary[]; defaultServings: number; onClose: () => void; onAdded: () => void }

export function AddMealDialog({ date, slot, recipes, defaultServings, onClose, onAdded }: Props) {
  const { household } = useSession()
  const [recipe, setRecipe] = useState<RecipeSummary | null>(null)
  const [servings, setServings] = useState(defaultServings)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!recipe) return
    setBusy(true); setError('')
    try { await api.post(`/households/${household.id}/meals`, { date, slot, recipeId: recipe.id, servings }); onAdded() }
    catch (err) { setError(errorMessage(err, 'Could not plan this meal.')); setBusy(false) }
  }

  return <Modal title={`Plan ${slotLabel[slot].toLowerCase()}`} subtitle={formatDay(date, 'long')} onClose={onClose}
    footer={<>
      <ServingsStepper value={servings} onChange={setServings} />
      <button className="ghost-button" onClick={onClose}>Cancel</button>
      <button className="primary-button" onClick={save} disabled={!recipe || busy}>{busy ? 'Planning…' : recipe ? `Plan ${recipe.name}` : 'Choose a recipe'}</button>
    </>}>
    {error && <Notice>{error}</Notice>}
    <RecipePicker recipes={recipes} selectedId={recipe?.id} onSelect={setRecipe} />
    <p className="muted small">Planning reserves pantry stock for this meal but doesn’t deduct anything. Stock is only used when you cook.</p>
  </Modal>
}

export function ServingsStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="stepper footer-stepper" role="group" aria-label="Servings">
    <button type="button" className="icon-button" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} aria-label="Fewer servings"><Minus size={16} /></button>
    <span aria-live="polite">{value}</span>
    <button type="button" className="icon-button" onClick={() => onChange(Math.min(50, value + 1))} disabled={value >= 50} aria-label="More servings"><Plus size={16} /></button>
    <small>servings</small>
  </div>
}
