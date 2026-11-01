import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ShieldAlert, Users, X } from 'lucide-react'
import { api, errorMessage, type Allergen, type DietType, type FoodPreferences, type HouseholdDetails, type HouseholdFoodProfile, type Ingredient, type RecipeSummary } from '../../lib/api'
import { useSession } from '../../lib/session'
import { ALLERGENS, ALLERGEN_LABEL, DIET_HINT, DIET_LABEL, DIET_TYPES, SPICE_LABEL } from '../../lib/food'
import { Badge, Field, Notice, PageHeader, Spinner } from '../../components/ui'
import { FamilyManager } from '../onboarding/FamilyManager'

type Option = { id: string; name: string }
const splitList = (value: string) => [...new Set(value.split(',').map(v => v.trim()).filter(Boolean))]

export function FoodPreferencesPage({ embedded = false }: { embedded?: boolean }) {
  const { household, user } = useSession()
  const [mine, setMine] = useState<FoodPreferences | null>(null)
  const [shared, setShared] = useState<HouseholdFoodProfile | null>(null)
  const [owner, setOwner] = useState(false)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [recipes, setRecipes] = useState<RecipeSummary[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [p, h, d, i, r] = await Promise.all([
        api.get<FoodPreferences>('/me/food-preferences'),
        api.get<HouseholdFoodProfile>(`/households/${household.id}/food-profile`),
        api.get<HouseholdDetails>(`/households/${household.id}`),
        api.get<Ingredient[]>(`/households/${household.id}/ingredients`),
        api.get<{ recipes: RecipeSummary[] }>(`/households/${household.id}/recipes`),
      ])
      setMine(p.data); setShared(h.data); setOwner(d.data.yourRole === 'OWNER'); setIngredients(i.data); setRecipes(r.data.recipes)
    } catch (err) { setError(errorMessage(err, 'Food preferences could not be loaded.')) }
  }, [household.id])
  useEffect(() => { void load() }, [load])

  async function save(request: () => Promise<unknown>, success: string) {
    setError(''); setNotice('')
    try { await request(); await load(); setNotice(success) }
    catch (err) { setError(errorMessage(err)) }
  }

  return <>
    {!embedded && <PageHeader eyebrow="FOOD PREFERENCES" title="What everyone eats" description="Allergies and diets are firm rules: dishes that clash are marked on every recipe. Likes and dislikes only guide suggestions." />}
    {error && <Notice onRetry={load}>{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    {!mine && !error && <Spinner label="Loading preferences…" />}

    {mine && shared && <div className="settings-grid">
      <MyPreferencesCard key={JSON.stringify(mine)} prefs={mine} ingredients={ingredients} recipes={recipes}
        onSave={body => save(() => api.put('/me/food-preferences', body), 'Your food preferences were saved.')} />
      <div className="stack">
        <HouseholdNeedsCard profile={shared} you={user.id} />
        <FamilyManager family={shared.family} onChanged={message => save(() => Promise.resolve(), message)} />
        <HouseholdDefaultsCard key={JSON.stringify([shared.cuisines, shared.usualSpice])} profile={shared} owner={owner}
          onSave={body => save(() => api.put(`/households/${household.id}/food-profile`, body), 'Household food defaults saved.')} />
      </div>
    </div>}
  </>
}

function MyPreferencesCard({ prefs, ingredients, recipes, onSave }: { prefs: FoodPreferences; ingredients: Option[]; recipes: Option[]; onSave: (body: object) => Promise<void> }) {
  const [dietType, setDietType] = useState<DietType | ''>(prefs.dietType ?? '')
  const [allergens, setAllergens] = useState<Allergen[]>(prefs.allergens)
  const [maxSpice, setMaxSpice] = useState(prefs.maxSpice ? String(prefs.maxSpice) : '')
  const [cuisines, setCuisines] = useState(prefs.cuisines.join(', '))
  const [avoid, setAvoid] = useState(prefs.avoidIngredients.map(i => i.id))
  const [liked, setLiked] = useState(prefs.likedIngredients.map(i => i.id))
  const [favourite, setFavourite] = useState(prefs.favouriteRecipes.map(r => r.id))
  const [disliked, setDisliked] = useState(prefs.dislikedRecipes.map(r => r.id))
  const [busy, setBusy] = useState(false)

  const toggleAllergen = (allergen: Allergen) => setAllergens(prev => prev.includes(allergen) ? prev.filter(a => a !== allergen) : [...prev, allergen])
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true)
    await onSave({ dietType: dietType || null, allergens, maxSpice: maxSpice ? Number(maxSpice) : null, cuisines: splitList(cuisines),
      avoidIngredientIds: avoid, likedIngredientIds: liked, favouriteRecipeIds: favourite, dislikedRecipeIds: disliked })
    setBusy(false)
  }

  return <section className="panel">
    <p className="eyebrow">YOU</p><h2 className="panel-title">My food preferences</h2>
    <form className="stack-form tight" onSubmit={submit}>
      <h3><ShieldAlert size={15} aria-hidden className="inline-icon" />Firm rules</h3>
      <Field label="Diet" hint={dietType ? DIET_HINT[dietType] : 'Leave unset if you eat everything.'}>
        <select value={dietType} onChange={e => setDietType(e.target.value as DietType | '')}>
          <option value="">Not set</option>
          {DIET_TYPES.map(d => <option key={d} value={d}>{DIET_LABEL[d]}</option>)}
        </select>
      </Field>
      <fieldset className="chip-field">
        <legend className="field-label">Allergies</legend>
        <div className="chip-options">{ALLERGENS.map(a => <button type="button" key={a} className={`toggle-chip ${allergens.includes(a) ? 'active' : ''}`} aria-pressed={allergens.includes(a)} onClick={() => toggleAllergen(a)}>{ALLERGEN_LABEL[a]}</button>)}</div>
      </fieldset>
      <ChipPicker label="Never use these ingredients" hint="For religious, health or personal reasons, e.g. onion and garlic." options={ingredients} selected={avoid} onChange={setAvoid} exclude={liked} />

      <h3>Likes (guide suggestions only)</h3>
      <Field label="Spice I enjoy, up to">
        <select value={maxSpice} onChange={e => setMaxSpice(e.target.value)}>
          <option value="">Not set</option>
          {[1, 2, 3, 4, 5].map(level => <option key={level} value={level}>{level}: {SPICE_LABEL[level]}</option>)}
        </select>
      </Field>
      <Field label="Favourite cuisines" hint="Comma separated, e.g. Punjabi, South Indian."><input value={cuisines} onChange={e => setCuisines(e.target.value)} maxLength={300} /></Field>
      <ChipPicker label="Ingredients I like" options={ingredients} selected={liked} onChange={setLiked} exclude={avoid} />
      <ChipPicker label="Favourite dishes" options={recipes} selected={favourite} onChange={setFavourite} exclude={disliked} />
      <ChipPicker label="Dishes I’d rather skip" options={recipes} selected={disliked} onChange={setDisliked} exclude={favourite} />
      <p className="muted small">Your allergies, diet and “never use” list are visible to your household so whoever cooks can respect them. Likes stay with you.</p>
      <button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save my preferences'}</button>
    </form>
  </section>
}

