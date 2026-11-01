import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightLeft, BookOpen, ChefHat, CircleX, Repeat, Utensils } from 'lucide-react'
import { api, errorMessage, type MealSlot, type PlannedMeal, type RecipeSummary } from '../../lib/api'
import { useSession } from '../../lib/session'
import { formatDay, formatQuantity, slotLabel, slots, statusLabel } from '../../lib/format'
import { Badge, Modal, Notice } from '../../components/ui'
import { RecipePicker } from './RecipePicker'
import { ServingsStepper } from './AddMealDialog'
import { WhoIsEating } from '../suggestions/WhoIsEating'
import { RecipePhoto } from '../recipes/RecipePhoto'

type Props = { meal: PlannedMeal; today: string; recipes: RecipeSummary[]; onClose: () => void; onChanged: () => Promise<void>; onCook: () => void }

const statusTone = { PLANNED: 'blue', COOKING: 'amber', COMPLETED: 'green', CANCELLED: 'grey' } as const

export function MealSheet({ meal, today, recipes, onClose, onChanged, onCook }: Props) {
  const { household } = useSession()
  const editable = meal.status === 'PLANNED' && !meal.isPast
  const [mode, setMode] = useState<'idle' | 'recipe' | 'move' | 'cancel'>('idle')
  const [servings, setServings] = useState(meal.servings)
  const [moveDate, setMoveDate] = useState(meal.date)
  const [moveSlot, setMoveSlot] = useState<MealSlot>(meal.slot)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showConsumption, setShowConsumption] = useState(false)
  const path = `/households/${household.id}/meals/${meal.id}`

  async function run(request: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await request(); await onChanged(); setMode('idle') }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }

  const short = meal.lines.filter(l => l.shortage && l.shortage !== '0')
  return <Modal wide title={meal.recipe.name} onClose={onClose}
    subtitle={<span className="meal-subtitle">{formatDay(meal.date, 'long')} · {slotLabel[meal.slot]} <Badge tone={statusTone[meal.status]}>{statusLabel[meal.status]}</Badge></span>}
    footer={mode === 'cancel'
      ? <><span className="confirm-text">Cancel this meal? Its reserved stock is released.</span><button className="ghost-button" onClick={() => setMode('idle')}>Keep it</button><button className="danger-button" disabled={busy} onClick={() => run(() => api.post(`${path}/cancel`))}>{busy ? 'Cancelling…' : 'Cancel meal'}</button></>
      : <><Link className="ghost-button" to={`/recipes/${meal.recipe.id}`}><BookOpen size={15} aria-hidden />View recipe</Link>
          {editable && <button className="ghost-button danger-text" onClick={() => setMode('cancel')}><CircleX size={15} aria-hidden />Cancel meal</button>}
          {(meal.status === 'PLANNED' || meal.status === 'COOKING') && <button className="primary-button" onClick={onCook}><ChefHat size={15} aria-hidden />{meal.status === 'COOKING' ? 'Continue cooking' : 'Cook'}</button>}
          {meal.status === 'COMPLETED' && <button className="secondary-button" onClick={onCook}><ChefHat size={15} aria-hidden />See what was used</button>}</>}>
    {error && <Notice>{error}</Notice>}
    <RecipePhoto name={meal.recipe.name} variant="hero" showSource />

    {editable && <div className="sheet-toolbar">
      <ServingsStepper value={servings} onChange={setServings} />
      {servings !== meal.servings && <button className="primary-button" disabled={busy} onClick={() => run(() => api.patch(path, { servings }))}>Save servings</button>}
      <span className="toolbar-spacer" />
      <button className={`choice-button compact ${mode === 'recipe' ? 'active' : ''}`} onClick={() => setMode(mode === 'recipe' ? 'idle' : 'recipe')}><Repeat size={15} aria-hidden />Change recipe</button>
      <button className={`choice-button compact ${mode === 'move' ? 'active' : ''}`} onClick={() => setMode(mode === 'move' ? 'idle' : 'move')}><ArrowRightLeft size={15} aria-hidden />Move</button>
    </div>}
    {!editable && <p className="muted small">{meal.status === 'PLANNED' ? 'This meal is in the past, so it no longer reserves stock.' : meal.status === 'CANCELLED' ? 'Cancelled meals don’t reserve any stock.' : `This meal is ${statusLabel[meal.status].toLowerCase()} and can’t be changed here.`}</p>}

    {mode === 'recipe' && <section className="sheet-section">
      <h3>Choose a different recipe</h3>
      <RecipePicker recipes={recipes} selectedId={meal.recipe.id} onSelect={recipe => recipe.id !== meal.recipe.id && run(() => api.patch(path, { recipeId: recipe.id }))} />
    </section>}

    {mode === 'move' && <section className="sheet-section">
      <h3>Move to another day or meal</h3>
      <div className="inline-form">
        <input type="date" value={moveDate} min={today} onChange={e => setMoveDate(e.target.value)} aria-label="New date" />
        <select value={moveSlot} onChange={e => setMoveSlot(e.target.value as MealSlot)} aria-label="New meal slot">{slots.map(s => <option key={s} value={s}>{slotLabel[s]}</option>)}</select>
        <button className="primary-button" disabled={busy || (moveDate === meal.date && moveSlot === meal.slot)} onClick={() => run(() => api.patch(path, { date: moveDate, slot: moveSlot }))}>Move meal</button>
      </div>
    </section>}

    {meal.status !== 'CANCELLED' && <section className="sheet-section"><WhoIsEating kind="meal" id={meal.id} /></section>}
    {meal.status !== 'CANCELLED' && <section className="sheet-section">
      <div className="row-between"><div><h3>Personal nutrition</h3><p className="muted small">Cooking changes pantry stock. Consuming updates each person’s private nutrition totals.</p></div><button className="secondary-button" onClick={() => setShowConsumption(value => !value)}><Utensils size={15} />{showConsumption ? 'Close' : 'Mark as consumed'}</button></div>
      {showConsumption && <ConsumptionPanel householdId={household.id} mealId={meal.id} defaultServings={1} />}
    </section>}

    <section className="sheet-section">
      <h3>Ingredients for {meal.servings} servings</h3>
      {meal.reservesStock && <div className={`pantry-check ${short.length ? 'short' : 'ok'}`}>
        {short.length ? `${short.length} ingredient${short.length === 1 ? ' is' : 's are'} short after earlier meals take their share.` : 'Your pantry covers this meal, after earlier meals are accounted for.'}
      </div>}
      <ul className="requirement-table">
        <li className="head"><span>Ingredient</span><span>Needed</span>{meal.reservesStock && <><span>Reserved</span><span>Short</span></>}</li>
        {meal.lines.map(line => {
          const isShort = line.shortage !== null && line.shortage !== '0'
          return <li key={line.ingredient.id} className={isShort ? 'is-short' : ''}>
            <span>{line.ingredient.name}</span>
            <span>{formatQuantity(line.required, line.unit)}</span>
            {meal.reservesStock && <>
              <span>{formatQuantity(line.allocated ?? 0, line.unit)}</span>
              <span>{isShort ? <Badge tone="red">{formatQuantity(line.shortage!, line.unit)}</Badge> : <Badge tone="green">None</Badge>}</span>
            </>}
          </li>
        })}
      </ul>
      <p className="muted small">“Reserved” is pantry stock set aside for this meal. Nothing is deducted until the meal is cooked.</p>
    </section>
  </Modal>
}

