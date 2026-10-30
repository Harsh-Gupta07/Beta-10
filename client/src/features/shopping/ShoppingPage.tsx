import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Check, ClipboardCopy, PackageCheck, Plus, Share2, ShoppingCart, Trash2, TriangleAlert } from 'lucide-react'
import { api, errorMessage, type Ingredient, type InputUnit, type ShoppingData, type ShoppingItem } from '../../lib/api'
import { useSession } from '../../lib/session'
import { baseUnit, formatQuantity, relativeDay, slotLabel, unitOptions } from '../../lib/format'
import { Badge, EmptyState, Modal, Notice, PageHeader, Spinner } from '../../components/ui'

const isCanonical = (unit: string): unit is 'g' | 'ml' | 'count' => unit === 'g' || unit === 'ml' || unit === 'count'
const itemQty = (item: Pick<ShoppingItem, 'quantity' | 'unit'>, value = item.quantity) => isCanonical(item.unit) ? formatQuantity(value, item.unit) : `${Number(value)} ${item.unit}`

export function ShoppingPage() {
  const { household } = useSession()
  const base = `/households/${household.id}/shopping`
  const [data, setData] = useState<ShoppingData | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [receiving, setReceiving] = useState<ShoppingItem | null>(null)
  const [adding, setAdding] = useState(false)
  const [today, setToday] = useState('')

  const load = useCallback(async () => {
    setError('')
    try { setData((await api.get<ShoppingData>(base)).data) }
    catch (err) { setError(errorMessage(err, 'Your shopping list could not be loaded.')) }
  }, [base])
  useEffect(() => { void load() }, [load])
  useEffect(() => { api.get<{ today: string }>(`/households/${household.id}/planner`).then(r => setToday(r.data.today)).catch(() => undefined) }, [household.id])

  async function run(request: () => Promise<unknown>, success?: string) {
    setError(''); setNotice('')
    try { await request(); if (success) setNotice(success); await load() }
    catch (err) { setError(errorMessage(err)) }
  }

  const groups = useMemo(() => ({
    needed: data?.items.filter(i => i.status === 'NEEDED') ?? [],
    purchased: data?.items.filter(i => i.status === 'PURCHASED') ?? [],
    received: data?.items.filter(i => i.status === 'RECEIVED') ?? [],
  }), [data])
  const open = [...groups.needed, ...groups.purchased]

  const listText = () => [`${household.name}: shopping list`, ...open.map(i => `• ${i.name}: ${itemQty(i)}${i.note ? ` (${i.note})` : ''}`)].join('\n')
  async function share() {
    const text = listText()
    try {
      if (navigator.share) { await navigator.share({ title: 'Shopping list', text }); return }
      await navigator.clipboard.writeText(text); setNotice('Shopping list copied. Paste it into WhatsApp or your grocery app.')
    } catch { /* user dismissed the share sheet */ }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(listText()); setNotice('Shopping list copied. Paste it into WhatsApp or your grocery app.') }
    catch { setError('Copying isn’t allowed in this browser. Use Share instead.') }
  }

  return <>
    <PageHeader eyebrow="SHOPPING" title="Shopping list" description="Ticking an item as purchased doesn’t change your pantry. Stock goes up only when you confirm what actually arrived."
      actions={<>
        <button className="ghost-button" onClick={copy} disabled={!open.length}><ClipboardCopy size={15} aria-hidden />Copy</button>
        <button className="ghost-button" onClick={share} disabled={!open.length}><Share2 size={15} aria-hidden />Share</button>
        <button className="primary-button" onClick={() => setAdding(true)}><Plus size={16} aria-hidden />Add item</button>
      </>} />

    {error && <Notice onRetry={load}>{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    {!data && !error && <Spinner label="Loading shopping list…" />}

    {data && <>
      {data.suggestions.length > 0 && <section className="panel shortage-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">FROM YOUR MEAL PLAN</p><h2><TriangleAlert size={17} aria-hidden className="inline-icon warn" />{data.suggestions.length} ingredient{data.suggestions.length === 1 ? '' : 's'} short for planned meals</h2></div>
          <button className="secondary-button" onClick={() => run(() => api.post(`${base}/add-shortages`, {}), 'Added the shortages to your list.')}><Plus size={15} aria-hidden />Add all</button>
        </div>
        <ul className="shortage-list">{data.suggestions.map(s => <li key={s.ingredient.id}>
          <span className="shortage-main"><strong>{s.ingredient.name}</strong>
            <small>Needed for {s.affectedMeals} meal{s.affectedMeals === 1 ? '' : 's'}, first {today ? relativeDay(s.firstAffected.date, today).toLowerCase() : s.firstAffected.date} {slotLabel[s.firstAffected.slot].toLowerCase()} ({s.firstAffected.recipeName}){s.onList !== '0' && ` · ${formatQuantity(s.onList, s.unit)} already listed`}</small></span>
          <span className="shortage-side"><span className="shortage-qty">Buy {formatQuantity(s.suggested, s.unit)}</span>
            <button className="link-button small" onClick={() => run(() => api.post(`${base}/add-shortages`, { ingredientIds: [s.ingredient.id] }), `${s.ingredient.name} added.`)}>Add to list</button></span>
        </li>)}</ul>
      </section>}

      {!data.items.length
        ? <section className="panel"><EmptyState icon={ShoppingCart} title="Your shopping list is empty" action={<button className="primary-button" onClick={() => setAdding(true)}><Plus size={16} aria-hidden />Add item</button>}>
            {data.suggestions.length ? 'Add the shortages above, or anything else you need.' : 'Plan meals and anything you’re short of will appear here as a suggestion.'}</EmptyState></section>
        : <>
            <ItemGroup title="To buy" items={groups.needed} empty="Nothing left to buy."
              render={item => <>
                <button className="check-button" aria-label={`Mark ${item.name} as purchased`} onClick={() => run(() => api.patch(`${base}/items/${item.id}`, { status: 'PURCHASED' }))} />
                <ItemText item={item} />
                <button className="secondary-button small-button" onClick={() => setReceiving(item)}><PackageCheck size={14} aria-hidden />Received</button>
                <button className="icon-button" aria-label={`Remove ${item.name}`} onClick={() => run(() => api.delete(`${base}/items/${item.id}`))}><Trash2 size={15} /></button>
              </>} />
            {groups.purchased.length > 0 && <ItemGroup title="Purchased, waiting to arrive" items={groups.purchased}
              render={item => <>
                <button className="check-button checked" aria-label={`Mark ${item.name} as not purchased`} onClick={() => run(() => api.patch(`${base}/items/${item.id}`, { status: 'NEEDED' }))}><Check size={13} /></button>
                <ItemText item={item} />
                <button className="primary-button small-button" onClick={() => setReceiving(item)}><PackageCheck size={14} aria-hidden />Confirm received</button>
                <button className="icon-button" aria-label={`Remove ${item.name}`} onClick={() => run(() => api.delete(`${base}/items/${item.id}`))}><Trash2 size={15} /></button>
              </>} />}
            {groups.received.length > 0 && <ItemGroup title="Received into pantry" items={groups.received}
              action={<button className="link-button" onClick={() => run(() => api.post(`${base}/clear-received`), 'Cleared received items. Stock history is kept.')}>Clear</button>}
              render={item => <>
                <span className="check-button done"><Check size={13} /></span>
                <span className="item-text"><strong>{item.name}</strong><small>Received {itemQty(item, item.receivedQty ?? item.quantity)}{item.receivedQty && item.receivedQty !== item.quantity ? ` of ${itemQty(item)}` : ''}</small></span>
              </>} />}
          </>}
    </>}

    {receiving && <ReceiveDialog item={receiving} onClose={() => setReceiving(null)} onDone={async message => { setReceiving(null); setNotice(message); await load() }} path={`${base}/items/${receiving.id}/receive`} />}
    {adding && <AddItemDialog path={`${base}/items`} householdId={household.id} onClose={() => setAdding(false)} onAdded={async name => { setAdding(false); setNotice(`${name} added.`); await load() }} />}
  </>
}

function ItemGroup({ title, items, empty, render, action }: { title: string; items: ShoppingItem[]; empty?: string; render: (item: ShoppingItem) => ReactNode; action?: ReactNode }) {
  return <section className="pantry-group">
    <h2 className="group-title">{title}<span>{items.length}</span>{action && <span className="group-action">{action}</span>}</h2>
    {items.length ? <ul className="pantry-list shopping-list">{items.map(item => <li key={item.id} className="shopping-row">{render(item)}</li>)}</ul> : <p className="muted small">{empty}</p>}
  </section>
}

function ItemText({ item }: { item: ShoppingItem }) {
  return <span className="item-text"><strong>{item.name} <span className="item-qty">{itemQty(item)}</span></strong>
    <small>{item.source === 'SHORTAGE' ? <Badge tone="amber">For meal plan</Badge> : item.source === 'ASSISTANT' ? <Badge tone="blue">From assistant</Badge> : null}{item.note && ` ${item.note}`}{!item.ingredient && ' Not tracked in pantry'}</small></span>
}

function ReceiveDialog({ item, path, onClose, onDone }: { item: ShoppingItem; path: string; onClose: () => void; onDone: (message: string) => Promise<void> }) {
  const tracked = item.ingredient !== null && isCanonical(item.unit)
  const [quantity, setQuantity] = useState(item.quantity)
  const [unit, setUnit] = useState<InputUnit>(tracked ? baseUnit[item.unit as 'g'] : 'g')
  const [keepRemainder, setKeepRemainder] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const { data } = await api.post<{ alreadyReceived: boolean; pantryItem: { quantity: string; unit: 'g' } | null }>(path, { quantity, ...(tracked ? { unit } : {}), keepRemainder })
      await onDone(data.alreadyReceived ? `${item.name} was already received; nothing changed.` : data.pantryItem ? `${item.name} added to your pantry. You now have ${formatQuantity(data.pantryItem.quantity, data.pantryItem.unit)}.` : `${item.name} marked as received.`)
    } catch (err) { setError(errorMessage(err)); setBusy(false) }
  }
  return <Modal title={`Receive ${item.name}`} subtitle={`Ordered ${itemQty(item)}. Enter what actually arrived.`} onClose={onClose}
    footer={<><button className="ghost-button" onClick={onClose}>Cancel</button><button form="receive-form" className="primary-button" disabled={busy}>{busy ? 'Saving…' : tracked ? 'Add to pantry' : 'Mark received'}</button></>}>
    {error && <Notice>{error}</Notice>}
    <form id="receive-form" className="stack-form tight" onSubmit={submit}>
      <label>Quantity received
        <span className="quantity-input"><input value={quantity} onChange={e => setQuantity(e.target.value)} inputMode="decimal" pattern="\d+(\.\d+)?" required />
          {tracked ? <select value={unit} onChange={e => setUnit(e.target.value as InputUnit)} aria-label="Unit">{unitOptions[item.unit as 'g'].map(u => <option key={u} value={u}>{u === 'l' ? 'L' : u}</option>)}</select> : <span className="unit-label">{item.unit}</span>}</span>
      </label>
      <label className="checkbox-row"><input type="checkbox" checked={keepRemainder} onChange={e => setKeepRemainder(e.target.checked)} /> If less arrived, keep the rest on the list</label>
    </form>
    <p className="muted small">If the order was cancelled, close this and leave the item on the list (untick “purchased” if needed).</p>
  </Modal>
}

