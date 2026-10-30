import type { Shortage } from '../../lib/api'
import { formatQuantity, relativeDay, slotLabel } from '../../lib/format'

/** Upcoming shortages, earliest affected meal first. */
export function ShortageList({ shortages, today, limit, onSelectMeal }: { shortages: Shortage[]; today: string; limit?: number; onSelectMeal?: (mealId: string) => void }) {
  const shown = limit ? shortages.slice(0, limit) : shortages
  return <ul className="shortage-list">
    {shown.map(s => {
      const when = `${relativeDay(s.firstAffected.date, today)} ${slotLabel[s.firstAffected.slot].toLowerCase()}`
      return <li key={s.ingredient.id}>
        <span className="shortage-main">
          <strong>{s.ingredient.name}</strong>
          <small>Have {formatQuantity(s.onHand, s.unit)} · need {formatQuantity(s.required, s.unit)} across {s.neededBy} meal{s.neededBy === 1 ? '' : 's'}</small>
        </span>
        <span className="shortage-side">
          <span className="shortage-qty">Short {formatQuantity(s.shortage, s.unit)}</span>
          {onSelectMeal
            ? <button className="link-button small" onClick={() => onSelectMeal(s.firstAffected.mealId)}>From {when} · {s.firstAffected.recipeName}</button>
            : <small>From {when} · {s.firstAffected.recipeName}</small>}
        </span>
      </li>
    })}
  </ul>
}
