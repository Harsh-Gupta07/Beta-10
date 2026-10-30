import { useState, type FormEvent } from 'react'
import { api, errorMessage, type User } from '../../lib/api'
import { Brand } from '../../components/AppShell'
import { Notice } from '../../components/ui'

export function HouseholdSetup({ user, onCreated, onSignOut }: { user: User; onCreated: () => Promise<void>; onSignOut: () => Promise<void> }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setBusy(true)
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    try { await api.post('/households', fields); await onCreated() }
    catch (err) { setMessage(errorMessage(err, 'Could not create household.')) }
    finally { setBusy(false) }
  }

  return <main className="auth-page"><section className="auth-card">
    <Brand /><p className="eyebrow">ONE SHARED KITCHEN</p><h1>Set up your household</h1>
    <p className="muted">Hi {user.name}. Give your kitchen a name and set the usual number of servings. You can invite other members later.</p>
    {message && <Notice>{message}</Notice>}
    <form onSubmit={submit} className="stack-form">
      <label>Household name<input name="name" required minLength={2} maxLength={80} placeholder="The Sharma kitchen" /></label>
      <label>Usual servings<input name="defaultServings" type="number" min="1" max="20" defaultValue="3" required /></label>
      <button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create household'}</button>
    </form>
    <p className="switch-auth">Signed in as {user.email}. <button type="button" onClick={() => void onSignOut()}>Sign out</button></p>
  </section></main>
}
