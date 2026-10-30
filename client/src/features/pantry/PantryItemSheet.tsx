import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, CircleOff, Minus, PencilLine, Trash2 } from 'lucide-react'
import { api, errorMessage, type InputUnit, type PantryItem, type StockTransaction } from '../../lib/api'
import { useSession } from '../../lib/session'
import { baseUnit, formatDate, formatDelta, formatQuantity, relativeTime, transactionLabel, unitOptions } from '../../lib/format'
import { Modal, Notice, Spinner } from '../../components/ui'
import { StockBadges } from './StockBadges'

type Props = { item: PantryItem; onClose: () => void; onChanged: (item: PantryItem) => void; onDeleted: (id: string) => void; onEdit: () => void }

function QuantityFields({ item, quantity, unit, setQuantity, setUnit, label }: { item: PantryItem; quantity: string; unit: InputUnit; setQuantity: (v: string) => void; setUnit: (u: InputUnit) => void; label: string }) {
  return <div className="quantity-input"><input value={quantity} onChange={e => setQuantity(e.target.value)} inputMode="decimal" required pattern="\d+(\.\d+)?" aria-label={label} placeholder="0" />
    <select value={unit} onChange={e => setUnit(e.target.value as InputUnit)} aria-label="Unit">{unitOptions[item.unit].map(u => <option key={u} value={u}>{u === 'l' ? 'L' : u}</option>)}</select></div>
}

export function PantryItemSheet({ item, onClose, onChanged, onDeleted, onEdit }: Props) {
  const { household } = useSession()
  const path = `/households/${household.id}/pantry/${item.id}`
  const [history, setHistory] = useState<StockTransaction[] | null>(null)
  const [mode, setMode] = useState<'idle' | 'update' | 'use' | 'delete'>('idle')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<InputUnit>(baseUnit[item.unit])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadHistory = useCallback(() => {
    api.get<StockTransaction[]>(`${path}/transactions`).then(r => setHistory(r.data)).catch(err => { setHistory([]); setError(errorMessage(err, 'Could not load stock history.')) })
  }, [path])
  useEffect(loadHistory, [loadHistory])

  function openMode(next: typeof mode) { setMode(next); setQuantity(''); setNote(''); setUnit(baseUnit[item.unit]); setError(''); setSuccess('') }

  async function run(action: () => Promise<string>) {
    setBusy(true); setError(''); setSuccess('')
    try { setSuccess(await action()); setMode('idle'); loadHistory() }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }

  const verify = (body: object) => run(async () => {
    const { data } = await api.post<{ item: PantryItem; changed: boolean; previousQuantity: string }>(`${path}/verify`, body)
    onChanged(data.item)
    return data.changed ? `Corrected from ${formatQuantity(data.previousQuantity, item.unit)} to ${formatQuantity(data.item.quantity, item.unit)}.` : 'Marked as confirmed.'
  })

  function submitUpdate(event: FormEvent) { event.preventDefault(); void verify({ action: 'update', quantity, unit, note: note || undefined }) }
  function submitUse(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      const { data } = await api.post<PantryItem>(`${path}/use`, { quantity, unit, note: note || undefined })
      onChanged(data)
      return `Recorded. ${formatQuantity(data.quantity, data.unit)} left.`
    })
  }
  async function remove() {
    setBusy(true); setError('')
    try { await api.delete(path); onDeleted(item.id) }
    catch (err) { setError(errorMessage(err)); setBusy(false) }
  }

  return <Modal wide title={item.ingredient.name} subtitle={<>{item.ingredient.category}{item.ingredient.custom && ' · custom'}</>} onClose={onClose}
    footer={mode === 'delete'
      ? <><span className="confirm-text">Remove {item.ingredient.name} from the pantry? Its history is kept.</span><button className="ghost-button" onClick={() => setMode('idle')}>Keep it</button><button className="danger-button" onClick={remove} disabled={busy}>{busy ? 'Removing…' : 'Remove'}</button></>
      : <><button className="ghost-button danger-text" onClick={() => openMode('delete')}><Trash2 size={15} aria-hidden />Remove</button><button className="secondary-button" onClick={onEdit}><PencilLine size={15} aria-hidden />Edit details</button></>}>

    <div className="sheet-summary">
      <div><span className="sheet-qty">{formatQuantity(item.quantity, item.unit)}</span><StockBadges item={item} /></div>
      <dl className="facts">
        <div><dt>Last verified</dt><dd>{relativeTime(item.lastVerifiedAt)}</dd></div>
        <div><dt>Low-stock alert</dt><dd>{item.lowStockThreshold ? formatQuantity(item.lowStockThreshold, item.unit) : 'Off'}</dd></div>
        <div><dt>Purchased</dt><dd>{formatDate(item.purchasedAt)}</dd></div>
        <div><dt>Expires</dt><dd>{formatDate(item.expiresAt)}</dd></div>
      </dl>
    </div>

    {error && <Notice>{error}</Notice>}
    {success && <Notice tone="success">{success}</Notice>}

    <section className="sheet-section">
      <h3>Is {formatQuantity(item.quantity, item.unit)} still right?</h3>
      <p className="muted small">A quick physical check keeps upcoming meal plans and shortages accurate.</p>
      <div className="action-row">
        <button className="choice-button" disabled={busy} onClick={() => void verify({ action: 'confirm' })}><Check size={16} aria-hidden />Quantity is correct</button>
        <button className={`choice-button ${mode === 'update' ? 'active' : ''}`} disabled={busy} onClick={() => openMode(mode === 'update' ? 'idle' : 'update')}><PencilLine size={16} aria-hidden />Update quantity</button>
        <button className="choice-button" disabled={busy || item.status === 'OUT'} onClick={() => void verify({ action: 'finished' })}><CircleOff size={16} aria-hidden />Mark as finished</button>
        <button className={`choice-button ${mode === 'use' ? 'active' : ''}`} disabled={busy || item.status === 'OUT'} onClick={() => openMode(mode === 'use' ? 'idle' : 'use')}><Minus size={16} aria-hidden />Record use</button>
      </div>
      {mode === 'update' && <form className="inline-form" onSubmit={submitUpdate}>
        <QuantityFields item={item} quantity={quantity} unit={unit} setQuantity={setQuantity} setUnit={setUnit} label="Actual quantity" />
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="Note (optional)" aria-label="Note" />
        <button className="primary-button" disabled={busy}>Save actual amount</button>
      </form>}
      {mode === 'use' && <form className="inline-form" onSubmit={submitUse}>
        <QuantityFields item={item} quantity={quantity} unit={unit} setQuantity={setQuantity} setUnit={setUnit} label="Quantity used" />
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="What was it for? (optional)" aria-label="Note" />
        <button className="primary-button" disabled={busy}>Record use</button>
      </form>}
    </section>

    <section className="sheet-section">
      <h3>Stock history</h3>
      {history === null ? <Spinner label="Loading history…" /> : history.length === 0 ? <p className="muted small">No history yet.</p>
        : <ul className="history-list">{history.map(t => <li key={t.id}>
            <span className={`history-delta ${Number(t.delta) < 0 ? 'down' : 'up'}`}>{formatDelta(t.delta, t.unit)}</span>
            <span><strong>{transactionLabel[t.type]}</strong>{t.note && <> · {t.note}</>}<small>{t.actor.name} · {new Date(t.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small></span>
            <span className="history-balance">{formatQuantity(t.balanceAfter, t.unit)}</span>
          </li>)}</ul>}
    </section>
  </Modal>
}
