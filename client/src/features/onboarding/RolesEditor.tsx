import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage, type KitchenRole, type KitchenRoles } from '../../lib/api'
import { KITCHEN_ROLES, KITCHEN_ROLE_LABEL } from '../../lib/food'
import { Notice, Spinner } from '../../components/ui'

const toggle = (list: KitchenRole[], role: KitchenRole) => list.includes(role) ? list.filter(r => r !== role) : [...list, role]

type Props = { householdId: string; userId: string; owner: boolean; saveLabel?: string; onSaved: (message: string) => void | Promise<void> }

/** Who plans, cooks, shops and checks stock. The owner edits everyone; others edit only their own row. */
export function RolesEditor({ householdId, userId, owner, saveLabel = 'Save jobs', onSaved }: Props) {
  const [data, setData] = useState<KitchenRoles | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try { setData((await api.get<KitchenRoles>(`/households/${householdId}/roles`)).data) }
    catch (err) { setError(errorMessage(err, 'Could not load who does what.')) }
  }, [householdId])
  useEffect(() => { void load() }, [load])

  async function save() {
    if (!data) return
    setBusy(true); setError('')
    const body = owner ? { members: data.members.map(m => ({ userId: m.userId, roles: m.roles })), family: data.family.map(f => ({ id: f.id, roles: f.roles })) }
      : { members: data.members.filter(m => m.userId === userId).map(m => ({ userId: m.userId, roles: m.roles })) }
    try { setData((await api.put<KitchenRoles>(`/households/${householdId}/roles`, body)).data); await onSaved('Saved who does what.') }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }

  if (!data) return error ? <Notice onRetry={load}>{error}</Notice> : <Spinner label="Loading…" />
  const rows = [
    ...data.members.map(m => ({ key: m.userId, name: m.userId === userId ? `${m.name} (you)` : m.name, roles: m.roles, editable: owner || m.userId === userId,
      set: (roles: KitchenRole[]) => setData({ ...data, members: data.members.map(x => x.userId === m.userId ? { ...x, roles } : x) }) })),
    ...data.family.map(f => ({ key: f.id, name: f.name, roles: f.roles, editable: owner,
      set: (roles: KitchenRole[]) => setData({ ...data, family: data.family.map(x => x.id === f.id ? { ...x, roles } : x) }) })),
  ]
  return <div className="roles-editor">
    {error && <Notice>{error}</Notice>}
    <ul className="people-list">{rows.map(row => <li key={row.key}>
      <fieldset className="chip-field role-row" disabled={!row.editable}>
        <legend className="field-label">{row.name}</legend>
        <div className="chip-options">{KITCHEN_ROLES.map(role => <button type="button" key={role} className={`toggle-chip ${row.roles.includes(role) ? 'active' : ''}`}
          aria-pressed={row.roles.includes(role)} onClick={() => row.set(toggle(row.roles, role))}>{KITCHEN_ROLE_LABEL[role]}</button>)}</div>
      </fieldset>
    </li>)}</ul>
    {!owner && <p className="muted small">The household owner chooses jobs for others. You can change your own.</p>}
    <button type="button" className="primary-button" onClick={save} disabled={busy}>{busy ? 'Saving…' : saveLabel}</button>
  </div>
}
