import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPlus, Check, Clock, EyeOff, Heart, ThumbsDown, TriangleAlert } from 'lucide-react'
import { api, errorMessage, type MealSlot, type Suggestion } from '../../lib/api'
import { useSession } from '../../lib/session'
import { slotLabel, slots } from '../../lib/format'
import { Badge, Field, Modal, Notice } from '../../components/ui'
import { DietBadge, SafetyBadge } from '../recipes/RecipeSafety'
import { ServingsStepper } from '../planner/AddMealDialog'

export type MyDishPrefs = { favourite: Set<string>; disliked: Set<string> }

type Props = {
  suggestion: Suggestion
  prefs?: MyDishPrefs
  compact?: boolean
  /** Called after any action so the list can refresh. */
  onChanged: (message: string) => void
  defaultSlot?: MealSlot | null
  today: string
}

export function SuggestionCard({ suggestion, prefs, compact, onChanged, defaultSlot, today }: Props) {
  const { household } = useSession()
  const { recipe, reasons } = suggestion
  const [planning, setPlanning] = useState(false)
  const [error, setError] = useState('')
  const loved = prefs?.favourite.has(recipe.id) ?? false

  async function act(request: () => Promise<unknown>, message: string) {
    setError('')
    try { await request(); onChanged(message) }
    catch (err) { setError(errorMessage(err)) }
  }
  const setPref = (kind: 'FAVOURITE' | 'DISLIKE' | null, message: string) => act(() => api.put(`/me/recipe-prefs/${recipe.id}`, { kind }), message)

  return <article className={`suggestion-card ${compact ? 'compact' : ''}`}>
    <div className="suggestion-head">
      <div>
        <Link to={`/recipes/${recipe.id}`} className="suggestion-name">{recipe.name}</Link>
        <p className="recipe-meta"><span><Clock size={13} aria-hidden />{recipe.prepMinutes + recipe.cookMinutes} min</span>{recipe.cuisine && <span>{recipe.cuisine}</span>}</p>
      </div>
      <div className="badge-row">
        {recipe.missingCount === 0 ? <Badge tone="green">Ready</Badge> : <Badge tone="amber">Missing {recipe.missingCount}</Badge>}
        <DietBadge recipe={recipe} />
        <SafetyBadge recipe={recipe} />
      </div>
    </div>
    <ul className="reason-list">{reasons.slice(0, compact ? 3 : undefined).map(reason => <li key={reason.text} className={reason.tone}>
      {reason.tone === 'good' ? <Check size={13} aria-hidden /> : <TriangleAlert size={13} aria-hidden />}{reason.text}
    </li>)}</ul>
    {error && <Notice>{error}</Notice>}
    {!compact && <div className="suggestion-actions">
      <button className="primary-button" onClick={() => setPlanning(true)}><CalendarPlus size={15} aria-hidden />Plan it</button>
      <button className="ghost-button" onClick={() => act(() => api.post(`/households/${household.id}/suggestions/${recipe.id}/snooze`), `${recipe.name} is hidden for 3 days.`)} title="Hide for 3 days for everyone"><EyeOff size={15} aria-hidden />Not today</button>
      <button className={`ghost-button ${loved ? 'is-on' : ''}`} aria-pressed={loved} onClick={() => setPref(loved ? null : 'FAVOURITE', loved ? `${recipe.name} removed from your favourites.` : `${recipe.name} added to your favourites.`)}><Heart size={15} aria-hidden />{loved ? 'Loved' : 'Love it'}</button>
      <button className="ghost-button" onClick={() => setPref('DISLIKE', `We won’t suggest ${recipe.name} for you. Change this in Food Preferences.`)}><ThumbsDown size={15} aria-hidden />Don’t suggest for me</button>
    </div>}
    {planning && <PlanDialog recipe={recipe} today={today} defaultSlot={defaultSlot ?? 'DINNER'} onClose={() => setPlanning(false)}
      onPlanned={(date, slot) => { setPlanning(false); onChanged(`${recipe.name} is planned for ${slotLabel[slot].toLowerCase()} on ${date}.`) }} />}
  </article>
}

/** Confirms the day, meal and servings before planning; planning reserves stock but never uses it. */
export function PlanDialog({ recipe, today, defaultSlot, defaultServings, onClose, onPlanned }: { recipe: Pick<Suggestion['recipe'], 'id' | 'name'>; today: string; defaultSlot: MealSlot; defaultServings?: number; onClose: () => void; onPlanned: (date: string, slot: MealSlot) => void }) {
  const { household } = useSession()
  const [date, setDate] = useState(today)
  const [slot, setSlot] = useState<MealSlot>(defaultSlot)
  const [servings, setServings] = useState(defaultServings ?? household.defaultServings)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setBusy(true); setError('')
    try { await api.post(`/households/${household.id}/meals`, { date, slot, recipeId: recipe.id, servings }); onPlanned(date, slot) }
    catch (err) { setError(errorMessage(err, 'Could not plan this meal.')); setBusy(false) }
  }
  return <Modal title={`Plan ${recipe.name}`} subtitle="Planning reserves pantry stock but doesn’t use it. Stock is only used when you cook." onClose={onClose}
    footer={<><ServingsStepper value={servings} onChange={setServings} /><button className="ghost-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={save} disabled={busy || !date}>{busy ? 'Planning…' : 'Plan meal'}</button></>}>
    {error && <Notice>{error}</Notice>}
    <div className="form-grid">
      <Field label="Day"><input type="date" value={date} min={today} onChange={e => setDate(e.target.value)} required /></Field>
      <Field label="Meal"><select value={slot} onChange={e => setSlot(e.target.value as MealSlot)}>{slots.map(s => <option key={s} value={s}>{slotLabel[s]}</option>)}</select></Field>
    </div>
  </Modal>
}
