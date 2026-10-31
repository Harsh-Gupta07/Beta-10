import { useEffect, useMemo, useState } from 'react'
import { ChefHat, CircleCheck, Pause } from 'lucide-react'
import { api, errorMessage, type CookingView, type InputUnit } from '../../lib/api'
import { useSession } from '../../lib/session'
import { baseUnit, formatDay, formatQuantity, slotLabel, unitOptions } from '../../lib/format'
import { Badge, Modal, Notice, Spinner } from '../../components/ui'

type Props = { mealId: string; onClose: () => void; onChanged: () => void }

/** Cooking mode: follow the method, confirm what was actually used, and complete the meal. */
export function CookingDialog({ mealId, onClose, onChanged }: Props) {
  const { household } = useSession()
  const path = `/households/${household.id}/meals/${mealId}`
  const [view, setView] = useState<CookingView | null>(null)
  const [usage, setUsage] = useState<Record<string, { quantity: string; unit: InputUnit }>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ warnings: string[]; alreadyCompleted: boolean } | null>(null)
  // One key per dialog: a double-click or retry sends the same key, and the server deducts only once.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [])

  useEffect(() => {
    api.get<CookingView>(`${path}/cooking`).then(({ data }) => {
      setView(data)
      setUsage(Object.fromEntries(data.lines.map(l => [l.ingredient.id, { quantity: l.planned, unit: baseUnit[l.unit] }])))
    }).catch(err => setError(errorMessage(err, 'This meal could not be loaded.')))
  }, [path])

  async function act(request: () => Promise<{ data: unknown }>) {
    setBusy(true); setError('')
    try {
      const { data } = await request()
      const next = (data as { meal?: CookingView }).meal ?? (await api.get<CookingView>(`${path}/cooking`)).data
      setView(next)
      if ((data as { warnings?: string[] }).warnings) setResult(data as { warnings: string[]; alreadyCompleted: boolean })
      onChanged()
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }

  const complete = () => act(() => api.post(`${path}/complete`, {
    idempotencyKey,
    usage: Object.entries(usage).filter(([, u]) => u.quantity.trim() !== '').map(([ingredientId, u]) => ({ ingredientId, quantity: u.quantity.trim(), unit: u.unit })),
  }))

  const done = view?.status === 'COMPLETED'
  const footer = !view ? undefined : done
    ? <button className="primary-button" onClick={onClose}>Close</button>
    : view.status === 'CANCELLED' ? <button className="ghost-button" onClick={onClose}>Close</button>
    : <>
        {view.status === 'COOKING'
          ? <button className="ghost-button" disabled={busy} onClick={() => act(() => api.post(`${path}/stop`))}><Pause size={15} aria-hidden />Not cooking yet</button>
          : <button className="secondary-button" disabled={busy} onClick={() => act(() => api.post(`${path}/start`))}><ChefHat size={15} aria-hidden />Start cooking</button>}
        <button className="primary-button" disabled={busy} onClick={complete}><CircleCheck size={15} aria-hidden />{busy ? 'Saving…' : 'Mark as cooked'}</button>
      </>

  return <Modal wide title={view ? `Cook ${view.recipe.name}` : 'Cooking'} onClose={onClose} footer={footer}
    subtitle={view && <span className="meal-subtitle">{formatDay(view.date, 'long')} · {slotLabel[view.slot]} · {view.servings} servings {view.status === 'COOKING' && <Badge tone="amber">Cooking</Badge>}{done && <Badge tone="green">Completed</Badge>}</span>}>
    {error && <Notice>{error}</Notice>}
    {!view && !error && <Spinner label="Loading…" />}
    {result && <Notice tone={result.warnings.length ? 'warning' : 'success'}>
      {result.alreadyCompleted ? 'This meal was already completed, so nothing was deducted again.' : 'Done! Ingredients were deducted from your pantry.'}
      {result.warnings.map(w => <span key={w} className="block-line">{w}</span>)}
    </Notice>}

    {view && <>
      <section className="sheet-section">
        <h3>{done ? 'What was used' : 'Confirm what you actually used'}</h3>
        {!done && <p className="muted small">Adjust any amount that differed from the recipe. Set it to 0 for anything you skipped. Stock is deducted once, when you mark the meal as cooked.</p>}
        <ul className="usage-table">
          <li className="head"><span>Ingredient</span><span>Recipe</span><span>In pantry</span><span>{done ? 'Deducted' : 'Used'}</span></li>
          {view.lines.map(line => <li key={line.ingredient.id}>
            <span><strong>{line.ingredient.name}</strong>{line.note && <small>{line.note}</small>}</span>
            <span data-label="Recipe">{formatQuantity(line.planned, line.unit)}</span>
            <span data-label="In pantry">{line.inPantry === null ? <Badge tone="grey">Not tracked</Badge> : formatQuantity(line.inPantry, line.unit)}</span>
            <span data-label={done ? 'Deducted' : 'Used'}>{done
              ? (line.used ? formatQuantity(line.used, line.unit) : '—')
              : <span className="quantity-input compact">
                  <input value={usage[line.ingredient.id]?.quantity ?? ''} inputMode="decimal" pattern="\d+(\.\d+)?" aria-label={`${line.ingredient.name} used`}
                    onChange={e => setUsage(prev => ({ ...prev, [line.ingredient.id]: { ...prev[line.ingredient.id]!, quantity: e.target.value } }))} />
                  <select value={usage[line.ingredient.id]?.unit} aria-label="Unit" onChange={e => setUsage(prev => ({ ...prev, [line.ingredient.id]: { ...prev[line.ingredient.id]!, unit: e.target.value as InputUnit } }))}>
                    {unitOptions[line.unit].map(u => <option key={u} value={u}>{u === 'l' ? 'L' : u}</option>)}
                  </select>
                </span>}
            </span>
          </li>)}
        </ul>
      </section>
      {view.recipe.instructions.length > 0 && <section className="sheet-section">
        <h3>Method</h3>
        <ol className="steps">{view.recipe.instructions.map((step, i) => <li key={i}><span className="step-no">{i + 1}</span><p>{step}</p></li>)}</ol>
      </section>}
    </>}
  </Modal>
}
