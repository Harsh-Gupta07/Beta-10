import { Link } from 'react-router-dom'
import { CalendarDays, ChefHat, ClipboardCheck, ShoppingCart, type LucideIcon } from 'lucide-react'
import type { Dashboard, KitchenRole } from '../../lib/api'
import { slotLabel } from '../../lib/format'

type Task = { icon: LucideIcon; title: string; detail: string; to: string; action: string; urgent: boolean }

/** The jobs this person picked (plan, cook, shop, check stock), each with what needs doing today. */
export function TodayForYou({ roles, data }: { roles: KitchenRole[]; data: Dashboard }) {
  if (!roles.length) return null
  const cooking = data.todayMeals.filter(m => m.status === 'PLANNED' || m.status === 'COOKING')
  const tasks: Record<KitchenRole, Task> = {
    COOK: {
      icon: ChefHat, title: 'Cook today', to: '/planner', action: cooking.length ? 'Start cooking' : 'Open planner', urgent: cooking.length > 0,
      detail: cooking.length ? cooking.map(m => `${slotLabel[m.slot]}: ${m.recipe.name}`).join(' · ') : 'Nothing left to cook today.',
    },
    SHOPPER: {
      icon: ShoppingCart, title: 'Groceries', to: '/shopping', action: 'Open list', urgent: data.shoppingCount > 0,
      detail: data.shoppingCount ? `${data.shoppingCount} item${data.shoppingCount === 1 ? '' : 's'} to buy.` : 'The list is clear.',
    },
    STOCK_CHECKER: {
      icon: ClipboardCheck, title: 'Check stock', to: '/verify', action: 'Start check', urgent: data.needsCheck > 0,
      detail: data.needsCheck ? `${data.needsCheck} item${data.needsCheck === 1 ? ' needs' : 's need'} a quick check.` : 'Stock looks accurate.',
    },
    PLANNER: {
      icon: CalendarDays, title: 'Plan meals', to: '/planner', action: 'Plan the week', urgent: data.shortages.length > 0 || data.upcomingMeals.length === 0,
      detail: data.shortages.length ? `${data.shortages.length} ingredient${data.shortages.length === 1 ? ' is' : 's are'} short for planned meals.`
        : data.upcomingMeals.length ? `${data.upcomingMeals.length} meal${data.upcomingMeals.length === 1 ? '' : 's'} planned ahead.` : 'No meals planned yet.',
    },
  }
  const order: KitchenRole[] = ['COOK', 'SHOPPER', 'STOCK_CHECKER', 'PLANNER']
  return <section className="panel today-for-you" aria-labelledby="today-for-you">
    <div className="panel-heading"><div><p className="eyebrow">YOUR JOBS</p><h2 id="today-for-you">Today for you</h2></div><Link to="/settings">Change jobs</Link></div>
    <div className="task-grid">{order.filter(r => roles.includes(r)).map(role => {
      const { icon: Icon, title, detail, to, action, urgent } = tasks[role]
      return <Link key={role} to={to} className={`task-card ${urgent ? 'urgent' : ''}`}>
        <span className="task-icon"><Icon size={18} aria-hidden /></span>
        <span className="task-text"><strong>{title}</strong><small>{detail}</small></span>
        <span className="task-action">{action} →</span>
      </Link>
    })}</div>
  </section>
}
