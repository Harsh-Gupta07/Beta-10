import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Copy, KeyRound, LogOut, RefreshCw, Sparkles, UserMinus } from 'lucide-react'
import { api, errorMessage, type HouseholdDetails } from '../../lib/api'
import { useSession } from '../../lib/session'
import { Badge, Field, Notice, PageHeader, Spinner } from '../../components/ui'
import { PasswordInput } from '../../components/PasswordInput'
import { KitchenFields, type KitchenSetup } from '../onboarding/KitchenFields'

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC']

export function SettingsPage({ onSessionChange }: { onSessionChange: () => Promise<void> }) {
  const { household, user, signOut } = useSession()
  const [details, setDetails] = useState<HouseholdDetails | null>(null)
  const [ai, setAi] = useState<{ configured: boolean; model: string | null } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [h, a] = await Promise.all([api.get<HouseholdDetails>(`/households/${household.id}`), api.get(`/households/${household.id}/assistant`)])
      setDetails(h.data); setAi(a.data)
    } catch (err) { setError(errorMessage(err, 'Settings could not be loaded.')) }
  }, [household.id])
  useEffect(() => { void load() }, [load])

  async function run(request: () => Promise<unknown>, success: string, refreshSession = false) {
    setError(''); setNotice('')
    try { await request(); setNotice(success); await load(); if (refreshSession) await onSessionChange() }
    catch (err) { setError(errorMessage(err)) }
  }

  const owner = details?.yourRole === 'OWNER'
  return <>
    <PageHeader eyebrow="SETTINGS" title="Household & settings" description="Everyone in a household shares the same pantry, recipes, plan and shopping list." />
    {error && <Notice onRetry={load}>{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    {!details && !error && <Spinner label="Loading settings…" />}

    {details && <div className="settings-grid">
      <HouseholdCard details={details} owner={owner} onSave={body => run(() => api.patch(`/households/${household.id}`, body), 'Household settings saved.', true)} />

      <section className="panel">
        <p className="eyebrow">MEMBERS</p><h2 className="panel-title">People in {details.name}</h2>
        <ul className="member-list">{details.members.map(m => <li key={m.id}>
          <span className="avatar" aria-hidden>{m.name[0]?.toUpperCase()}</span>
          <span className="account-text"><strong>{m.name}{m.id === user.id && ' (you)'}</strong><small>{m.email}</small></span>
          <Badge tone={m.role === 'OWNER' ? 'green' : 'grey'}>{m.role === 'OWNER' ? 'Owner' : 'Member'}</Badge>
          {owner && m.id !== user.id && <button className="icon-button" aria-label={`Remove ${m.name}`} title="Remove from household" onClick={() => window.confirm(`Remove ${m.name} from ${details.name}?`) && run(() => api.delete(`/households/${household.id}/members/${m.id}`), `${m.name} was removed.`)}><UserMinus size={16} /></button>}
        </li>)}</ul>
        <div className="invite-box">
          <h3>Invite family</h3>
          {details.inviteCode
            ? <>
                <p className="muted small">Share this code. They create an account, choose “Join with a code”, and enter it.</p>
                <div className="invite-code"><code>{details.inviteCode}</code>
                  <button className="icon-button" aria-label="Copy invite code" onClick={async () => { try { await navigator.clipboard.writeText(details.inviteCode!); setNotice('Invite code copied.') } catch { setError('Copy isn’t allowed here; select the code instead.') } }}><Copy size={16} /></button></div>
                {owner && <div className="panel-actions">
                  <button className="ghost-button" onClick={() => run(() => api.post(`/households/${household.id}/invite-code`), 'New invite code created. The old one no longer works.')}><RefreshCw size={14} aria-hidden />New code</button>
                  <button className="ghost-button" onClick={() => run(() => api.delete(`/households/${household.id}/invite-code`), 'Invites switched off.')}>Switch off invites</button>
                </div>}
              </>
            : owner
              ? <button className="secondary-button" onClick={() => run(() => api.post(`/households/${household.id}/invite-code`), 'Invite code created.')}>Create invite code</button>
              : <p className="muted small">Invites are switched off. Ask the household owner for a code.</p>}
        </div>
      </section>

      <ProfileCard name={user.name} email={user.email} hasPassword={user.hasPassword !== false} isDemo={user.isDemo === true} onSaveName={name => run(() => api.patch('/auth/me', { name }), 'Name updated.', true)}
        onChangePassword={(currentPassword, newPassword) => run(() => api.post('/auth/password', { currentPassword: currentPassword || undefined, newPassword }), user.hasPassword === false ? 'Password set. You can now also sign in with email.' : 'Password changed.', true)} />

      <section className="panel">
        <p className="eyebrow">AI ASSISTANT</p><h2 className="panel-title"><Sparkles size={16} aria-hidden className="inline-icon" />Kitchen assistant</h2>
        {ai?.configured
          ? <p className="muted">Connected to Google Gemini (<code>{ai.model}</code>). The assistant only reads your kitchen data and proposes changes; you confirm every change.</p>
          : <p className="muted">Not configured. Add <code>AI_API_KEY</code> to <code>server/.env</code> and restart the server. Everything else works without it.</p>}
        <button className="ghost-button" onClick={() => void signOut()}><LogOut size={15} aria-hidden />Sign out</button>
      </section>
    </div>}
  </>
}

function HouseholdCard({ details, owner, onSave }: { details: HouseholdDetails; owner: boolean; onSave: (body: object) => Promise<void> }) {
  const [name, setName] = useState(details.name)
  const [kitchen, setKitchen] = useState<KitchenSetup>({ appliances: details.appliances ?? [], usualCookMinutes: details.usualCookMinutes ?? null, cuisines: [], defaultServings: details.defaultServings })
  const [timezone, setTimezone] = useState(details.timezone)
  const submit = (event: FormEvent) => { event.preventDefault(); void onSave({ name, timezone, defaultServings: kitchen.defaultServings, appliances: kitchen.appliances, usualCookMinutes: kitchen.usualCookMinutes }) }
  const zones = TIMEZONES.includes(details.timezone) ? TIMEZONES : [details.timezone, ...TIMEZONES]
  return <section className="panel">
    <p className="eyebrow">HOUSEHOLD</p><h2 className="panel-title">Kitchen details</h2>
    {!owner && <p className="muted small">Only the owner can change these.</p>}
    <form className="stack-form tight" onSubmit={submit}>
      <Field label="Household name"><input value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={80} required disabled={!owner} /></Field>
      <KitchenFields value={kitchen} onChange={setKitchen} disabled={!owner} showCuisines={false} />
      <Field label="Timezone" hint="Decides when “today” starts for planning."><select value={timezone} onChange={e => setTimezone(e.target.value)} disabled={!owner}>{zones.map(z => <option key={z} value={z}>{z}</option>)}</select></Field>
      {owner && <button className="primary-button">Save household</button>}
    </form>
  </section>
}

function ProfileCard({ name, email, hasPassword, isDemo, onSaveName, onChangePassword }: { name: string; email: string; hasPassword: boolean; isDemo: boolean; onSaveName: (name: string) => Promise<void>; onChangePassword: (current: string, next: string) => Promise<void> }) {
  const [value, setValue] = useState(name)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  return <section className="panel">
    <p className="eyebrow">YOUR PROFILE</p><h2 className="panel-title">{email}</h2>
    <form className="stack-form tight" onSubmit={e => { e.preventDefault(); void onSaveName(value) }}>
      <Field label="Display name"><input value={value} onChange={e => setValue(e.target.value)} maxLength={80} required /></Field>
      <button className="secondary-button" disabled={value.trim() === name}>Save name</button>
    </form>
    {!isDemo && <form className="stack-form tight password-form" onSubmit={async e => { e.preventDefault(); await onChangePassword(current, next); setCurrent(''); setNext('') }}>
      <h3><KeyRound size={15} aria-hidden className="inline-icon" />{hasPassword ? 'Change password' : 'Set a password'}</h3>
      {hasPassword
        ? <Field label="Current password"><PasswordInput value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" required /></Field>
        : <p className="muted small">You signed up with Google. Add a password if you also want to sign in with email.</p>}
      <Field label="New password" hint="At least 10 characters."><PasswordInput value={next} onChange={e => setNext(e.target.value)} minLength={10} autoComplete="new-password" required /></Field>
      <button className="secondary-button">{hasPassword ? 'Change password' : 'Set password'}</button>
    </form>}
  </section>
}