function AddItemDialog({ path, householdId, onClose, onAdded }: { path: string; householdId: string; onClose: () => void; onAdded: (name: string) => Promise<void> }) {
  const [catalog, setCatalog] = useState<Ingredient[] | null>(null)
  const [ingredientId, setIngredientId] = useState('')
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('g')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { api.get<Ingredient[]>(`/households/${householdId}/ingredients`).then(r => setCatalog(r.data)).catch(() => setCatalog([])) }, [householdId])
  const chosen = catalog?.find(i => i.id === ingredientId)
  useEffect(() => { setUnit(chosen ? baseUnit[chosen.canonicalUnit] : 'item') }, [chosen])
  const grouped = useMemo(() => {
    const map = new Map<string, Ingredient[]>()
    for (const i of catalog ?? []) map.set(i.category, [...(map.get(i.category) ?? []), i])
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [catalog])
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { await api.post(path, chosen ? { ingredientId, quantity, unit, note: note || undefined } : { name, quantity, unit, note: note || undefined }); await onAdded(chosen?.name ?? name) }
    catch (err) { setError(errorMessage(err)); setBusy(false) }
  }
  return <Modal title="Add to shopping list" onClose={onClose}
    footer={<><button className="ghost-button" onClick={onClose}>Cancel</button><button form="shop-add" className="primary-button" disabled={busy || (!ingredientId && !name.trim())}>{busy ? 'Adding…' : 'Add'}</button></>}>
    {error && <Notice>{error}</Notice>}
    <form id="shop-add" className="stack-form tight" onSubmit={submit}>
      <label>Ingredient
        <select value={ingredientId} onChange={e => setIngredientId(e.target.value)}>
          <option value="">Something else (type below)</option>
          {grouped.map(([group, items]) => <optgroup key={group} label={group}>{items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</optgroup>)}
        </select>
      </label>
      {!chosen && <label>Item name<input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="e.g. Dish soap" /></label>}
      <label>Quantity
        <span className="quantity-input"><input value={quantity} onChange={e => setQuantity(e.target.value)} inputMode="decimal" pattern="\d+(\.\d+)?" required placeholder="0" />
          {chosen ? <select value={unit} onChange={e => setUnit(e.target.value)} aria-label="Unit">{unitOptions[chosen.canonicalUnit].map(u => <option key={u} value={u}>{u === 'l' ? 'L' : u}</option>)}</select>
            : <input value={unit} onChange={e => setUnit(e.target.value)} maxLength={20} aria-label="Unit" placeholder="item" />}</span>
      </label>
      <label>Note<input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="Optional, e.g. brand" /></label>
    </form>
  </Modal>
}