/** Pick several items from a list: a dropdown to add, chips to remove. */
function ChipPicker({ label, hint, options, selected, onChange, exclude = [] }: { label: string; hint?: string; options: Option[]; selected: string[]; onChange: (ids: string[]) => void; exclude?: string[] }) {
  const byId = useMemo(() => new Map(options.map(o => [o.id, o])), [options])
  const available = options.filter(o => !selected.includes(o.id) && !exclude.includes(o.id))
  return <Field label={label} hint={hint}>
    <div className="chip-picker">
      {selected.length > 0 && <div className="chip-options">{selected.map(id => <span key={id} className="chip">{byId.get(id)?.name ?? 'Unavailable'}
        <button type="button" aria-label={`Remove ${byId.get(id)?.name ?? 'item'}`} onClick={() => onChange(selected.filter(s => s !== id))}><X size={12} /></button></span>)}</div>}
      <select value="" onChange={e => e.target.value && onChange([...selected, e.target.value])} aria-label={`Add to ${label.toLowerCase()}`}>
        <option value="">Add…</option>
        {available.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  </Field>
}

function HouseholdNeedsCard({ profile, you }: { profile: HouseholdFoodProfile; you: string }) {
  return <section className="panel">
    <p className="eyebrow">HOUSEHOLD</p><h2 className="panel-title"><Users size={16} aria-hidden className="inline-icon" />Everyone’s firm rules</h2>
    <ul className="needs-list">{[...profile.members, ...profile.family.map(f => ({ ...f, id: `family:${f.id}`, avoidIngredients: [] as Array<{ id: string; name: string }> }))].map(m => {
      const none = !m.dietType && !m.allergens.length && !m.avoidIngredients.length
      return <li key={m.id}>
        <strong>{m.name}{m.id === you && ' (you)'}{m.id.startsWith('family:') && <small className="muted"> · no login</small>}</strong>
        {none ? <span className="muted small">No restrictions set</span> : <div className="badge-row">
          {m.dietType && <Badge tone="green">{DIET_LABEL[m.dietType]}</Badge>}
          {m.allergens.map(a => <Badge key={a} tone="red">{ALLERGEN_LABEL[a]} allergy</Badge>)}
          {m.avoidIngredients.map(i => <Badge key={i.id} tone="amber">No {i.name.toLowerCase()}</Badge>)}
        </div>}
      </li>
    })}</ul>
  </section>
}

function HouseholdDefaultsCard({ profile, owner, onSave }: { profile: HouseholdFoodProfile; owner: boolean; onSave: (body: object) => Promise<void> }) {
  const [cuisines, setCuisines] = useState(profile.cuisines.join(', '))
  const [usualSpice, setUsualSpice] = useState(profile.usualSpice ? String(profile.usualSpice) : '')
  return <section className="panel">
    <p className="eyebrow">HOUSEHOLD DEFAULTS</p><h2 className="panel-title">How this kitchen usually cooks</h2>
    {!owner && <p className="muted small">Only the owner can change these.</p>}
    <form className="stack-form tight" onSubmit={e => { e.preventDefault(); void onSave({ cuisines: splitList(cuisines), usualSpice: usualSpice ? Number(usualSpice) : null }) }}>
      <Field label="Usual cuisines" hint="Comma separated."><input value={cuisines} onChange={e => setCuisines(e.target.value)} maxLength={300} disabled={!owner} /></Field>
      <Field label="Usual spice level">
        <select value={usualSpice} onChange={e => setUsualSpice(e.target.value)} disabled={!owner}>
          <option value="">Not set</option>
          {[1, 2, 3, 4, 5].map(level => <option key={level} value={level}>{level}: {SPICE_LABEL[level]}</option>)}
        </select>
      </Field>
      {owner && <button className="secondary-button">Save defaults</button>}
    </form>
  </section>
}
