import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { api, type Dashboard, type Household, type User } from './lib/api'

const nav = [
  ['/', 'Dashboard'], ['/planner', 'Meal Planner'], ['/#recipes', 'Recipes'],
  ['/#pantry', 'Pantry'], ['/#shopping', 'Shopping List'], ['/#assistant', 'AI Assistant'],
]

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [household, setHousehold] = useState<Household | null>(null)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/auth/me')
      setUser(data.user)
      setHousehold(data.household ?? null)
      if (data.household) {
        try {
          const result = await api.get(`/households/${data.household.id}/dashboard`)
          setDashboard(result.data)
        } catch (err: any) {
          setDashboard(null)
          setError(err.response?.data?.error ?? 'Your account loaded, but the dashboard could not be refreshed.')
        }
      } else {
        setDashboard(null)
      }
    } catch (err: any) {
      if (err.response?.status !== 401) setError(err.response?.data?.error ?? 'Could not reach KitchenSync. Check that the API is running.')
      setUser(null)
    } finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [])

  if (loading) return <main className="center-state">Loading your kitchen…</main>
  if (!user) return <AuthScreen onSignedIn={refresh} error={error} />
  if (!household) return <HouseholdSetup user={user} onCreated={refresh} />
  return <DashboardShell user={user} household={household} dashboard={dashboard} error={error} onRefresh={refresh} />
}

function AuthScreen({ onSignedIn, error }: { onSignedIn: () => void; error: string }) {
  const [register, setRegister] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setBusy(true)
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    try { await api.post(`/auth/${register ? 'register' : 'login'}`, fields); onSignedIn() }
    catch (err: any) { setMessage(err.response?.data?.error ?? 'Sign in failed. Please try again.') }
    finally { setBusy(false) }
  }
  return <main className="auth-page"><section className="auth-card">
    <Brand />
    <p className="eyebrow">A calmer kitchen starts here</p><h1>{register ? 'Create your account' : 'Welcome back'}</h1>
    <p className="muted">Keep the meal plan and what’s actually in your kitchen in sync.</p>
    {(message || error) && <div className="notice error">{message || error}</div>}
    <form onSubmit={submit} className="stack-form">
      {register && <label>Your name<input name="name" autoComplete="name" required placeholder="Aarav Sharma" /></label>}
      <label>Email<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
      <label>Password<input name="password" type="password" minLength={10} autoComplete={register ? 'new-password' : 'current-password'} required placeholder="At least 10 characters" /></label>
      <button className="primary-button" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
    </form>
    <p className="switch-auth">{register ? 'Already have an account?' : 'New to KitchenSync?'} <button onClick={() => setRegister(!register)}>{register ? 'Sign in' : 'Create an account'}</button></p>
  </section></main>
}

function HouseholdSetup({ user, onCreated }: { user: User; onCreated: () => void }) {
  const [message, setMessage] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage('')
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    try { await api.post('/households', fields); onCreated() }
    catch (err: any) { setMessage(err.response?.data?.error ?? 'Could not create household.') }
  }
  return <main className="auth-page"><section className="auth-card">
    <Brand /><p className="eyebrow">One shared kitchen</p><h1>Set up your household</h1>
    <p className="muted">Hi {user.name}. Give your kitchen a name and set the usual number of servings. You can invite other members from settings later.</p>
    {message && <div className="notice error">{message}</div>}
    <form onSubmit={submit} className="stack-form"><label>Household name<input name="name" required placeholder="The Sharma kitchen" /></label><label>Usual servings<input name="defaultServings" type="number" min="1" max="20" defaultValue="3" required /></label><button className="primary-button">Create household</button></form>
  </section></main>
}

function DashboardShell({ user, household, dashboard, error, onRefresh }: { user: User; household: Household; dashboard: Dashboard | null; error: string; onRefresh: () => void }) {
  const location = useLocation()
  async function logout() { await api.post('/auth/logout'); onRefresh() }
  return <div className="app-shell">
    <aside className="sidebar"><Brand /><p className="household-chip">⌂ &nbsp;{household.name}</p><nav>{nav.map(([href, label], i) => <Link key={label} className={(location.pathname === href || (i === 0 && location.pathname === '/')) ? 'active' : ''} to={href}>{label}</Link>)}<Link to="/#settings">Household & Settings</Link></nav><div className="sidebar-bottom"><span className="avatar">{user.name[0]?.toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.email}</small></span><button className="quiet-button" onClick={logout} title="Sign out">↗</button></div></aside>
    <main className="main-content"><Routes><Route path="/" element={<Dashboard household={household} data={dashboard} error={error} />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></main>
    <nav className="mobile-nav">{nav.slice(0, 5).map(([href, label]) => <Link key={href} to={href}>{label.replace('Meal Planner', 'Plan').replace('Dashboard', 'Home').replace('Shopping List', 'Shop')}</Link>)}</nav>
  </div>
}

function Dashboard({ household, data, error }: { household: Household; data: Dashboard | null; error: string }) {
  const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()
  return <>
    <header className="page-header"><div><p className="eyebrow">{today}</p><h1>Your kitchen, in sync.</h1><p className="muted">A clear picture of what’s planned and what you have.</p></div><button className="primary-button" onClick={() => window.location.hash = 'planner'}>＋ Plan a meal</button></header>
    {error && <div className="notice error">{error}</div>}
    <section className="welcome-banner"><div><p className="eyebrow">TODAY AT {household.name.toUpperCase()}</p><h2>Small plans make easier evenings.</h2><p>Your kitchen workspace is ready. Add pantry stock and meals to see shortages before cooking.</p></div><div className="banner-mark">✳</div></section>
    <section className="stat-grid"><Stat label="Pantry items" value={data?.pantryCount ?? '—'} note="Tracked in your kitchen" /><Stat label="Recipes" value={data?.recipeCount ?? '—'} note="Ready for your meal plan" /><Stat label="Meals planned" value={data?.meals.length ?? '—'} note="Coming up this week" /><Stat label="Shopping items" value={data?.shoppingCount ?? '—'} note="Confirmed receipt updates stock" /></section>
    <section className="content-grid"><article className="panel"><div className="panel-heading"><div><p className="eyebrow">UP NEXT</p><h2>Today’s meals</h2></div><Link to="/#planner">Open planner ↗</Link></div>
      {data?.meals.length ? <div className="meal-list">{data.meals.map(meal => <div className="meal-row" key={meal.id}><span className="meal-time">{meal.slot}</span><strong>{meal.recipe.name}</strong><span>{meal.servings} servings</span></div>)}</div> : <div className="empty-state"><span className="empty-icon">◷</span><strong>No meals planned yet</strong><p>Plan the first meal and KitchenSync can work out what ingredients you’ll need.</p><button className="secondary-button" onClick={() => window.location.hash = 'planner'}>Plan a meal</button></div>}
    </article><article className="panel side-panel"><p className="eyebrow">A GOOD FIRST STEP</p><h2>Start with what’s on hand</h2><p className="muted">Add a few staples you already have. We’ll show what’s confirmed, estimated, or ready for a quick check.</p><button className="secondary-button" onClick={() => window.location.hash = 'pantry'}>＋ Add pantry items</button><div className="tip"><span>✦</span><p>Meal planning won’t reduce stock. Ingredients are deducted only when you confirm cooking.</p></div></article></section>
  </>
}

function Stat({ label, value, note }: { label: string; value: string | number; note: string }) { return <article className="stat-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article> }
function Brand() { return <Link className="brand" to="/"><span className="brand-icon">k</span><span>kitchen<span className="brand-light">sync</span></span></Link> }

export default App
