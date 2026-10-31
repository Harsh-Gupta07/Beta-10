import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightLeft, CalendarPlus, ChefHat, Check, Clock, EyeOff, Heart, RefreshCw, ShoppingCart, Sparkles, ThumbsDown, TriangleAlert, Users, UtensilsCrossed } from 'lucide-react'
import { api, errorMessage, type MealIdea, type MealOption, type MealOptionsData, type MealSlot, type OptionStatus, type RecipeDraft } from '../../lib/api'
import { useSession } from '../../lib/session'
import { baseUnit, formatQuantity, slotLabel, slots } from '../../lib/format'
import { Badge, EmptyState, Field, Modal, Notice, Segmented, Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { DietBadge, SafetyBadge } from '../recipes/RecipeSafety'
import { RecipeForm } from '../recipes/RecipeForm'
import { ServingsStepper } from '../planner/AddMealDialog'
import { CookingDialog } from '../cooking/CookingDialog'
import { PlanDialog } from './SuggestionCard'

// Meal options from the household's own recipes, sorted by what the pantry can cover right now.
// Every number comes from the server's stock calculation; every change (plan, cook, save, shop) is confirmed first.

export const STATUS_LABEL: Record<OptionStatus, string> = { FULLY_AVAILABLE: 'Fully available', NEEDS_SUBSTITUTION: 'Needs substitution', NEEDS_PURCHASE: 'Needs purchase' }
const STATUS_TONE: Record<OptionStatus, 'green' | 'teal' | 'amber'> = { FULLY_AVAILABLE: 'green', NEEDS_SUBSTITUTION: 'teal', NEEDS_PURCHASE: 'amber' }
const STATUS_HINT: Record<OptionStatus, string> = {
  FULLY_AVAILABLE: 'Everything is in your pantry and not reserved for another meal.',
  NEEDS_SUBSTITUTION: 'Short of something, but a swap you have covers it.',
  NEEDS_PURCHASE: 'Something has to be bought first.',
}
const PAGE = 6
type Filter = OptionStatus | 'ALL'

/** `version` changes when the page changed something that affects options; `onChanged` tells the page after a change here. */
export function MealOptions({ scope, slot, version = 0, onChanged }: { scope: 'household' | 'me'; slot: MealSlot | null; version?: number; onChanged?: () => void }) {
  const { household } = useSession()
  const toast = useToast()
  const [servings, setServings] = useState(household.defaultServings)
  const [filter, setFilter] = useState<Filter>('ALL')
  const [data, setData] = useState<MealOptionsData | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ideas, setIdeas] = useState<MealIdea[] | null>(null)
  const [ideasBusy, setIdeasBusy] = useState(false)
  const [draft, setDraft] = useState<RecipeDraft | null>(null)
  const [cooking, setCooking] = useState<string | null>(null)

  const load = useCallback(async (exclude: string[] = []) => {
    setBusy(true); setError('')
    try {
      const { data } = await api.get<MealOptionsData>(`/households/${household.id}/meal-options`, { params: {
        scope, servings, limit: PAGE, ...(slot ? { slot } : {}), ...(filter === 'ALL' ? {} : { status: filter }), ...(exclude.length ? { exclude: exclude.join(',') } : {}),
      } })
      setData(data)
      if (data.wrapped) toast.info('You’ve seen every option, so here are the first ones again.')
    } catch (err) { setError(errorMessage(err, 'Meal options could not be loaded.')) }
    finally { setBusy(false) }
  }, [household.id, scope, servings, slot, filter, toast])
  useEffect(() => { void load() }, [load, version])
  // Ideas were for the old settings; ask again after a change.
  useEffect(() => { setIdeas(null) }, [scope, servings, slot])

  async function aiIdeas() {
    setIdeasBusy(true)
    try { setIdeas((await api.post<{ ideas: MealIdea[] }>(`/households/${household.id}/meal-options/ai`, { scope, servings, ...(slot ? { slot } : {}) })).data.ideas) }
    catch (err) { toast.error(errorMessage(err, 'AI ideas aren’t available right now. Your recipe options still work.')) }
    finally { setIdeasBusy(false) }
  }

  const reload = () => { onChanged?.(); return load() }
  const counts = data?.counts
  const filters: Array<{ value: Filter; label: string }> = [
    { value: 'ALL', label: counts ? `All (${counts.FULLY_AVAILABLE + counts.NEEDS_SUBSTITUTION + counts.NEEDS_PURCHASE})` : 'All' },
    ...(['FULLY_AVAILABLE', 'NEEDS_SUBSTITUTION', 'NEEDS_PURCHASE'] as const).map(value => ({ value, label: counts ? `${STATUS_LABEL[value]} (${counts[value]})` : STATUS_LABEL[value] })),
  ]

  return <section className="stack meal-options">
    <div className="options-toolbar">
      <Segmented label="Show" value={filter} onChange={setFilter} options={filters} />
      <span className="toolbar-spacer" />
      <span className="options-servings"><Users size={15} aria-hidden /> For <ServingsStepper value={servings} onChange={setServings} /></span>
      <button className="ghost-button" disabled={busy || !data?.options.length} onClick={() => void load(data!.options.map(o => o.recipe.id))}><RefreshCw size={15} aria-hidden className={busy ? 'spin' : ''} />Regenerate options</button>
    </div>
    {error && <Notice onRetry={reload}>{error}</Notice>}
    {!data && !error && <Spinner label="Checking your pantry…" />}
    {data && (data.options.length === 0
      ? <section className="panel"><EmptyState icon={UtensilsCrossed} title={filter === 'ALL' ? 'No meal options right now' : `Nothing ${STATUS_LABEL[filter as OptionStatus].toLowerCase()} at the moment`}>
          {filter === 'ALL' ? 'Add recipes, or check Food Preferences if every dish clashes with someone’s needs.' : 'Try another group, or change the number of servings.'}
        </EmptyState></section>
      : <div className="option-list">{data.options.map(option => <OptionCard key={option.recipe.id} option={option} data={data} onChanged={reload} onDraft={setDraft} onCook={setCooking} />)}</div>)}
    {data && <p className="muted small">
      Shown {data.options.length} of {data.total}. {filter !== 'ALL' && STATUS_HINT[filter]} Stock already reserved for planned meals isn’t counted, so options never take food another meal needs.
      {data.excludedForSafety > 0 && ` ${data.excludedForSafety} dish${data.excludedForSafety === 1 ? ' is' : 'es are'} never shown because ${data.excludedForSafety === 1 ? 'it clashes' : 'they clash'} with someone’s allergies or diet.`}
    </p>}

    {data?.aiAvailable && <section className="panel ai-ideas">
      <div className="panel-heading"><div><p className="eyebrow">OPTIONAL</p><h2><Sparkles size={16} aria-hidden className="inline-icon" />New dishes from AI</h2></div>
        <button className="secondary-button" disabled={ideasBusy} onClick={() => void aiIdeas()}>{ideasBusy ? 'Thinking…' : ideas ? 'Ask again' : 'Get AI ideas'}</button></div>
      <p className="muted small">Gemini suggests new dishes from your free stock. They are drafts: KitchenSync checks the stock and safety itself, and nothing is saved until you review it.</p>
      {ideas?.length === 0 && <p className="muted small">No safe ideas came back this time. Try again, or use the options above.</p>}
      {ideas && ideas.length > 0 && <div className="option-list">{ideas.map(idea => <IdeaCard key={idea.draft.name} idea={idea} onReview={() => setDraft(idea.draft)} />)}</div>}
    </section>}

    {draft && <RecipeForm draft={draft} categories={[]} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); void reload() }} />}
    {cooking && <CookingDialog mealId={cooking} onClose={() => { setCooking(null); void reload() }} onChanged={() => undefined} />}
  </section>
}

