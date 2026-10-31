import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { History, Info, Trash2, Undo2, Users, UtensilsCrossed } from 'lucide-react'
import { api, errorMessage, type FoodPreferences, type HistoryData, type MealSlot, type RecipeSummary, type SuggestionsData } from '../../lib/api'
import { useSession } from '../../lib/session'
import { addDays, formatDay, relativeDay, slotLabel, slots } from '../../lib/format'
import { Badge, EmptyState, Field, Notice, PageHeader, Segmented, Spinner } from '../../components/ui'
import { SuggestionCard, type MyDishPrefs } from './SuggestionCard'
import { WhoIsEating } from './WhoIsEating'

type SlotChoice = MealSlot | 'ANY'

export function SuggestionsPage() {
  const { household } = useSession()
  const [scope, setScope] = useState<'household' | 'me'>('household')
  const [slot, setSlot] = useState<SlotChoice>('ANY')
  const [data, setData] = useState<SuggestionsData | null>(null)
  const [history, setHistory] = useState<HistoryData | null>(null)
  const [prefs, setPrefs] = useState<MyDishPrefs | undefined>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [s, h, p] = await Promise.all([
        api.get<SuggestionsData>(`/households/${household.id}/suggestions`, { params: { scope, limit: 12, ...(slot === 'ANY' ? {} : { slot }) } }),
        api.get<HistoryData>(`/households/${household.id}/history`, { params: { days: 30, scope } }),
        api.get<FoodPreferences>('/me/food-preferences'),
      ])
      setData(s.data); setHistory(h.data)
      setPrefs({ favourite: new Set(p.data.favouriteRecipes.map(r => r.id)), disliked: new Set(p.data.dislikedRecipes.map(r => r.id)) })
    } catch (err) { setError(errorMessage(err, 'Suggestions could not be loaded.')) }
  }, [household.id, scope, slot])
  useEffect(() => { void load() }, [load])

  // Refresh first, so the confirmation never appears next to a stale list.
  const changed = async (message: string) => { setNotice(''); await load(); setNotice(message) }

  return <>
    <PageHeader eyebrow="WHAT TO COOK" title="Ideas for your next meal" description="Ranked from your pantry, what you’ve eaten lately and what people like. Dishes that clash with anyone’s allergies or diet are never suggested." />
    {error && <Notice onRetry={load}>{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}

    <section className="toolbar">
      <Segmented label="Cooking for" value={scope} onChange={setScope} options={[{ value: 'household', label: 'Everyone' }, { value: 'me', label: 'Just me' }]} />
      <Segmented label="Meal" value={slot} onChange={setSlot} options={[{ value: 'ANY', label: 'Any meal' }, ...slots.map(s => ({ value: s, label: slotLabel[s] }))]} />
    </section>

    {!data && !error && <Spinner label="Finding ideas…" />}
    {data && <div className="suggestions-layout">
      <section className="stack">
        {!data.hasHistory && <Notice tone="warning"><Info size={14} aria-hidden className="inline-icon" /> No eating history yet. Mark meals as cooked, or log what you ate below, and suggestions will start avoiding repeats.</Notice>}
        {data.suggestions.length === 0
          ? <section className="panel"><EmptyState icon={UtensilsCrossed} title="No suggestions right now">
              {data.excludedForSafety ? 'Every dish clashes with someone’s allergies or diet, or is hidden for now. Add recipes that suit everyone, or check Food Preferences.' : 'Add some recipes to get ideas.'}
            </EmptyState></section>
          : data.suggestions.map(s => <SuggestionCard key={s.recipe.id} suggestion={s} prefs={prefs} today={data.today} defaultSlot={data.slot} onChanged={changed} />)}
        <p className="muted small">
          {data.excludedForSafety > 0 && `${data.excludedForSafety} dish${data.excludedForSafety === 1 ? ' was' : 'es were'} left out because ${data.excludedForSafety === 1 ? 'it clashes' : 'they clash'} with someone’s allergies or diet. `}
          “Ready” uses only stock that isn’t already reserved for planned meals.
        </p>
        {data.snoozed.length > 0 && <section className="panel">
          <p className="eyebrow">HIDDEN FOR NOW</p>
          <ul className="plain-list">{data.snoozed.map(s => <li key={s.recipe.id}>
            <span>{s.recipe.name} <small className="muted">until {formatDay(s.until.slice(0, 10))}</small></span>
            <button className="link-button" onClick={() => api.delete(`/households/${household.id}/suggestions/${s.recipe.id}/snooze`).then(() => changed(`${s.recipe.name} is back in suggestions.`), err => setError(errorMessage(err)))}><Undo2 size={13} aria-hidden /> Show again</button>
          </li>)}</ul>
        </section>}
      </section>
      {history && <RecentlyEaten history={history} today={data.today} onChanged={changed} />}
    </div>}
  </>
}