function ConsumptionPanel({ householdId, mealId, defaultServings }: { householdId: string; mealId: string; defaultServings: number }) {
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>([])
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [existing, setExisting] = useState<Array<{ user: { id: string; name: string }; servings: string }>>([])
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const load = async () => { const [people, logs] = await Promise.all([api.get(`/households/${householdId}/members`), api.get(`/households/${householdId}/meals/${mealId}/consumption`)]); setMembers(people.data); setExisting(logs.data) }
  useEffect(() => { void load().catch(err => setMessage(errorMessage(err))) }, [householdId, mealId])
  async function confirm() { const portions = Object.entries(selected).filter(([, servings]) => servings > 0).map(([userId, servings]) => ({ userId, servings })); if (!portions.length) return setMessage('Choose at least one person.'); setBusy(true); try { await api.post(`/households/${householdId}/meals/${mealId}/consume`, { portions }); setMessage('Nutrition updated. Repeating this confirmation will not count twice.'); await load() } catch (err) { setMessage(errorMessage(err)) } finally { setBusy(false) } }
  return <div className="consumption-panel">{members.map(member => { const consumed = existing.find(log => log.user.id === member.id); const active = selected[member.id] !== undefined; return <div className="consumption-row" key={member.id}><label><input type="checkbox" checked={active || Boolean(consumed)} disabled={Boolean(consumed)} onChange={event => setSelected(current => { const next = { ...current }; if (event.target.checked) next[member.id] = defaultServings; else delete next[member.id]; return next })} /> <strong>{member.name}</strong></label>{consumed ? <Badge tone="green">Consumed {consumed.servings} serving</Badge> : active && <label>Servings <input type="number" min="0.1" max="20" step="0.1" value={selected[member.id]} onChange={event => setSelected(current => ({ ...current, [member.id]: Number(event.target.value) }))} /></label>}</div>})}{message && <p className="muted small">{message}</p>}<button className="primary-button" disabled={busy} onClick={() => void confirm()}>{busy ? 'Saving…' : 'Confirm portions'}</button></div>
}
