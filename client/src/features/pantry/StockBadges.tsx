import type { PantryItem } from '../../lib/api'
import { confidenceLabel, formatDate } from '../../lib/format'
import { Badge } from '../../components/ui'

const confidenceTone = { CONFIRMED: 'green', ESTIMATED: 'grey', CHECK_NEEDED: 'amber' } as const

export function StockBadges({ item }: { item: PantryItem }) {
  return <span className="badge-row">
    {item.status === 'OUT' && <Badge tone="red">Out of stock</Badge>}
    {item.status === 'LOW' && <Badge tone="amber">Low</Badge>}
    <Badge tone={confidenceTone[item.confidence]}>{confidenceLabel[item.confidence]}</Badge>
    {item.expiry === 'EXPIRED' && <Badge tone="red">Expired {formatDate(item.expiresAt)}</Badge>}
    {item.expiry === 'SOON' && <Badge tone="amber">Expires {formatDate(item.expiresAt)}</Badge>}
  </span>
}
