import { useEffect, useState, type FormEvent } from 'react'
import axios from 'axios'
import { CalendarCheck, PlayCircle, ShieldCheck, ShoppingBasket, Smartphone } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { LANDING_PHOTOS } from '../../lib/images'
import { Brand } from '../../components/AppShell'
import { Notice } from '../../components/ui'
import { PasswordInput } from '../../components/PasswordInput'
import { GoogleButton } from './GoogleButton'

type Providers = { google: { clientId: string } | null; apple: null }

const promises = [
  { icon: CalendarCheck, title: 'Plan meals around what’s at home', text: 'See what each planned meal needs and what you’re short of.' },
  { icon: ShoppingBasket, title: 'Shop only for the gap', text: 'Shortages turn into a shopping list your whole family shares.' },
  { icon: ShieldCheck, title: 'Safe for everyone at the table', text: 'Allergies and diets are checked on every dish.' },
]

/** Landing page: what KitchenSync does, plus every way to sign in. */
export function AuthScreen({ onSignedIn, error }: { onSignedIn: () => Promise<void>; error: string }) {
  const [mode, setMode] = useState<'signin' | 'register'>('signin')
  const [providers, setProviders] = useState<Providers | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'' | 'email' | 'demo' | 'google'>('')
  const [phoneOpen, setPhoneOpen] = useState(false)
  // Set when Google matched an existing email account: its password is needed once to connect them.
  const [linkCredential, setLinkCredential] = useState('')
  const register = mode === 'register'

  // If the server is down (e.g. restarting), keep checking quietly; once it answers, clear the old error.
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const check = async (attempt: number) => {
      try {
        const { data } = await api.get<Providers>('/auth/providers')
        if (cancelled) return
        setProviders(data)
        if (attempt > 0 || error) void onSignedIn()
      } catch {
        if (cancelled) return
        setProviders(current => current ?? { google: null, apple: null })
        if (attempt < 20) timer = setTimeout(() => void check(attempt + 1), 3000)
      }
    }
    void check(0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- runs once per visit to the sign-in page

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setBusy('email')
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    try { await api.post(`/auth/${register ? 'register' : 'login'}`, fields); await onSignedIn() }
    catch (err) { setMessage(errorMessage(err, register ? 'Could not create your account. Please try again.' : 'Sign in failed. Please try again.')) }
    finally { setBusy('') }
  }

  async function google(credential: string, password?: string) {
    setMessage(''); setBusy('google')
    try { await api.post('/auth/google', { credential, password }); setLinkCredential(''); await onSignedIn() }
    catch (err) {
      if (axios.isAxiosError(err) && (err.response?.data as { code?: string } | undefined)?.code === 'PASSWORD_REQUIRED') setLinkCredential(credential)
      setMessage(errorMessage(err, 'Google sign-in failed. Please try again.'))
    }
    finally { setBusy('') }
  }

  function connectGoogle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void google(linkCredential, String(new FormData(event.currentTarget).get('password') ?? ''))
  }

  async function demo() {
    setMessage(''); setBusy('demo')
    try { await api.post('/auth/demo'); await onSignedIn() }
    catch (err) { setMessage(errorMessage(err, 'The demo couldn’t start. Please try again.')) }
    finally { setBusy('') }
  }

  const [hero, ...side] = LANDING_PHOTOS
  return <main className="landing">
    <section className="landing-story">
      <Brand />
      <h1>Your kitchen, <span>in sync</span> with your meal plan.</h1>
      <p className="landing-lead">KitchenSync knows what’s in your pantry, what your family can eat, and what to buy, so dinner is never a last-minute scramble.</p>
      <ul className="landing-promises">{promises.map(({ icon: Icon, title, text }) => <li key={title}>
        <span className="promise-icon"><Icon size={18} aria-hidden /></span><span><strong>{title}</strong><small>{text}</small></span>
      </li>)}</ul>
      <div className="landing-photos">
        <figure className="photo-main"><img src={hero!.url} alt={hero!.alt} loading="eager" /></figure>
        {side.map(photo => <figure key={photo.url}><img src={photo.url} alt={photo.alt} loading="lazy" /></figure>)}
      </div>
      <p className="photo-credits">Photos: {LANDING_PHOTOS.map((p, i) => <span key={p.url}>{i > 0 && ' · '}<a href={p.source} target="_blank" rel="noreferrer">{p.credit}</a> ({p.license})</span>)}, via Wikimedia Commons</p>
    </section>

    <section className="auth-card" aria-labelledby="auth-title">
      <div className="mobile-only"><Brand /></div>
      <h2 id="auth-title">{register ? 'Create your account' : 'Welcome to KitchenSync'}</h2>
      <p className="muted">{register ? 'Free for your whole household.' : 'Sign in to your household’s kitchen.'}</p>
      {(message || error) && <Notice>{message || error}</Notice>}

      <div className="social-buttons">
        {providers?.google
          ? <GoogleButton clientId={providers.google.clientId} onCredential={google} />
          : <button type="button" className="social-button" disabled aria-describedby="google-note"><GoogleMark />Continue with Google</button>}
        {busy === 'google' && <small className="muted">Signing you in with Google…</small>}
        {linkCredential && <form onSubmit={connectGoogle} className="stack-form tight">
          <label>Your KitchenSync password<PasswordInput name="password" maxLength={128} autoComplete="current-password" required autoFocus /></label>
          <div className="panel-actions">
            <button className="primary-button" disabled={busy !== ''}>Connect Google</button>
            <button type="button" className="secondary-button" onClick={() => { setLinkCredential(''); setMessage('') }}>Cancel</button>
          </div>
        </form>}
        <button type="button" className="social-button" disabled aria-describedby="apple-note"><AppleMark />Continue with Apple</button>
        <button type="button" className="social-button" onClick={() => setPhoneOpen(!phoneOpen)} aria-expanded={phoneOpen}><Smartphone size={17} aria-hidden />Continue with phone number</button>
        {phoneOpen && <PhonePreview />}
        {providers && !providers.google && <small id="google-note" className="muted">Google sign-in is being set up.</small>}
        <small id="apple-note" className="muted">Apple sign-in is coming soon.</small>
      </div>

      <button type="button" className="demo-button" onClick={demo} disabled={busy !== ''}><PlayCircle size={18} aria-hidden />{busy === 'demo' ? 'Preparing your demo kitchen…' : 'See a demo kitchen'}</button>

      <p className="auth-divider"><span>or use email</span></p>
      <form onSubmit={submit} className="stack-form tight">
        {register && <label>Your name<input name="name" autoComplete="name" required maxLength={80} placeholder="Aarav Sharma" /></label>}
        <label>Email<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
        <label>Password<PasswordInput name="password" minLength={10} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} required placeholder="At least 10 characters" /></label>
        <button className="primary-button" disabled={busy !== ''}>{busy === 'email' ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
      </form>
      <p className="switch-auth">{register ? 'Already have an account?' : 'New to KitchenSync?'} <button type="button" onClick={() => { setMode(register ? 'signin' : 'register'); setMessage('') }}>{register ? 'Sign in' : 'Create an account'}</button></p>
    </section>
  </main>
}

/** Placeholder for OTP sign-in: shows the flow, but sending codes isn't connected yet. */
function PhonePreview() {
  const [number, setNumber] = useState('')
  return <div className="phone-preview">
    <label className="field-label" htmlFor="phone-number">Mobile number</label>
    <div className="phone-row">
      <span className="phone-prefix">+91</span>
      <input id="phone-number" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} placeholder="98765 43210"
        value={number} onChange={e => setNumber(e.target.value.replace(/\D/g, ''))} />
    </div>
    <button type="button" className="secondary-button" disabled>Send code</button>
    <small className="muted">Sign-in with a one-time code is coming soon. Use Google, email or the demo for now.</small>
  </div>
}

function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
}

function AppleMark() {
  return <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden fill="currentColor"><path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9s-2-.9-3.4-.9c-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.5 1.3-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.5.9-1.4 1.3-2.8 1.3-2.8s-2.6-1-2.6-4.1zM13.9 5c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z"/></svg>
}
