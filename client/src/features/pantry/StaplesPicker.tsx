import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, errorMessage, type CanonicalUnit, type InputUnit } from '../../lib/api'
import { unitOptions } from '../../lib/format'
import { Notice, Spinner } from '../../components/ui'

type Staple = { ingredient: { id: string; name: string; category: string; canonicalUnit: CanonicalUnit }; suggested: { quantity: string; unit: InputUnit }; common: boolean; inPantry: boolean }
type Choice = { checked: boolean; quantity: string; unit: InputUnit }

/**
 * Tick common Indian staples instead of typing them one by one. Typical amounts are filled in and editable;
 * everything added here is saved as Estimated, to be confirmed later with a quick stock check.
 */
export function StaplesPicker({ householdId, submitLabel, onDone, footer }: { householdId: string; submitLabel?: (count: number) => string; onDone: (result: { added: number; skipped: number }) => void | Promise<void>; footer?: React.ReactNode }) {
  const [staples, setStaples] = useState<Staple[] | null>(null)
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Staple[]>(`/households/${householdId}/pantry/staples`)
      setStaples(data)
      setChoices(Object.fromEntries(data.map(s => [s.ingredient.id, { checked: s.common && !s.inPantry, quantity: s.suggested.quantity, unit: s.suggested.unit }])))
    } catch (err) { setError(errorMessage(err, 'Could not load the staples list.')) }
  }, [householdId])
  useEffect(() => { void load() }, [load])

  const groups = useMemo(() => {
    const map = new Map<string, Staple[]>()
    for (const s of staples ?? []) map.set(s.ingredient.category, [...(map.get(s.ingredient.category) ?? []), s])
    return [...map.entries()]
  }, [staples])
  const set = (id: string, patch: Partial<Choice>) => setChoices(prev => ({ ...prev, [id]: { ...prev[id]!, ...patch } }))
  const ticked = (staples ?? []).filter(s => !s.inPantry && choices[s.ingredient.id]?.checked)
  const invalid = ticked.find(s => !(Number(choices[s.ingredient.id]!.quantity) > 0))

  async function submit() {
    if (invalid) return setError(`Enter an amount for ${invalid.ingredient.name}.`)
    setBusy(true); setError('')
    try {
      const { data } = await api.post<{ added: number; skipped: number }>(`/households/${householdId}/pantry/staples`, {
        items: ticked.map(s => ({ ingredientId: s.ingredient.id, quantity: choices[s.ingredient.id]!.quantity, unit: choices[s.ingredient.id]!.unit })),
      })
      await onDone(data)
    } catch (err) { setError(errorMessage(err, 'Could not add your staples.')); setBusy(false) }
  }

  if (!staples) return error ? <Notice onRetry={load}>{error}</Notice> : <Spinner label="Loading staples…" />
  const selectAll = (checked: boolean, onlyCommon = false) => setChoices(prev => Object.fromEntries(staples.map(s => [s.ingredient.id, { ...prev[s.ingredient.id]!, checked: !s.inPantry && checked && (!onlyCommon || s.common) }])))

  return <div className="staples">
    <div className="staples-toolbar">
      <span><strong>{ticked.length}</strong> ticked</span>
      <button type="button" className="link-button" onClick={() => selectAll(true, true)}>Tick everyday staples</button>
      <button type="button" className="link-button" onClick={() => selectAll(false)}>Clear all</button>
    </div>
    {error && <Notice>{error}</Notice>}
    {groups.map(([category, items]) => <section key={category} className="staple-group" aria-label={category}>
      <h3>{category}</h3>
      <ul>{items.map(s => {
        const choice = choices[s.ingredient.id]!
        const id = `staple-${s.ingredient.id}`
        return <li key={s.ingredient.id} className={`staple-row ${choice.checked ? 'on' : ''} ${s.inPantry ? 'have' : ''}`}>
          <label htmlFor={id} className="staple-name">
            <input id={id} type="checkbox" checked={choice.checked} disabled={s.inPantry} onChange={e => set(s.ingredient.id, { checked: e.target.checked })} />
            <span>{s.ingredient.name}</span>
          </label>
          {s.inPantry ? <small className="muted">Already in pantry</small>
            : <span className="staple-amount">
                <input aria-label={`${s.ingredient.name} amount`} value={choice.quantity} inputMode="decimal" disabled={!choice.checked}
                  onChange={e => set(s.ingredient.id, { quantity: e.target.value.replace(/[^\d.]/g, '') })} />
                <select aria-label={`${s.ingredient.name} unit`} value={choice.unit} disabled={!choice.checked} onChange={e => set(s.ingredient.id, { unit: e.target.value as InputUnit })}>
                  {unitOptions[s.ingredient.canonicalUnit].map(u => <option key={u} value={u}>{u === 'l' ? 'L' : u}</option>)}
                </select>
              </span>}
        </li>
      })}</ul>
    </section>)}
    <p className="muted small">Amounts are a starting guess and saved as <strong>Estimated</strong>. Fix any of them later, or run a quick stock check.</p>
    <div className="staples-actions">
      {footer}
      <button type="button" className="primary-button" onClick={submit} disabled={busy || ticked.length === 0}>{busy ? 'Adding…' : submitLabel ? submitLabel(ticked.length) : `Add ${ticked.length} staple${ticked.length === 1 ? '' : 's'}`}</button>
    </div>
  </div>
}