function RecentlyEaten({ history, today, onChanged }: { history: HistoryData; today: string; onChanged: (message: string) => void }) {
  const { household } = useSession()
  const [open, setOpen] = useState<string | null>(null)
  return <section className="stack">
    <section className="panel">
      <p className="eyebrow">LAST 30 DAYS</p><h2 className="panel-title"><History size={16} aria-hidden className="inline-icon" />Recently eaten</h2>
      {history.dishes.length === 0
        ? <p className="muted small">Nothing yet. Meals count once they’re marked as cooked in the planner, or logged here.</p>
        : <ul className="plain-list">{history.dishes.slice(0, 8).map(d => <li key={d.recipe.id}>
            <span>{d.recipe.name}</span>
            <span className="muted small">{d.times}× · {d.daysAgo === 0 ? 'today' : d.daysAgo === 1 ? 'yesterday' : `${d.daysAgo} days ago`}</span>
          </li>)}</ul>}
      {history.meals.length > 0 && <>
        <h3 className="subhead">Meals</h3>
        <ul className="eaten-list">{history.meals.slice(0, 12).map(meal => <li key={meal.id}>
          <button className="history-row" onClick={() => setOpen(open === meal.id ? null : meal.id)} aria-expanded={open === meal.id}>
            <span><strong>{meal.recipe.name}</strong><small>{relativeDay(meal.date, today)} · {slotLabel[meal.slot]}</small></span>
            <span className="badge-row">{meal.source === 'LOGGED' && <Badge tone="grey">Logged</Badge>}<Badge tone="blue"><Users size={11} aria-hidden className="inline-icon" /> {meal.eaters.length}</Badge></span>
          </button>
          {open === meal.id && <div className="history-detail">
            <WhoIsEating kind={meal.source === 'COOKED' ? 'meal' : 'log'} id={meal.id} onSaved={() => onChanged('Updated who ate this meal.')} />
            {meal.source === 'LOGGED' && <button className="ghost-button danger-text" onClick={() => api.delete(`/households/${household.id}/eaten-logs/${meal.id}`).then(() => onChanged(`Removed ${meal.recipe.name} from your history.`))}><Trash2 size={14} aria-hidden />Remove log</button>}
          </div>}
        </li>)}</ul>
      </>}
    </section>
    <LogMealForm today={today} onLogged={onChanged} />
  </section>
}

function LogMealForm({ today, onLogged }: { today: string; onLogged: (message: string) => void }) {
  const { household } = useSession()
  const [recipes, setRecipes] = useState<RecipeSummary[]>([])
  const [recipeId, setRecipeId] = useState('')
  const [date, setDate] = useState(addDays(today, -1))
  const [slot, setSlot] = useState<MealSlot>('DINNER')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.get<{ recipes: RecipeSummary[] }>(`/households/${household.id}/recipes`).then(r => setRecipes(r.data.recipes)).catch(() => setRecipes([])) }, [household.id])
  const name = useMemo(() => recipes.find(r => r.id === recipeId)?.name, [recipes, recipeId])

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { await api.post(`/households/${household.id}/eaten-logs`, { recipeId, date, slot }); setRecipeId(''); onLogged(`Logged ${name} for ${slotLabel[slot].toLowerCase()} ${relativeDay(date, today).toLowerCase()}.`) }
    catch (err) { setError(errorMessage(err, 'Could not log this meal.')) }
    finally { setBusy(false) }
  }
  return <section className="panel">
    <p className="eyebrow">LOG A MEAL</p><h2 className="panel-title">We ate this</h2>
    <p className="muted small">For meals you didn’t cook through the planner. This only records history; it never changes your pantry.</p>
    {error && <Notice>{error}</Notice>}
    <form className="stack-form tight" onSubmit={submit}>
      <Field label="Dish"><select value={recipeId} onChange={e => setRecipeId(e.target.value)} required>
        <option value="">Choose a dish…</option>{recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select></Field>
      <div className="form-grid">
        <Field label="Day"><input type="date" value={date} max={today} min={addDays(today, -60)} onChange={e => setDate(e.target.value)} required /></Field>
        <Field label="Meal"><select value={slot} onChange={e => setSlot(e.target.value as MealSlot)}>{slots.map(s => <option key={s} value={s}>{slotLabel[s]}</option>)}</select></Field>
      </div>
      <button className="secondary-button" disabled={busy || !recipeId}>{busy ? 'Logging…' : 'Log meal'}</button>
    </form>
  </section>
}