function OptionCard({ option, data, onChanged, onDraft, onCook }: { option: MealOption; data: MealOptionsData; onChanged: () => void; onDraft: (draft: RecipeDraft) => void; onCook: (mealId: string) => void }) {
  const { household } = useSession()
  const toast = useToast()
  const { recipe, status } = option
  const [dialog, setDialog] = useState<'plan' | 'cook' | 'shop' | null>(null)
  const [busy, setBusy] = useState(false)
  const base = `/households/${household.id}`

  async function act(request: () => Promise<unknown>, message: string) {
    setBusy(true)
    try { await request(); toast.success(message); onChanged() }
    catch (err) { toast.error(errorMessage(err)) }
    finally { setBusy(false) }
  }
  async function reviewSwaps() {
    setBusy(true)
    try { onDraft((await api.post<RecipeDraft>(`${base}/meal-options/swap`, { recipeId: recipe.id, servings: option.servings, swaps: option.substitutions.map(s => ({ originalId: s.original.id, substituteId: s.substitute.id })) })).data) }
    catch (err) { toast.error(errorMessage(err)) }
    finally { setBusy(false) }
  }

  return <article className={`suggestion-card option-card ${status.toLowerCase()}`}>
    <div className="suggestion-head">
      <div>
        <Link to={`/recipes/${recipe.id}`} className="suggestion-name">{recipe.name}</Link>
        <p className="recipe-meta"><span><Clock size={13} aria-hidden />{recipe.prepMinutes} min prep · {recipe.cookMinutes} min cook</span><span><Users size={13} aria-hidden />{option.servings} servings</span>{recipe.cuisine && <span>{recipe.cuisine}</span>}</p>
      </div>
      <div className="badge-row">
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
        <DietBadge recipe={option.safety} />
        <SafetyBadge recipe={option} />
      </div>
    </div>

    <Coverage coverage={option.coverage} />
    {option.expiring.length > 0 && <p className="chip-line">{option.expiring.map(e => <span key={e.ingredient.id} className={`expiry-chip ${e.expired ? 'expired' : ''}`}>
      {e.expired ? <TriangleAlert size={12} aria-hidden /> : <Clock size={12} aria-hidden />}{e.ingredient.name}: {e.expired ? 'past expiry' : e.daysLeft === 0 ? 'expires today' : `${e.daysLeft} day${e.daysLeft === 1 ? '' : 's'} left`}
    </span>)}</p>}
    <StockLines option={option} />
    <ul className="reason-list">{option.reasons.map(reason => <li key={reason.text} className={reason.tone}>
      {reason.tone === 'good' ? <Check size={13} aria-hidden /> : <TriangleAlert size={13} aria-hidden />}{reason.text}
    </li>)}</ul>

    <div className="suggestion-actions">
      <button className="primary-button" disabled={busy} onClick={() => setDialog('plan')}><CalendarPlus size={15} aria-hidden />Plan this meal</button>
      {status === 'FULLY_AVAILABLE' && <button className="secondary-button" disabled={busy} onClick={() => setDialog('cook')}><ChefHat size={15} aria-hidden />Cook now</button>}
      {status === 'NEEDS_SUBSTITUTION' && <button className="secondary-button" disabled={busy} onClick={() => void reviewSwaps()}><ArrowRightLeft size={15} aria-hidden />Review recipe with swaps</button>}
      {status === 'NEEDS_PURCHASE' && <button className="secondary-button" disabled={busy} onClick={() => setDialog('shop')}><ShoppingCart size={15} aria-hidden />Add missing to shopping list</button>}
    </div>
    <div className="feedback-row" role="group" aria-label={`Feedback on ${recipe.name}`}>
      <span className="muted small">Your feedback:</span>
      <button className="link-button" disabled={busy} onClick={() => void act(() => api.put(`/me/recipe-prefs/${recipe.id}`, { kind: 'FAVOURITE' }), `${recipe.name} added to your favourites. It will rank higher.`)}><Heart size={13} aria-hidden /> Like</button>
      <button className="link-button" disabled={busy} onClick={() => void act(() => api.put(`/me/recipe-prefs/${recipe.id}`, { kind: 'DISLIKE' }), `We won’t suggest ${recipe.name} for you. Change this in Food Preferences.`)}><ThumbsDown size={13} aria-hidden /> Dislike</button>
      <button className="link-button" disabled={busy} onClick={() => void act(() => api.post(`/households/${household.id}/suggestions/${recipe.id}/snooze`), `${recipe.name} is hidden for 3 days for everyone. Bring it back from “Hidden for now”.`)}><EyeOff size={13} aria-hidden /> Not suitable</button>
    </div>

    {dialog === 'plan' && <PlanDialog recipe={recipe} today={data.today} defaultSlot={data.slot ?? data.cookNow.slot} defaultServings={option.servings} onClose={() => setDialog(null)}
      onPlanned={(date, slot) => { setDialog(null); toast.success(`${recipe.name} planned for ${slotLabel[slot].toLowerCase()} on ${date}. Its ingredients are now reserved.`); onChanged() }} />}
    {dialog === 'cook' && <CookNowDialog option={option} data={data} onClose={() => setDialog(null)} onReady={mealId => { setDialog(null); onCook(mealId) }} />}
    {dialog === 'shop' && <ShopDialog option={option} onClose={() => setDialog(null)} onAdded={() => { setDialog(null); onChanged() }} />}
  </article>
}

