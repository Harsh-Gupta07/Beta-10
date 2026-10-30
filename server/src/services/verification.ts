import { listPantry } from './pantry.js'
import { getStockPositions } from './planner.js'
import { describeQuantity } from './units.js'

const DAY = 24 * 60 * 60 * 1000

/**
 * Ranks pantry items worth a physical check. Uncertain quantities that upcoming meals depend on come
 * first, because a wrong number there silently breaks the plan. Each item carries plain-language reasons.
 */
export async function getVerificationQueue(householdId: string, now = new Date()) {
  const [items, positions] = await Promise.all([listPantry(householdId), getStockPositions(householdId)])
  const byIngredient = new Map(positions.map(p => [p.ingredient.id, p]))

  const queue = items.map(item => {
    const reasons: string[] = []
    let score = 0
    const position = byIngredient.get(item.ingredient.id)
    const daysSinceCheck = item.lastVerifiedAt ? Math.floor((now.getTime() - new Date(item.lastVerifiedAt).getTime()) / DAY) : null

    if (item.confidence === 'CHECK_NEEDED') { score += 40; reasons.push('Marked as needing a check') }
    else if (item.confidence === 'ESTIMATED') { score += 20; reasons.push('Amount is an estimate') }
    if (daysSinceCheck === null) { score += 10; reasons.push('Never checked') }
    else if (daysSinceCheck >= 7) { score += Math.min(15, daysSinceCheck); reasons.push(`Last checked ${daysSinceCheck} days ago`) }
    if (item.expiry === 'EXPIRED') { score += 25; reasons.push('Past its expiry date') }
    else if (item.expiry === 'SOON') { score += 8; reasons.push('Expires soon') }
    if (position) {
      score += Math.min(40, position.neededBy * 12)
      reasons.push(`Needed for ${position.neededBy} upcoming meal${position.neededBy === 1 ? '' : 's'}`)
      if (position.shortage !== '0') { score += 15; reasons.push(`Short ${describeQuantity(position.shortage, position.unit)}; a check may show you have more`) }
    }
    // A confirmed amount that no meal depends on isn't worth interrupting anyone for.
    const worthChecking = item.confidence !== 'CONFIRMED' || item.expiry === 'EXPIRED' || (position && (daysSinceCheck === null || daysSinceCheck >= 3))
    return { item, reasons, score, neededBy: position?.neededBy ?? 0, priority: score >= 60 ? 'HIGH' as const : score >= 35 ? 'MEDIUM' as const : 'LOW' as const, worthChecking }
  })

  return queue.filter(q => q.worthChecking && q.score >= 20)
    .sort((a, b) => b.score - a.score || a.item.ingredient.name.localeCompare(b.item.ingredient.name))
    .map(({ worthChecking: _, ...rest }) => rest)
}
