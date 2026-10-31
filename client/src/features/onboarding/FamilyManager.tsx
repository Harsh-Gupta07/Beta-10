import { useState } from 'react'
import { Plus, Users } from 'lucide-react'
import { api, errorMessage, type FamilyProfile, type PersonNeeds } from '../../lib/api'
import { useSession } from '../../lib/session'
import { Notice } from '../../components/ui'
import { FamilyEditor, PersonRow } from './Onboarding'
import { emptyNeeds } from './PersonFields'

/** Add, edit and remove family profiles (people without a login) after onboarding. */
export function FamilyManager({ family, onChanged }: { family: FamilyProfile[]; onChanged: (message: string) => Promise<void> | void }) {
  const { household } = useSession()
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [draft, setDraft] = useState<{ name: string; needs: PersonNeeds }>({ name: '', needs: emptyNeeds })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(request: () => Promise<unknown>, message: string) {
    setBusy(true); setError('')
    try { await request(); setEditing(null); await onChanged(message) }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  const start = (person?: FamilyProfile) => {
    setDraft(person ? { name: person.name, needs: { ageGroup: person.ageGroup, dietType: person.dietType, allergens: person.allergens, healthGoals: person.healthGoals, weeklyFasts: person.weeklyFasts } } : { name: '', needs: emptyNeeds })
    setEditing(person ? person.id : 'new')
  }
  const save = (id: string | null) => run(() => id
    ? api.put(`/households/${household.id}/family/${id}`, { name: draft.name, ...draft.needs })
    : api.post(`/households/${household.id}/family`, { name: draft.name, ...draft.needs }), `Saved ${draft.name.trim()}.`)

  return <section className="panel">
    <p className="eyebrow">FAMILY</p><h2 className="panel-title"><Users size={16} aria-hidden className="inline-icon" />People without a login</h2>
    <p className="muted small">Kids, grandparents or anyone who eats at home but doesn’t use KitchenSync. Their allergies and diet count on every recipe.</p>
    {error && <Notice>{error}</Notice>}
    <ul className="people-list">
      {family.map(person => <li key={person.id} className={editing === person.id ? 'open' : ''}>
        <PersonRow icon={<Users size={18} aria-hidden />} name={person.name} needs={person} editing={editing === person.id} onEdit={() => start(person)}
          onRemove={() => window.confirm(`Remove ${person.name}?`) && run(() => api.delete(`/households/${household.id}/family/${person.id}`), `Removed ${person.name}.`)} />
        {editing === person.id && <FamilyEditor draft={draft} setDraft={setDraft} busy={busy} onSave={() => save(person.id)} onCancel={() => setEditing(null)} />}
      </li>)}
      {editing === 'new' && <li className="open"><FamilyEditor draft={draft} setDraft={setDraft} busy={busy} onSave={() => save(null)} onCancel={() => setEditing(null)} /></li>}
    </ul>
    {editing !== 'new' && <button type="button" className="secondary-button add-person" onClick={() => start()}><Plus size={16} aria-hidden />Add someone</button>}
  </section>
}
