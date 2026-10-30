import { useState, type FormEvent } from 'react'
import { api, errorMessage, type User } from '../../lib/api'
import { Brand } from '../../components/AppShell'
import { Notice, Segmented } from '../../components/ui'

export function HouseholdSetup({ user, onCreated, onSignOut }: { user: User; onCreated: () => Promise<void>; onSignOut: () => Promise<void> }) {
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setBusy(true)
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    try { await api.post(mode === 'create' ? '/households' : '/households/join', fields); await onCreated() }
    catch (err) { setMessage(errorMessage(err, mode === 'create' ? 'Could not create household.' : 'Could not join that household.')) }
    finally { setBusy(false) }
  }

  return <main className="auth-page"><section className="auth-card">
    <Brand /><p className="eyebrow">ONE SHARED KITCHEN</p><h1>{mode === 'create' ? 'Set up your household' : 'Join your family'}</h1>
    <p className="muted">Hi {user.name}. {mode === 'create' ? 'Give your kitchen a name and set the usual number of servings.' : 'Enter the invite code the household owner shared from Settings.'}</p>
    <Segmented label="Household setup" value={mode} onChange={value => { setMode(value); setMessage('') }} options={[{ value: 'create', label: 'Create a household' }, { value: 'join', label: 'Join with a code' }]} />
    {message && <Notice>{message}</Notice>}
    {mode === 'create'
      ? <form key="create" onSubmit={submit} className="stack-form">
          <label>Household name<input name="name" required minLength={2} maxLength={80} placeholder="The Sharma kitchen" /></label>
          <label>Usual servings<input name="defaultServings" type="number" min="1" max="20" defaultValue="3" required /></label>
          <button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create household'}</button>
        </form>
      : <form key="join" onSubmit={submit} className="stack-form">
          <label>Invite code<input name="code" required minLength={4} maxLength={20} placeholder="e.g. K7M2QX9P" autoComplete="off" className="code-input" /></label>
          <button className="primary-button" disabled={busy}>{busy ? 'Joining…' : 'Join household'}</button>
        </form>}
    <p className="switch-auth">Signed in as {user.email}. <button type="button" onClick={() => void onSignOut()}>Sign out</button></p>
  </section></main>
}
