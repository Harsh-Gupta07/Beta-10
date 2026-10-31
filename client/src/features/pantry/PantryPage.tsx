import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, ClipboardCheck, Plus, Refrigerator, Search, SearchX } from 'lucide-react'
import { api, errorMessage, type PantryItem } from '../../lib/api'
import { useSession } from '../../lib/session'
import { formatQuantity, relativeTime } from '../../lib/format'
import { EmptyState, Notice, PageHeader, Segmented, Spinner } from '../../components/ui'
import { categoriesOf, countByView, groupPantry, isPantryView, pantryViews, type PantryView } from './pantryFilters'
import { PantryItemForm } from './PantryItemForm'
import { PantryItemSheet } from './PantryItemSheet'
import { StockBadges } from './StockBadges'

export function PantryPage() {
  const { household } = useSession()
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState<PantryItem[] | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const view: PantryView = isPantryView(params.get('view')) ? params.get('view') as PantryView : 'all'
  const adding = params.get('add') === '1'
  const setParam = (key: string, value: string | null) => setParams(prev => { const next = new URLSearchParams(prev); if (value) next.set(key, value); else next.delete(key); return next }, { replace: true })

  const load = useCallback(async () => {
    setError('')
    try { setItems((await api.get<PantryItem[]>(`/households/${household.id}/pantry`)).data) }
    catch (err) { setError(errorMessage(err, 'Your pantry could not be loaded.')) }
  }, [household.id])
  useEffect(() => { void load() }, [load])

  const all = useMemo(() => items ?? [], [items])
  const counts = useMemo(() => countByView(all), [all])
  const categories = useMemo(() => categoriesOf(all), [all])
  const groups = useMemo(() => groupPantry(all, { view, category, search }), [all, view, category, search])
  const existingIngredientIds = useMemo(() => new Set(all.map(i => i.ingredient.id)), [all])
  const selected = all.find(i => i.id === selectedId) ?? null
  const editing = all.find(i => i.id === editingId) ?? undefined

  const upsert = (item: PantryItem) => setItems(prev => prev && prev.some(i => i.id === item.id) ? prev.map(i => i.id === item.id ? item : i) : [...(prev ?? []), item])
  const filtered = view !== 'all' || category !== 'all' || search.trim() !== ''

  return <>
    <PageHeader eyebrow="PANTRY" title="Kitchen inventory" description="What’s physically in your kitchen. Planned meals never reduce these amounts; only cooking and recorded use do."
      actions={<><Link className="ghost-button" to="/verify"><ClipboardCheck size={15} aria-hidden />Quick stock check</Link><button className="primary-button" onClick={() => setParam('add', '1')}><Plus size={16} aria-hidden />Add item</button></>} />

    {error && <Notice onRetry={load}>{error}</Notice>}
    {items === null && !error && <Spinner label="Loading pantry…" />}

    {items && items.length === 0 && <section className="panel"><EmptyState icon={Refrigerator} title="Your pantry is empty"
      action={<button className="primary-button" onClick={() => setParam('add', '1')}><Plus size={16} aria-hidden />Add your first item</button>}>
      Start with staples like rice, atta, dal, oil and milk. You can mark each amount as confirmed or estimated.</EmptyState></section>}

    {items && items.length > 0 && <>
      <section className="summary-strip" aria-label="Pantry summary">
        {pantryViews.map(v => <button key={v.value} className={`summary-chip ${view === v.value ? 'active' : ''} ${v.value !== 'all' && counts[v.value] ? 'attention' : ''}`} onClick={() => setParam('view', v.value === 'all' ? null : v.value)} aria-pressed={view === v.value}>
          <strong>{counts[v.value]}</strong><span>{v.value === 'all' ? 'Items' : v.label}</span>
        </button>)}
      </section>

      <section className="toolbar">
        <label className="search-box"><Search size={16} aria-hidden /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ingredients" aria-label="Search ingredients" /></label>
        <div className="category-scroll"><Segmented label="Category" value={category} onChange={setCategory} options={[{ value: 'all', label: 'All categories' }, ...categories.map(c => ({ value: c, label: c }))]} /></div>
      </section>

      {groups.length === 0
        ? <section className="panel"><EmptyState icon={SearchX} title="No items match" action={filtered ? <button className="secondary-button" onClick={() => { setSearch(''); setCategory('all'); setParam('view', null) }}>Clear filters</button> : undefined}>Try a different search, category or view.</EmptyState></section>
        : groups.map(group => <section key={group.name} className="pantry-group">
            <h2 className="group-title">{group.name}<span>{group.items.length}</span></h2>
            <ul className="pantry-list">{group.items.map(item => <li key={item.id}>
              <button className="pantry-row" onClick={() => setSelectedId(item.id)}>
                <span className="pantry-name"><strong>{item.ingredient.name}</strong><small>Verified {relativeTime(item.lastVerifiedAt).toLowerCase()}</small></span>
                <StockBadges item={item} />
                <span className={`pantry-qty ${item.status === 'OUT' ? 'out' : item.status === 'LOW' ? 'low' : ''}`}>{formatQuantity(item.quantity, item.unit)}</span>
                <ChevronRight size={16} className="row-chevron" aria-hidden />
              </button>
            </li>)}</ul>
          </section>)}
    </>}

    {adding && <PantryItemForm existingIngredientIds={existingIngredientIds} onClose={() => setParam('add', null)} onSaved={item => { upsert(item); setParam('add', null); setSelectedId(item.id) }} />}
    {editing && <PantryItemForm item={editing} existingIngredientIds={existingIngredientIds} onClose={() => setEditingId(null)} onSaved={item => { upsert(item); setEditingId(null) }} />}
    {selected && !editing && <PantryItemSheet key={selected.id} item={selected} onClose={() => setSelectedId(null)} onChanged={upsert}
      onDeleted={id => { setItems(prev => prev?.filter(i => i.id !== id) ?? null); setSelectedId(null) }} onEdit={() => setEditingId(selected.id)} />}
  </>
}