function Coverage({ coverage }: { coverage: MealOption['coverage'] }) {
  return <div className="coverage" aria-label={`In your pantry: ${coverage.inPantry} of ${coverage.total} ingredients`}>
    <span className="coverage-bar" aria-hidden><span style={{ width: `${coverage.percent}%` }} /></span>
    <small>In your pantry: {coverage.inPantry} of {coverage.total} ingredients ({coverage.percent}%)</small>
  </div>
}

function StockLines({ option }: { option: Pick<MealOption, 'substitutions' | 'toBuy'> }) {
  if (!option.substitutions.length && !option.toBuy.length) return null
  return <ul className="stock-lines">
    {option.substitutions.map(s => <li key={s.original.id}><ArrowRightLeft size={13} aria-hidden />
      <span>Swap <strong>{formatQuantity(s.original.quantity, s.original.unit)} {s.original.name}</strong> for <strong>{formatQuantity(s.substitute.quantity, s.substitute.unit)} {s.substitute.name}</strong><small>{s.note}</small></span></li>)}
    {option.toBuy.map(t => <li key={t.ingredient.id}><ShoppingCart size={13} aria-hidden />
      <span>Buy <strong>{formatQuantity(t.quantity, t.unit)} {t.ingredient.name}</strong>{t.swapAvailable && <small>or swap in {t.swapAvailable} once you have enough</small>}</span></li>)}
  </ul>
}

