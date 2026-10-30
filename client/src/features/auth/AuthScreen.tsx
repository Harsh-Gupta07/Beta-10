import { useState, type FormEvent } from 'react'
import { api, errorMessage } from '../../lib/api'
import { Brand } from '../../components/AppShell'
import { Notice } from '../../components/ui'

export function AuthScreen({ onSignedIn, error }: { onSignedIn: () => Promise<void>; error: string }) {
  const [register, setRegister] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setBusy(true)
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    try { await api.post(`/auth/${register ? 'register' : 'login'}`, fields); await onSignedIn() }
    catch (err) { setMessage(errorMessage(err, 'Sign in failed. Please try again.')) }
    finally { setBusy(false) }
  }

  return <main className="auth-page"><section className="auth-card">
    <Brand />
    <p className="eyebrow">A CALMER KITCHEN STARTS HERE</p><h1>{register ? 'Create your account' : 'Welcome back'}</h1>
    <p className="muted">Keep the meal plan and what’s actually in your kitchen in sync.</p>
    {(message || error) && <Notice>{message || error}</Notice>}
    <form onSubmit={submit} className="stack-form">
      {register && <label>Your name<input name="name" autoComplete="name" required maxLength={80} placeholder="Aarav Sharma" /></label>}
      <label>Email<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
      <label>Password<input name="password" type="password" minLength={10} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} required placeholder="At least 10 characters" /></label>
      <button className="primary-button" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
    </form>
    <p className="switch-auth">{register ? 'Already have an account?' : 'New to KitchenSync?'} <button type="button" onClick={() => { setRegister(!register); setMessage('') }}>{register ? 'Sign in' : 'Create an account'}</button></p>
  </section></main>
}
