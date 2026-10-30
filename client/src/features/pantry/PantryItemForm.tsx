import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { api, errorMessage, type CanonicalUnit, type Confidence, type Ingredient, type InputUnit, type PantryItem } from '../../lib/api'
import { useSession } from '../../lib/session'
import { baseUnit, toDateInput, unitOptions } from '../../lib/format'
import { Field, Modal, Notice, Segmented, Spinner } from '../../components/ui'

const confidenceOptions: Array<{ value: Confidence; label: string }> = [
  { value: 'CONFIRMED', label: 'Confirmed' }, { value: 'ESTIMATED', label: 'Estimated' }, { value: 'CHECK_NEEDED', label: 'Check needed' },
]
const familyOptions: Array<{ value: CanonicalUnit; label: string }> = [{ value: 'g', label: 'Weight (g/kg)' }, { value: 'ml', label: 'Volume (ml/L)' }, { value: 'count', label: 'Pieces' }]

type Props = { item?: PantryItem; existingIngredientIds: Set<string>; onClose: () => void; onSaved: (item: PantryItem) => void }

/** Add a new pantry item (item undefined) or edit an existing one. */
export function PantryItemForm({ item, existingIngredientIds, onClose, onSaved }: Props) {
  const { household } = useSession()
  const editing = Boolean(item)
  const [catalog, setCatalog] = useState<Ingredient[] | null>(editing ? [] : null)
  const [query, setQuery] = useState('')
  const [ingredient, setIngredient] = useState<Pick<Ingredient, 'id' | 'name' | 'category' | 'canonicalUnit'> | null>(item?.ingredient ?? null)
  const [custom, setCustom] = useState<{ name: string; category: string; canonicalUnit: CanonicalUnit } | null>(null)
  const family: CanonicalUnit = ingredient?.canonicalUnit ?? custom?.canonicalUnit ?? 'g'
  const [unit, setUnit] = useState<InputUnit>(item ? baseUnit[item.unit] : 'g')
  const [quantity, setQuantity] = useState(item?.quantity ?? '')
  const [threshold, setThreshold] = useState(item?.lowStockThreshold ?? '')
  const [confidence, setConfidence] = useState<Confidence>(item?.confidence ?? 'CONFIRMED')
  const [source, setSource] = useState<'MANUAL' | 'PURCHASE'>('MANUAL')
  const [purchasedAt, setPurchasedAt] = useState(toDateInput(item?.purchasedAt ?? null))
  const [expiresAt, setExpiresAt] = useState(toDateInput(item?.expiresAt ?? null))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (editing) return
    api.get<Ingredient[]>(`/households/${household.id}/ingredients`).then(r => setCatalog(r.data)).catch(err => { setCatalog([]); setError(errorMessage(err, 'Could not load ingredients.')) })
  }, [editing, household.id])

  // Keep the unit valid for the chosen ingredient's measurement family.
  useEffect(() => { if (!unitOptions[family].includes(unit)) setUnit(baseUnit[family]) }, [family, unit])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (catalog ?? []).filter(i => !existingIngredientIds.has(i.id) && (!q || i.name.toLowerCase().includes(q))).slice(0, q ? 8 : 12)
  }, [catalog, query, existingIngredientIds])
  const exactMatch = (catalog ?? []).some(i => i.name.toLowerCase() === query.trim().toLowerCase())

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!ingredient && !custom) return setError('Choose an ingredient first.')
    setBusy(true)
    const dates = { purchasedAt: purchasedAt || null, expiresAt: expiresAt || null }
    const lowStockThreshold = threshold === '' ? null : threshold
    try {
      if (item) {
        const { data } = await api.patch<PantryItem>(`/households/${household.id}/pantry/${item.id}`, { quantity, unit, lowStockThreshold, confidence, ...dates })
        onSaved(data)
      } else {
        let ingredientId = ingredient?.id
        if (!ingredientId && custom) {
          const created = await api.post<Ingredient>(`/households/${household.id}/ingredients`, custom)
          ingredientId = created.data.id
          setIngredient(created.data); setCustom(null)
        }
        const { data } = await api.post<PantryItem>(`/households/${household.id}/pantry`, { ingredientId, quantity, unit, lowStockThreshold, confidence, source, ...dates })
        onSaved(data)
      }
    } catch (err) { setError(errorMessage(err, 'Could not save this item.')) }
    finally { setBusy(false) }
  }

  const chosenName = ingredient?.name ?? custom?.name
  return <Modal title={editing ? `Edit ${item!.ingredient.name}` : 'Add to pantry'} subtitle={editing ? 'Changing the quantity is recorded in stock history.' : 'Record what you have on hand right now.'} onClose={onClose}
    footer={<><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button form="pantry-item-form" className="primary-button" disabled={busy || (!ingredient && !custom)}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add item'}</button></>}>
    {error && <Notice>{error}</Notice>}
    <form id="pantry-item-form" className="form-grid" onSubmit={submit}>
      {!editing && <div className="full">
        {chosenName
          ? <div className="chosen-ingredient"><span><strong>{chosenName}</strong><small>{ingredient?.category ?? custom?.category} · measured in {family === 'count' ? 'pieces' : family}{custom && ' · new custom ingredient'}</small></span><button type="button" className="link-button" onClick={() => { setIngredient(null); setCustom(null) }}>Change</button></div>
          : <Field label="Ingredient">
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search e.g. rice, milk, paneer" autoComplete="off" />
              {catalog === null ? <Spinner label="Loading ingredients…" /> : <div className="picker-list" role="listbox" aria-label="Ingredients">
                {matches.map(i => <button type="button" role="option" aria-selected={false} key={i.id} onClick={() => { setIngredient(i); setQuery('') }}><span>{i.name}</span><small>{i.category}</small></button>)}
                {query.trim().length >= 2 && !exactMatch && <button type="button" className="create-option" onClick={() => setCustom({ name: query.trim(), category: 'Other', canonicalUnit: 'g' })}><Plus size={14} aria-hidden /> Create “{query.trim()}” as a custom ingredient</button>}
                {!matches.length && query.trim().length < 2 && <p className="picker-empty">Everything in the catalog is already in your pantry. Type a name to create a custom ingredient.</p>}
              </div>}
            </Field>}
      </div>}

      {custom && <>
        <Field label="Category"><input value={custom.category} onChange={e => setCustom({ ...custom, category: e.target.value })} maxLength={40} /></Field>
        <Field label="Measured by" hint="Can’t be changed later, so recipes and stock stay comparable.">
          <select value={custom.canonicalUnit} onChange={e => setCustom({ ...custom, canonicalUnit: e.target.value as CanonicalUnit })}>{familyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </Field>
      </>}

      <Field label="Quantity on hand">
        <div className="quantity-input"><input value={quantity} onChange={e => setQuantity(e.target.value)} inputMode="decimal" required pattern="\d+(\.\d+)?" title="A number, e.g. 500 or 1.5" placeholder="0" />
          <select value={unit} onChange={e => setUnit(e.target.value as InputUnit)} aria-label="Unit">{unitOptions[family].map(u => <option key={u} value={u}>{u === 'l' ? 'L' : u}</option>)}</select></div>
      </Field>
      <Field label="Low-stock alert at" hint={`Optional, in ${unit === 'l' ? 'L' : unit}.`}>
        <input value={threshold} onChange={e => setThreshold(e.target.value)} inputMode="decimal" pattern="\d+(\.\d+)?" title="A number, e.g. 200" placeholder="No alert" />
      </Field>

      <div className="full"><span className="field-label">How sure are you of this amount?</span>
        <Segmented label="Stock confidence" value={confidence} options={confidenceOptions} onChange={setConfidence} />
      </div>
      {!editing && <div className="full"><span className="field-label">Where did it come from?</span>
        <Segmented label="Stock source" value={source} options={[{ value: 'MANUAL', label: 'Already had it' }, { value: 'PURCHASE', label: 'Just bought it' }]} onChange={setSource} />
      </div>}

      <Field label="Purchased on"><input type="date" value={purchasedAt} onChange={e => setPurchasedAt(e.target.value)} /></Field>
      <Field label="Expires on"><input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></Field>
    </form>
  </Modal>
}
