import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage, type Attendance } from '../../lib/api'
import { useSession } from '../../lib/session'
import { Notice } from '../../components/ui'

/** Tick who is (or was) eating a meal. Everyone counts unless unticked; this feeds "recently eaten" and suggestions. */
export function WhoIsEating({ kind, id, onSaved }: { kind: 'meal' | 'log'; id: string; onSaved?: () => void }) {
  const { household } = useSession()
  const path = `/households/${household.id}/${kind === 'meal' ? 'meals' : 'eaten-logs'}/${id}/attendance`
  const [data, setData] = useState<Attendance | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setData((await api.get<Attendance>(path)).data) }
    catch (err) { setError(errorMessage(err, 'Could not load who is eating.')) }
  }, [path])
  useEffect(() => { void load() }, [load])

  async function toggle(userId: string) {
    if (!data) return
    const absent = data.members.filter(m => m.id === userId ? m.eating : !m.eating).map(m => m.id)
    setBusy(true); setError('')
    try { setData((await api.put<Attendance>(path, { absentUserIds: absent })).data); onSaved?.() }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }

  if (error && !data) return <Notice>{error}</Notice>
  if (!data || data.members.length < 2) return null
  return <fieldset className="chip-field who-eating">
    <legend className="field-label">Who’s eating</legend>
    {error && <Notice>{error}</Notice>}
    <div className="chip-options">{data.members.map(m => <button type="button" key={m.id} className={`toggle-chip ${m.eating ? 'active' : ''}`} aria-pressed={m.eating}
      disabled={busy || !data.editable} onClick={() => toggle(m.id)}>{m.name}</button>)}</div>
    <p className="muted small">{data.editable ? 'Untick anyone who isn’t eating. This keeps “recently eaten” and suggestions accurate.' : 'This meal is too old to change.'}</p>
  </fieldset>
}
