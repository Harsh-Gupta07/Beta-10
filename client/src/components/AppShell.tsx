import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Bell, BookOpen, CalendarDays, ClipboardCheck, Heart, House, LayoutDashboard, LogOut, Menu, Refrigerator, Settings, ShoppingCart, Sparkles, Sprout, X, type LucideIcon } from 'lucide-react'
import { api, type AppNotification } from '../lib/api'
import { useSession } from '../lib/session'
import { relativeTime } from '../lib/format'

type NavItem = { to: string; label: string; short: string; icon: LucideIcon }

export const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard },
  { to: '/planner', label: 'Meal Planner', short: 'Plan', icon: CalendarDays },
  { to: '/recipes', label: 'Recipes', short: 'Recipes', icon: BookOpen },
  { to: '/pantry', label: 'Pantry', short: 'Pantry', icon: Refrigerator },
  { to: '/shopping', label: 'Shopping List', short: 'Shop', icon: ShoppingCart },
  { to: '/verify', label: 'Quick Stock Check', short: 'Check', icon: ClipboardCheck },
  { to: '/assistant', label: 'Kitchen Assistant', short: 'Assistant', icon: Sparkles },
  { to: '/preferences', label: 'Food Preferences', short: 'Prefs', icon: Heart },
  { to: '/settings', label: 'Household & Settings', short: 'Settings', icon: Settings },
]

const mobileTabs = navItems.filter(item => ['/', '/planner', '/pantry', '/shopping', '/assistant'].includes(item.to))

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return <nav className="nav-links" aria-label="Main">
    {navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={onNavigate} className={({ isActive }) => isActive ? 'active' : ''}>
      <Icon size={17} aria-hidden /><span>{label}</span>
    </NavLink>)}
  </nav>
}

export function Brand() {
  return <Link className="brand" to="/"><span className="brand-icon"><Sprout size={20} strokeWidth={2.2} aria-hidden /></span><span>Kitchen<span className="brand-light">Sync</span></span></Link>
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, household, signOut } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const account = <div className="account"><span className="avatar" aria-hidden>{user.name[0]?.toUpperCase()}</span><span className="account-text"><strong>{user.name}</strong><small>{user.email}</small></span><button className="icon-button" onClick={() => void signOut()} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button></div>

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <p className="brand-promise">Plan meals around what is actually at home.</p>
      <div className="sidebar-row"><p className="household-chip"><House size={14} aria-hidden />{household.name}</p><NotificationBell /></div>
      <NavLinks />
      {account}
    </aside>

    <header className="mobile-top">
      <Brand />
      <span className="mobile-top-actions"><NotificationBell /><button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen}><Menu size={20} /></button></span>
    </header>
    {menuOpen && <div className="mobile-menu-backdrop" onClick={() => setMenuOpen(false)}>
      <div className="mobile-menu" onClick={event => event.stopPropagation()} role="dialog" aria-label="Menu">
        <div className="mobile-menu-head"><p className="household-chip"><House size={14} aria-hidden />{household.name}</p><button className="icon-button" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
        <NavLinks onNavigate={() => setMenuOpen(false)} />
        {account}
      </div>
    </div>}

    <main className="main-content">{children}</main>

    <nav className="mobile-nav" aria-label="Quick">
      {mobileTabs.map(({ to, short, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={19} aria-hidden /><span>{short}</span></NavLink>)}
    </nav>
  </div>
}

/** Household alerts, e.g. a stock correction that leaves a planned meal short. Refreshes on navigation. */
function NotificationBell() {
  const { household } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [data, setData] = useState<{ unread: number; items: AppNotification[] }>({ unread: 0, items: [] })
  const [open, setOpen] = useState(false)
  useEffect(() => {
    api.get(`/households/${household.id}/notifications`).then(r => setData(r.data)).catch(() => undefined)
  }, [household.id, location.pathname])
  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && data.unread) {
      await api.post(`/households/${household.id}/notifications/read`).catch(() => undefined)
      setData(prev => ({ ...prev, unread: 0 }))
    }
  }
  return <div className="bell">
    <button className="icon-button" onClick={toggle} aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`} aria-expanded={open}>
      <Bell size={18} />{data.unread > 0 && <span className="bell-count">{data.unread}</span>}
    </button>
    {open && <div className="bell-panel" role="dialog" aria-label="Notifications">
      <div className="bell-head"><strong>Notifications</strong><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close"><X size={15} /></button></div>
      {data.items.length ? <ul>{data.items.map(n => <li key={n.id}>
        <button onClick={() => { setOpen(false); if (n.link) navigate(n.link) }}>
          <strong>{n.title}</strong><span>{n.body}</span><small>{relativeTime(n.createdAt)}</small>
        </button>
      </li>)}</ul> : <p className="muted small">No notifications yet. You will see one here when a stock change affects a planned meal.</p>}
    </div>}
  </div>
}
