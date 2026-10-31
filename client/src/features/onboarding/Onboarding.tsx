import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, Minus, Pencil, Plus, Trash2, UserRound, Users } from 'lucide-react'
import { api, errorMessage, type FamilyProfile, type FoodPreferences, type Household, type PersonNeeds, type User } from '../../lib/api'
import { AGE_GROUP_LABEL, DIET_LABEL } from '../../lib/food'
import { Brand } from '../../components/AppShell'
import { Badge, Notice, Segmented, Spinner } from '../../components/ui'
import { PersonFields, emptyNeeds } from './PersonFields'

type Props = { user: User; household: Household | null; onChanged: () => Promise<void>; onSignOut: () => Promise<void> }

/** First-time setup as short conversational cards. More cards (kitchen, roles, language) are added in later slices. */
export function Onboarding({ user, household, onChanged, onSignOut }: Props) {
  const step = household ? 2 : 1
  return <main className="onboarding">
    <header className="onboarding-head">
      <Brand />
      <ol className="step-dots" aria-label={`Step ${step} of 2`}>
        {['Your household', 'Who eats at home'].map((label, i) => <li key={label} className={i + 1 < step ? 'done' : i + 1 === step ? 'current' : ''} aria-current={i + 1 === step ? 'step' : undefined}>
          <span>{i + 1 < step ? <Check size={12} aria-hidden /> : i + 1}</span>{label}
        </li>)}
      </ol>
    </header>
    {household ? <PeopleStep user={user} household={household} onDone={onChanged} /> : <HouseholdStep user={user} onCreated={onChanged} />}
    <p className="switch-auth">Signed in as {user.email}. <button type="button" onClick={() => void onSignOut()}>Sign out</button></p>
  </main>
}

function HouseholdStep({ user, onCreated }: { user: User; onCreated: () => Promise<void> }) {
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [people, setPeople] = useState(3)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setBusy(true)
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    try {
      await api.post(mode === 'create' ? '/households' : '/households/join', mode === 'create' ? { name: fields.name, peopleCount: people, defaultServings: Math.min(20, people) } : fields)
      await onCreated()
    } catch (err) { setMessage(errorMessage(err, mode === 'create' ? 'Could not create your household.' : 'Could not join that household.')) }
    finally { setBusy(false) }
  }

  return <section className="onboarding-card">
    <p className="eyebrow">STEP 1</p>
    <h1>Namaste, {user.name.split(' ')[0]}! Let’s set up your kitchen.</h1>
    <p className="muted">Start a new household, or join your family’s with the code they shared.</p>
    <Segmented label="Household setup" value={mode} onChange={value => { setMode(value); setMessage('') }} options={[{ value: 'create', label: 'Start a household' }, { value: 'join', label: 'Join with a code' }]} />
    {message && <Notice>{message}</Notice>}
    {mode === 'create'
      ? <form key="create" onSubmit={submit} className="stack-form">
          <label>What should we call your kitchen?<input name="name" required minLength={2} maxLength={80} placeholder="The Sharma kitchen" /></label>
          <div className="field-label">How many people usually eat at home?</div>
          <div className="big-stepper" role="group" aria-label="People at home">
            <button type="button" className="icon-button" onClick={() => setPeople(Math.max(1, people - 1))} disabled={people <= 1} aria-label="Fewer people"><Minus size={18} /></button>
            <span aria-live="polite"><strong>{people}</strong> {people === 1 ? 'person' : 'people'}</span>
            <button type="button" className="icon-button" onClick={() => setPeople(Math.min(30, people + 1))} disabled={people >= 30} aria-label="More people"><Plus size={18} /></button>
          </div>
          <small className="muted">Recipes are scaled for this many by default. You can change it any time.</small>
          <button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Continue'}</button>
        </form>
      : <form key="join" onSubmit={submit} className="stack-form">
          <label>Invite code<input name="code" required minLength={4} maxLength={20} placeholder="e.g. K7M2QX9P" autoComplete="off" className="code-input" /></label>
          <button className="primary-button" disabled={busy}>{busy ? 'Joining…' : 'Join household'}</button>
        </form>}
  </section>
}

