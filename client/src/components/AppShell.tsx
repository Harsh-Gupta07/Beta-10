import { useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { BookOpen, CalendarDays, House, LayoutDashboard, LogOut, Menu, Refrigerator, Settings, ShoppingCart, Sparkles, X, type LucideIcon } from 'lucide-react'
import { useSession } from '../lib/session'

type NavItem = { to: string; label: string; short: string; icon: LucideIcon; ready: boolean }

export const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, ready: true },
  { to: '/planner', label: 'Meal Planner', short: 'Plan', icon: CalendarDays, ready: true },
  { to: '/recipes', label: 'Recipes', short: 'Recipes', icon: BookOpen, ready: true },
  { to: '/pantry', label: 'Pantry', short: 'Pantry', icon: Refrigerator, ready: true },
  { to: '/shopping', label: 'Shopping List', short: 'Shop', icon: ShoppingCart, ready: false },
  { to: '/assistant', label: 'AI Assistant', short: 'Assistant', icon: Sparkles, ready: false },
  { to: '/settings', label: 'Household & Settings', short: 'Settings', icon: Settings, ready: false },
]

const mobileTabs = navItems.filter(item => ['/', '/planner', '/recipes', '/pantry', '/shopping'].includes(item.to))

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return <nav className="nav-links" aria-label="Main">
    {navItems.map(({ to, label, icon: Icon, ready }) => <NavLink key={to} to={to} end={to === '/'} onClick={onNavigate} className={({ isActive }) => isActive ? 'active' : ''}>
      <Icon size={17} aria-hidden /><span>{label}</span>{!ready && <small className="soon">Soon</small>}
    </NavLink>)}
  </nav>
}

export function Brand() {
  return <Link className="brand" to="/"><span className="brand-icon">k</span><span>kitchen<span className="brand-light">sync</span></span></Link>
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, household, signOut } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const account = <div className="account"><span className="avatar" aria-hidden>{user.name[0]?.toUpperCase()}</span><span className="account-text"><strong>{user.name}</strong><small>{user.email}</small></span><button className="icon-button" onClick={() => void signOut()} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button></div>

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <p className="household-chip"><House size={14} aria-hidden />{household.name}</p>
      <NavLinks />
      {account}
    </aside>

    <header className="mobile-top">
      <Brand />
      <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen}><Menu size={20} /></button>
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