/** Plans the dish for the current meal today and opens cooking mode. Stock is used only when it is marked as cooked. */
function CookNowDialog({ option, data, onClose, onReady }: { option: MealOption; data: MealOptionsData; onClose: () => void; onReady: (mealId: string) => void }) {
  const { household } = useSession()
  const toast = useToast()
  const [slot, setSlot] = useState<MealSlot>(data.cookNow.slot)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const taken = data.cookNow.planned.find(m => m.slot === slot)
  const same = taken?.recipe.id === option.recipe.id && (taken.status === 'PLANNED' || taken.status === 'COOKING')

  async function start() {
    if (same) return onReady(taken!.mealId)
    setBusy(true); setError('')
    try {
      const { data: meal } = await api.post<{ id: string }>(`/households/${household.id}/meals`, { date: data.cookNow.date, slot, recipeId: option.recipe.id, servings: option.servings })
      toast.success(`${option.recipe.name} planned for ${slotLabel[slot].toLowerCase()} today. Mark it as cooked when it’s done.`)
      onReady(meal.id)
    } catch (err) { setError(errorMessage(err, 'Could not start this meal.')); setBusy(false) }
  }

  return <Modal title={`Cook ${option.recipe.name} now?`} subtitle="This plans it for today and opens cooking mode. Nothing leaves your pantry until you mark it as cooked." onClose={onClose}
    footer={<><button className="ghost-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => void start()} disabled={busy || (taken !== undefined && !same)}><ChefHat size={15} aria-hidden />{busy ? 'Starting…' : same ? 'Open cooking mode' : 'Plan and start cooking'}</button></>}>
    {error && <Notice>{error}</Notice>}
    <Field label="Meal"><select value={slot} onChange={e => setSlot(e.target.value as MealSlot)}>{slots.map(s => <option key={s} value={s}>{slotLabel[s]} today</option>)}</select></Field>
    {taken && !same && <Notice tone="warning">{slotLabel[slot]} today already has {taken.recipe.name}. Choose another meal, or change it in the planner first.</Notice>}
    {same && <Notice tone="success">{option.recipe.name} is already planned for {slotLabel[slot].toLowerCase()} today.</Notice>}
    <p className="muted small">For {option.servings} servings. You can adjust the amounts actually used before you finish.</p>
  </Modal>
}

/** Lists exactly what would be added, so nothing goes on the shopping list without a confirm. */
function ShopDialog({ option, onClose, onAdded }: { option: MealOption; onClose: () => void; onAdded: () => void }) {
  const { household } = useSession()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function add() {
    setBusy(true); setError('')
    try {
      for (const item of option.toBuy) await api.post(`/households/${household.id}/shopping/items`, { ingredientId: item.ingredient.id, quantity: item.quantity, unit: baseUnit[item.unit], note: `For ${option.recipe.name}` })
      toast.success(`Added ${option.toBuy.length} item${option.toBuy.length === 1 ? '' : 's'} for ${option.recipe.name} to your shopping list.`)
      onAdded()
    } catch (err) { setError(errorMessage(err, 'Could not add these to your shopping list.')); setBusy(false) }
  }
  return <Modal title={`Shopping for ${option.recipe.name}`} subtitle="Only the amount you’re short of is added." onClose={onClose}
    footer={<><button className="ghost-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => void add()} disabled={busy}><ShoppingCart size={15} aria-hidden />{busy ? 'Adding…' : `Add ${option.toBuy.length} to shopping list`}</button></>}>
    {error && <Notice>{error}</Notice>}
    <ul className="plain-list">{option.toBuy.map(t => <li key={t.ingredient.id}><span>{t.ingredient.name}</span><strong>{formatQuantity(t.quantity, t.unit)}</strong></li>)}</ul>
  </Modal>
}

function IdeaCard({ idea, onReview }: { idea: MealIdea; onReview: () => void }) {
  const { draft } = idea
  return <article className="suggestion-card option-card ai">
    <div className="suggestion-head">
      <div>
        <strong className="suggestion-name">{draft.name}</strong>
        <p className="recipe-meta"><span><Clock size={13} aria-hidden />{draft.prepMinutes} min prep · {draft.cookMinutes} min cook</span><span><Users size={13} aria-hidden />{draft.baseServings} servings</span></p>
      </div>
      <div className="badge-row"><Badge tone="blue">AI Draft</Badge><Badge tone={STATUS_TONE[idea.status]}>{STATUS_LABEL[idea.status]}</Badge><DietBadge recipe={idea.safety} /><SafetyBadge recipe={idea} /></div>
    </div>
    {draft.description && <p className="muted small">{draft.description}</p>}
    <Coverage coverage={idea.coverage} />
    <StockLines option={idea} />
    {draft.unresolved.length > 0 && <Notice tone="warning">Not in your ingredient list, so not counted: {draft.unresolved.join(', ')}.</Notice>}
    <div className="suggestion-actions"><button className="primary-button" onClick={onReview}><Check size={15} aria-hidden />Review &amp; save</button></div>
  </article>
}
