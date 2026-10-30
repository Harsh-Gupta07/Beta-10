import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarCheck, ChevronLeft, ChevronRight, Plus, TriangleAlert } from 'lucide-react'
import { api, errorMessage, type MealSlot, type PlannedMeal, type PlannerWeek, type RecipeSummary } from '../../lib/api'
import { useSession } from '../../lib/session'
import { addDays, formatDay, slotLabel, slots, statusLabel } from '../../lib/format'
import { Badge, Notice, PageHeader, Spinner } from '../../components/ui'
import { AddMealDialog } from './AddMealDialog'
import { MealSheet } from './MealSheet'
import { ShortageList } from './ShortageList'

export function PlannerPage() {
  const { household } = useSession()
  const [params, setParams] = useSearchParams()
  const week = params.get('week')
  const [data, setData] = useState<PlannerWeek | null>(null)
  const [recipes, setRecipes] = useState<RecipeSummary[]>([])
  const [error, setError] = useState('')
  const [adding, setAdding] = useState<{ date: string; slot: MealSlot } | null>(null)
  const [openMealId, setOpenMealId] = useState<string | null>(null)
  const [showAllShortages, setShowAllShortages] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try { setData((await api.get<PlannerWeek>(`/households/${household.id}/planner`, { params: week ? { week } : undefined })).data) }
    catch (err) { setError(errorMessage(err, 'The meal plan could not be loaded.')) }
  }, [household.id, week])
  useEffect(() => { void load() }, [load])

  // Recipe readiness only changes with pantry stock, so one fetch per visit is enough.
  useEffect(() => {
    api.get<{ recipes: RecipeSummary[] }>(`/households/${household.id}/recipes`).then(r => setRecipes(r.data.recipes)).catch(() => setRecipes([]))
  }, [household.id])

  const days = useMemo(() => data ? Array.from({ length: 7 }, (_, i) => addDays(data.weekStart, i)) : [], [data])
  const mealAt = useMemo(() => {
    const map = new Map<string, PlannedMeal>()
    for (const meal of data?.meals ?? []) map.set(`${meal.date}|${meal.slot}`, meal)
    return map
  }, [data])
  const goToWeek = (value: string | null) => setParams(value ? { week: value } : {}, { replace: true })

  // The open meal may be outside this week (e.g. picked from the shortage list), so fetch its week.
  const openMeal = data?.meals.find(m => m.id === openMealId) ?? null
  function selectMeal(mealId: string) {
    const target = data?.shortages.find(s => s.firstAffected.mealId === mealId)?.firstAffected
    if (target && data && (target.date < data.weekStart || target.date > data.weekEnd)) goToWeek(target.date)
    setOpenMealId(mealId)
  }

  const isCurrentWeek = data ? data.today >= data.weekStart && data.today <= data.weekEnd : true
  const planned = data?.meals.filter(m => m.status !== 'CANCELLED').length ?? 0

  return <>
    <PageHeader eyebrow="MEAL PLANNER" title="This week’s meals" description="Plan breakfast, lunch and dinner. Each plan reserves pantry stock in date order. Nothing is deducted until you cook."
      actions={data && <div className="week-nav">
        <button className="icon-button" onClick={() => goToWeek(addDays(data.weekStart, -7))} aria-label="Previous week"><ChevronLeft size={18} /></button>
        <span className="week-label">{formatDay(data.weekStart)} – {formatDay(data.weekEnd)}</span>
        <button className="icon-button" onClick={() => goToWeek(addDays(data.weekStart, 7))} aria-label="Next week"><ChevronRight size={18} /></button>
        {!isCurrentWeek && <button className="ghost-button" onClick={() => goToWeek(null)}>This week</button>}
      </div>} />

    {error && <Notice onRetry={load}>{error}</Notice>}
    {!data && !error && <Spinner label="Loading meal plan…" />}

    {data && <>
      {data.shortages.length > 0
        ? <section className="panel shortage-panel">
            <div className="panel-heading"><div><p className="eyebrow">UPCOMING SHORTAGES</p><h2><TriangleAlert size={17} aria-hidden className="inline-icon warn" />{data.shortages.length} ingredient{data.shortages.length === 1 ? '' : 's'} will run short</h2></div>
              {data.shortages.length > 4 && <button className="link-button" onClick={() => setShowAllShortages(!showAllShortages)}>{showAllShortages ? 'Show fewer' : `Show all ${data.shortages.length}`}</button>}</div>
            <ShortageList shortages={data.shortages} today={data.today} limit={showAllShortages ? undefined : 4} onSelectMeal={selectMeal} />
            <p className="muted small">Shopping-list hand-off arrives with the Shopping milestone. For now, add stock in the Pantry and shortages update instantly.</p>
          </section>
        : planned > 0 && <div className="callout success"><CalendarCheck size={18} aria-hidden /><span>Your pantry covers every upcoming planned meal.</span></div>}

      <section className="planner-grid" aria-label="Week plan">
        {days.map(day => {
          const past = day < data.today
          return <div key={day} className={`planner-day ${day === data.today ? 'today' : ''} ${past ? 'past' : ''}`}>
            <h2 className="day-head"><span>{formatDay(day).split(' ')[0]}</span><strong>{formatDay(day).split(' ').slice(1).join(' ')}</strong>{day === data.today && <Badge tone="green">Today</Badge>}</h2>
            {slots.map(slot => {
              const meal = mealAt.get(`${day}|${slot}`)
              const canAdd = !past && (!meal || meal.status === 'CANCELLED')
              return <div key={slot} className="slot">
                <span className="slot-label">{slotLabel[slot]}</span>
                {meal && <button className={`meal-chip status-${meal.status.toLowerCase()} ${meal.shortCount ? 'has-short' : ''}`} onClick={() => setOpenMealId(meal.id)}>
                  <strong>{meal.recipe.name}</strong>
                  <span className="chip-meta">{meal.servings} servings
                    {meal.status !== 'PLANNED' && <> · {statusLabel[meal.status]}</>}
                    {meal.reservesStock && meal.shortCount > 0 && <span className="chip-short">· {meal.shortCount} short</span>}
                  </span>
                </button>}
                {canAdd && <button className="add-slot" onClick={() => setAdding({ date: day, slot })} aria-label={`Plan ${slotLabel[slot]} on ${formatDay(day)}`}><Plus size={14} aria-hidden />{meal ? 'Plan another' : 'Add'}</button>}
                {!meal && past && <span className="slot-empty">—</span>}
              </div>
            })}
          </div>
        })}
      </section>
    </>}

    {adding && data && <AddMealDialog date={adding.date} slot={adding.slot} recipes={recipes} defaultServings={data.defaultServings} onClose={() => setAdding(null)} onAdded={() => { setAdding(null); void load() }} />}
    {openMeal && data && <MealSheet key={openMeal.id + openMeal.status + openMeal.servings + openMeal.recipe.id + openMeal.date + openMeal.slot} meal={openMeal} today={data.today} recipes={recipes} onClose={() => setOpenMealId(null)} onChanged={load} />}
  </>
}
