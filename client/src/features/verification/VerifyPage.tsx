import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Check, CircleOff, ClipboardCheck, PencilLine } from 'lucide-react'
import { api, errorMessage, type InputUnit, type Shortage, type VerificationEntry } from '../../lib/api'
import { useSession } from '../../lib/session'
import { baseUnit, formatQuantity, slotLabel, unitOptions } from '../../lib/format'
import { Badge, EmptyState, Notice, PageHeader, Spinner } from '../../components/ui'
import { StockBadges } from '../pantry/StockBadges'

type Outcome = { tone: 'success' | 'warning'; text: string; link?: string }

/** Flagship stock check: the few items worth a physical look, most consequential first. */
export function VerifyPage() {
  const { household } = useSession()
  const [queue, setQueue] = useState<VerificationEntry[] | null>(null)
  const [error, setError] = useState('')
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({})

  const load = useCallback(async () => {
    setError('')
    try { setQueue((await api.get<VerificationEntry[]>(`/households/${household.id}/verification`)).data) }
    catch (err) { setError(errorMessage(err, 'The stock check list could not be loaded.')) }
  }, [household.id])
  useEffect(() => { void load() }, [load])

  async function verify(entry: VerificationEntry, body: object) {
    const name = entry.item.ingredient.name
    try {
      const { data } = await api.post<{ changed: boolean; previousQuantity: string; item: VerificationEntry['item']; affected: Shortage | null }>(`/households/${household.id}/pantry/${entry.item.id}/verify`, body)
      const text = data.changed ? `${name} updated from ${formatQuantity(data.previousQuantity, data.item.unit)} to ${formatQuantity(data.item.quantity, data.item.unit)}.` : `${name} confirmed at ${formatQuantity(data.item.quantity, data.item.unit)}.`
      setOutcomes(prev => ({ ...prev, [entry.item.id]: data.affected
        ? { tone: 'warning', text: `${text} Planned meals are now short ${formatQuantity(data.affected.shortage, data.affected.unit)}, starting with ${data.affected.firstAffected.recipeName} (${slotLabel[data.affected.firstAffected.slot].toLowerCase()}, ${data.affected.firstAffected.date}).`, link: '/shopping' }
        : { tone: 'success', text: `${text} Plans and shortages are up to date.` } }))
    } catch (err) { setOutcomes(prev => ({ ...prev, [entry.item.id]: { tone: 'warning', text: errorMessage(err) } })) }
  }

  const pending = queue?.filter(e => !outcomes[e.item.id]) ?? []
  const done = queue?.filter(e => outcomes[e.item.id]) ?? []

  return <>
    <PageHeader eyebrow="STOCK CHECK" title="Quick stock check" description="A ten-second look at these items keeps your meal plan and shortages accurate. Items your upcoming meals depend on come first."
      actions={<Link className="ghost-button" to="/pantry">Open pantry</Link>} />
    {error && <Notice onRetry={load}>{error}</Notice>}
    {!queue && !error && <Spinner label="Finding items worth checking…" />}

    {queue && !pending.length && <section className="panel"><EmptyState icon={ClipboardCheck} title={done.length ? 'All checked. Thank you!' : 'Nothing needs checking right now'}
      action={done.length ? <button className="secondary-button" onClick={() => { setOutcomes({}); void load() }}>Check for more</button> : undefined}>
      {done.length ? 'Your plans and shortages now use the amounts you confirmed.' : 'Uncertain items your meals depend on will appear here.'}</EmptyState></section>}

    <section className="verify-list">
      {pending.map(entry => <VerifyCard key={entry.item.id} entry={entry} onVerify={body => verify(entry, body)} />)}
    </section>

    {done.length > 0 && <section className="pantry-group">
      <h2 className="group-title">Checked<span>{done.length}</span></h2>
      {done.map(entry => <Notice key={entry.item.id} tone={outcomes[entry.item.id]!.tone}>{outcomes[entry.item.id]!.text}{outcomes[entry.item.id]!.link && <> <Link to={outcomes[entry.item.id]!.link!}>Open shopping list</Link></>}</Notice>)}
    </section>}
  </>
}

function VerifyCard({ entry, onVerify }: { entry: VerificationEntry; onVerify: (body: object) => Promise<void> }) {
  const { item } = entry
  const [updating, setUpdating] = useState(false)
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<InputUnit>(baseUnit[item.unit])
  const [busy, setBusy] = useState(false)
  const go = async (body: object) => { setBusy(true); await onVerify(body); setBusy(false) }
  const submit = (event: FormEvent) => { event.preventDefault(); void go({ action: 'update', quantity, unit }) }
  return <article className="verify-card">
    <div className="verify-head">
      <div><h2>{item.ingredient.name}</h2><span className="verify-qty">Recorded: {formatQuantity(item.quantity, item.unit)}</span></div>
      <Badge tone={entry.priority === 'HIGH' ? 'red' : entry.priority === 'MEDIUM' ? 'amber' : 'grey'}>{entry.priority === 'HIGH' ? 'Check first' : entry.priority === 'MEDIUM' ? 'Worth a look' : 'When convenient'}</Badge>
    </div>
    <StockBadges item={item} />
    <ul className="reason-list">{entry.reasons.map(r => <li key={r}>{r}</li>)}</ul>
    <div className="action-row three">
      <button className="choice-button" disabled={busy} onClick={() => go({ action: 'confirm' })}><Check size={16} aria-hidden />Quantity is correct</button>
      <button className={`choice-button ${updating ? 'active' : ''}`} disabled={busy} onClick={() => setUpdating(!updating)}><PencilLine size={16} aria-hidden />Update quantity</button>
      <button className="choice-button" disabled={busy} onClick={() => go({ action: 'finished' })}><CircleOff size={16} aria-hidden />Mark as finished</button>
    </div>
    {updating && <form className="inline-form" onSubmit={submit}>
      <span className="quantity-input"><input value={quantity} onChange={e => setQuantity(e.target.value)} inputMode="decimal" pattern="\d+(\.\d+)?" required placeholder="Actual amount" aria-label="Actual amount" autoFocus />
        <select value={unit} onChange={e => setUnit(e.target.value as InputUnit)} aria-label="Unit">{unitOptions[item.unit].map(u => <option key={u} value={u}>{u === 'l' ? 'L' : u}</option>)}</select></span>
      <button className="primary-button" disabled={busy}>Save</button>
    </form>}
  </article>
}
