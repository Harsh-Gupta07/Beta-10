import type { Allergen, PersonNeeds } from '../../lib/api'
import { AGE_GROUPS, AGE_GROUP_LABEL, ALLERGENS, ALLERGEN_LABEL, DIET_HINT, DIET_LABEL, DIET_TYPES, HEALTH_GOALS, HEALTH_GOAL_LABEL, WEEKDAYS, WEEKDAY_LABEL } from '../../lib/food'

export const emptyNeeds: PersonNeeds = { ageGroup: null, dietType: null, allergens: [], healthGoals: [], weeklyFasts: [] }

const toggle = <T,>(list: T[], item: T) => list.includes(item) ? list.filter(x => x !== item) : [...list, item]

/** One person's card: age group, diet, allergies, health preference and weekly fasts, as tap-to-choose chips. */
export function PersonFields({ value, onChange, idPrefix }: { value: PersonNeeds; onChange: (next: PersonNeeds) => void; idPrefix: string }) {
  const chips = <T extends string>(legend: string, options: readonly T[], label: (o: T) => string, selected: T[] | T | null, pick: (o: T) => void, hint?: string) =>
    <fieldset className="chip-field">
      <legend className="field-label">{legend}</legend>
      <div className="chip-options">{options.map(o => {
        const on = Array.isArray(selected) ? selected.includes(o) : selected === o
        return <button type="button" key={o} className={`toggle-chip ${on ? 'active' : ''}`} aria-pressed={on} onClick={() => pick(o)}>{label(o)}</button>
      })}</div>
      {hint && <small className="muted">{hint}</small>}
    </fieldset>

  return <div className="person-fields" id={idPrefix}>
    {chips('Age group', AGE_GROUPS, a => AGE_GROUP_LABEL[a], value.ageGroup, a => onChange({ ...value, ageGroup: value.ageGroup === a ? null : a }))}
    {chips('Food', DIET_TYPES, d => DIET_LABEL[d], value.dietType, d => onChange({ ...value, dietType: value.dietType === d ? null : d }), value.dietType ? DIET_HINT[value.dietType] : 'Tap one, or leave it if they eat everything.')}
    {chips('Allergies', ALLERGENS, a => ALLERGEN_LABEL[a], value.allergens, (a: Allergen) => onChange({ ...value, allergens: toggle(value.allergens, a) }), 'Dishes with these are never suggested for the household.')}
    {chips('Health preference', HEALTH_GOALS, g => HEALTH_GOAL_LABEL[g], value.healthGoals, g => onChange({ ...value, healthGoals: toggle(value.healthGoals, g) }))}
    {chips('Weekly fast', WEEKDAYS, d => WEEKDAY_LABEL[d], value.weeklyFasts, d => onChange({ ...value, weeklyFasts: toggle(value.weeklyFasts, d) }), 'For example a Monday fast. Festival fasts like Ekadashi come later.')}
  </div>
}