function PeopleStep({ user, household, onDone }: { user: User; household: Household; onDone: () => Promise<void> }) {
  const [mine, setMine] = useState<FoodPreferences | null>(null)
  const [me, setMe] = useState<PersonNeeds>(emptyNeeds)
  const [family, setFamily] = useState<FamilyProfile[]>([])
  const [editing, setEditing] = useState<'me' | 'new' | string | null>('me')
  const [draft, setDraft] = useState<{ name: string; needs: PersonNeeds }>({ name: '', needs: emptyNeeds })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [p, f] = await Promise.all([api.get<FoodPreferences>('/me/food-preferences'), api.get<FamilyProfile[]>(`/households/${household.id}/family`)])
      setMine(p.data); setFamily(f.data)
      setMe({ ageGroup: p.data.ageGroup, dietType: p.data.dietType, allergens: p.data.allergens, healthGoals: p.data.healthGoals, weeklyFasts: p.data.weeklyFasts })
    } catch (err) { setError(errorMessage(err, 'Could not load your household.')) }
  }, [household.id])
  useEffect(() => { void load() }, [load])

  async function run(request: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await request(); await load(); setEditing(null) }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  // My preferences are saved as a whole set, so send back everything else unchanged.
  const saveMe = () => run(() => api.put('/me/food-preferences', {
    ...me, maxSpice: mine!.maxSpice, cuisines: mine!.cuisines,
    avoidIngredientIds: mine!.avoidIngredients.map(i => i.id), likedIngredientIds: mine!.likedIngredients.map(i => i.id),
    favouriteRecipeIds: mine!.favouriteRecipes.map(r => r.id), dislikedRecipeIds: mine!.dislikedRecipes.map(r => r.id),
  }))
  const saveFamily = (id: string | null) => run(() => id
    ? api.put(`/households/${household.id}/family/${id}`, { name: draft.name, ...draft.needs })
    : api.post(`/households/${household.id}/family`, { name: draft.name, ...draft.needs }))
  const startFamily = (person?: FamilyProfile) => {
    setDraft(person ? { name: person.name, needs: { ageGroup: person.ageGroup, dietType: person.dietType, allergens: person.allergens, healthGoals: person.healthGoals, weeklyFasts: person.weeklyFasts } } : { name: '', needs: emptyNeeds })
    setEditing(person ? person.id : 'new')
  }
  async function finish() {
    setBusy(true); setError('')
    try { await api.post(`/households/${household.id}/onboarding/complete`); await onDone() }
    catch (err) { setError(errorMessage(err)); setBusy(false) }
  }

  if (!mine) return <section className="onboarding-card">{error ? <Notice onRetry={load}>{error}</Notice> : <Spinner label="Loading…" />}</section>
  const expected = household.peopleCount ?? 1
  const remaining = Math.max(0, expected - 1 - family.length)

  return <section className="onboarding-card wide">
    <p className="eyebrow">STEP 2</p>
    <h1>Who eats at home?</h1>
    <p className="muted">Tell us about everyone at the table, including kids and grandparents without a phone. Allergies and diets keep every suggestion safe for all of them.</p>
    {error && <Notice>{error}</Notice>}

    <ul className="people-list">
      <li className={editing === 'me' ? 'open' : ''}>
        <PersonRow icon={<UserRound size={18} aria-hidden />} name={`${user.name} (you)`} needs={me} onEdit={() => setEditing('me')} editing={editing === 'me'} />
        {editing === 'me' && <div className="person-editor">
          <PersonFields idPrefix="me" value={me} onChange={setMe} />
          <div className="panel-actions"><button className="primary-button" disabled={busy} onClick={saveMe}>{busy ? 'Saving…' : 'Save'}</button></div>
        </div>}
      </li>
      {family.map(person => <li key={person.id} className={editing === person.id ? 'open' : ''}>
        <PersonRow icon={<Users size={18} aria-hidden />} name={person.name} needs={person} onEdit={() => startFamily(person)} editing={editing === person.id}
          onRemove={() => window.confirm(`Remove ${person.name}?`) && run(() => api.delete(`/households/${household.id}/family/${person.id}`))} />
        {editing === person.id && <FamilyEditor draft={draft} setDraft={setDraft} busy={busy} onSave={() => saveFamily(person.id)} onCancel={() => setEditing(null)} />}
      </li>)}
      {editing === 'new' && <li className="open"><FamilyEditor draft={draft} setDraft={setDraft} busy={busy} onSave={() => saveFamily(null)} onCancel={() => setEditing(null)} /></li>}
    </ul>
    {editing !== 'new' && <button type="button" className="secondary-button add-person" onClick={() => startFamily()}><Plus size={16} aria-hidden />Add someone{remaining > 0 ? ` (${remaining} more of ${expected})` : ''}</button>}
    <p className="muted small">Family members with their own phone can join later with an invite code and fill in their own card.</p>

    <div className="onboarding-actions">
      <button type="button" className="ghost-button" onClick={finish} disabled={busy}>Skip for now</button>
      <button type="button" className="primary-button" onClick={finish} disabled={busy || editing !== null}>{busy ? 'Finishing…' : 'Finish setup'}</button>
    </div>
  </section>
}

export function PersonRow({ icon, name, needs, editing, onEdit, onRemove }: { icon: React.ReactNode; name: string; needs: PersonNeeds; editing: boolean; onEdit: () => void; onRemove?: () => void }) {
  const summary = [needs.ageGroup && AGE_GROUP_LABEL[needs.ageGroup], needs.dietType && DIET_LABEL[needs.dietType]].filter(Boolean)
  return <div className="person-row">
    <span className="person-icon">{icon}</span>
    <span className="person-summary"><strong>{name}</strong>
      <span className="badge-row">
        {summary.map(s => <Badge key={s as string} tone="green">{s}</Badge>)}
        {needs.allergens.length > 0 && <Badge tone="red">{needs.allergens.length} allerg{needs.allergens.length === 1 ? 'y' : 'ies'}</Badge>}
        {needs.weeklyFasts.length > 0 && <Badge tone="amber">Fasts {needs.weeklyFasts.length}×/week</Badge>}
        {!summary.length && !needs.allergens.length && <small className="muted">Not filled in yet</small>}
      </span>
    </span>
    {!editing && <span className="person-actions">
      <button type="button" className="icon-button" onClick={onEdit} aria-label={`Edit ${name}`}><Pencil size={15} /></button>
      {onRemove && <button type="button" className="icon-button danger-text" onClick={onRemove} aria-label={`Remove ${name}`}><Trash2 size={15} /></button>}
    </span>}
  </div>
}

export function FamilyEditor({ draft, setDraft, busy, onSave, onCancel }: { draft: { name: string; needs: PersonNeeds }; setDraft: (d: { name: string; needs: PersonNeeds }) => void; busy: boolean; onSave: () => void; onCancel: () => void }) {
  return <div className="person-editor">
    <label className="field-label">Name<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} maxLength={60} placeholder="e.g. Dadi, Aarav" autoFocus /></label>
    <PersonFields idPrefix="family" value={draft.needs} onChange={needs => setDraft({ ...draft, needs })} />
    <div className="panel-actions">
      <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
      <button type="button" className="primary-button" disabled={busy || !draft.name.trim()} onClick={onSave}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  </div>
}
