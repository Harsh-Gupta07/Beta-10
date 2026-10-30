import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, BookOpen, CalendarDays, ClipboardCheck, PackageCheck, Plus, TriangleAlert } from 'lucide-react'
import { api, errorMessage, type Dashboard } from '../../lib/api'
import { useSession } from '../../lib/session'
import { formatDelta, formatQuantity, relativeTime, transactionLabel } from '../../lib/format'
import { Badge, EmptyState, Notice, PageHeader, Spinner } from '../../components/ui'

export function DashboardPage() {
  const { household } = useSession()
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try { setData((await api.get<Dashboard>(`/households/${household.id}/dashboard`)).data) }
    catch (err) { setError(errorMessage(err, 'The dashboard could not be loaded.')) }
  }, [household.id])
  useEffect(() => { void load() }, [load])

  const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()

  return <>
    <PageHeader eyebrow={today} title="Your kitchen, in sync." description={`${household.name} · usually cooking for ${household.defaultServings}`}
      actions={<Link className="primary-button" to="/pantry?add=1"><Plus size={16} aria-hidden />Add ingredient</Link>} />
    {error && <Notice onRetry={load}>{error}</Notice>}
    {!data && !error && <Spinner label="Loading dashboard…" />}
    {data && <>
      <section className="stat-grid">
        <Stat label="Pantry items" value={data.pantryCount} note="Tracked in your kitchen" to="/pantry" />
        <Stat label="Low or out of stock" value={data.lowStockCount} note="Below your alert level" to="/pantry?view=low" tone={data.lowStockCount ? 'amber' : undefined} />
        <Stat label="Needs a check" value={data.needsCheck} note="Uncertain or expired stock" to="/pantry?view=check" tone={data.needsCheck ? 'amber' : undefined} />
        <Stat label="Recipes" value={data.recipeCount} note="Built-in and your own" to="/recipes" />
      </section>

      <section className="quick-actions" aria-label="Quick actions">
        <Link to="/pantry?add=1"><Plus size={16} aria-hidden />Add ingredient</Link>
        <Link to="/pantry?view=check"><ClipboardCheck size={16} aria-hidden />Verify stock</Link>
        <Link to="/recipes?new=1"><BookOpen size={16} aria-hidden />Add recipe</Link>
        <span className="disabled" title="Arrives with the Meal Planner milestone"><CalendarDays size={16} aria-hidden />Plan a meal<small>Soon</small></span>
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">UP NEXT</p><h2>Today’s meals</h2></div></div>
          {data.meals.length
            ? <div className="meal-list">{data.meals.map(meal => <div className="meal-row" key={meal.id}><span className="meal-time">{meal.slot.toLowerCase()}</span><strong>{meal.recipe.name}</strong><span>{meal.servings} servings</span></div>)}</div>
            : <EmptyState icon={CalendarDays} title="No meals planned for today">The weekly planner arrives in the next milestones. Until then, keep your pantry accurate so planning starts from real stock.</EmptyState>}
        </article>

        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">ATTENTION</p><h2>Running low</h2></div><Link to="/pantry?view=low">View all</Link></div>
          {data.lowStock.length
            ? <ul className="compact-list">{data.lowStock.map(item => <li key={item.id}><span>{item.ingredient.name}</span><span className="compact-meta">{formatQuantity(item.quantity, item.unit)}</span><Badge tone={item.status === 'OUT' ? 'red' : 'amber'}>{item.status === 'OUT' ? 'Out' : 'Low'}</Badge></li>)}</ul>
            : <EmptyState icon={PackageCheck} title={data.pantryCount ? 'Nothing is running low' : 'Your pantry is empty'}>{data.pantryCount ? 'Set a low-stock alert on staples to be warned early.' : 'Add the staples you already have to get started.'}</EmptyState>}
        </article>
      </section>

      <article className="panel activity-panel">
        <div className="panel-heading"><div><p className="eyebrow">STOCK HISTORY</p><h2>Recent activity</h2></div></div>
        {data.activity.length
          ? <ul className="activity-list">{data.activity.map(t => <li key={t.id}>
              <span className={`activity-dot ${Number(t.delta) < 0 ? 'down' : 'up'}`} aria-hidden />
              <span><strong>{transactionLabel[t.type]}</strong> {t.ingredient.name} <span className="muted-inline">{formatDelta(t.delta, t.unit)}</span></span>
              <small>{t.actor.name} · {relativeTime(t.createdAt)}</small>
            </li>)}</ul>
          : <EmptyState icon={Activity} title="No stock changes yet">Every addition, use and correction will be recorded here.</EmptyState>}
      </article>

      {data.needsCheck > 0 && <Link to="/pantry?view=check" className="callout warning"><TriangleAlert size={18} aria-hidden /><span><strong>{data.needsCheck} item{data.needsCheck === 1 ? '' : 's'} need a quick check.</strong> A 10-second look keeps your plans accurate.</span></Link>}
    </>}
  </>
}

function Stat({ label, value, note, to, tone }: { label: string; value: number; note: string; to?: string; tone?: 'amber' }) {
  const body = <><span>{label}</span><strong className={tone}>{value}</strong><small>{note}</small></>
  return to ? <Link className="stat-card link" to={to}>{body}</Link> : <article className="stat-card">{body}</article>
}
