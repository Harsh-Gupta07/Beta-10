import { Minus, Plus } from 'lucide-react'
import type { Appliance } from '../../lib/api'
import { APPLIANCES, APPLIANCE_LABEL, COOK_TIMES, CUISINE_OPTIONS } from '../../lib/food'

export type KitchenSetup = { appliances: Appliance[]; usualCookMinutes: number | null; cuisines: string[]; defaultServings: number }

const toggle = <T,>(list: T[], item: T) => list.includes(item) ? list.filter(x => x !== item) : [...list, item]

/** Equipment, usual cooking time, cuisines and servings, as tap-to-choose chips. */
export function KitchenFields({ value, onChange, disabled, showCuisines = true }: { value: KitchenSetup; onChange: (next: KitchenSetup) => void; disabled?: boolean; showCuisines?: boolean }) {
  const chip = (key: string, label: string, on: boolean, pick: () => void) =>
    <button type="button" key={key} className={`toggle-chip ${on ? 'active' : ''}`} aria-pressed={on} onClick={pick} disabled={disabled}>{label}</button>
  const extraCuisines = value.cuisines.filter(c => !(CUISINE_OPTIONS as readonly string[]).includes(c))

  return <div className="person-fields">
    <fieldset className="chip-field">
      <legend className="field-label">What do you cook with?</legend>
      <div className="chip-options">{APPLIANCES.map(a => chip(a, APPLIANCE_LABEL[a], value.appliances.includes(a), () => onChange({ ...value, appliances: toggle(value.appliances, a) })))}</div>
    </fieldset>
    <fieldset className="chip-field">
      <legend className="field-label">On a normal day, how long do you have to cook a meal?</legend>
      <div className="chip-options">{COOK_TIMES.map(m => chip(String(m), m === 90 ? '90 min+' : `${m} min`, value.usualCookMinutes === m, () => onChange({ ...value, usualCookMinutes: value.usualCookMinutes === m ? null : m })))}</div>
      <small className="muted">Longer dishes still appear in ideas, just a little lower.</small>
    </fieldset>
    {showCuisines && <fieldset className="chip-field">
      <legend className="field-label">Cuisines you cook most</legend>
      <div className="chip-options">{[...CUISINE_OPTIONS, ...extraCuisines].map(c => chip(c, c, value.cuisines.includes(c), () => onChange({ ...value, cuisines: toggle(value.cuisines, c) })))}</div>
    </fieldset>}
    <div>
      <div className="field-label">Usual servings per meal</div>
      <div className="big-stepper" role="group" aria-label="Usual servings">
        <button type="button" className="icon-button" onClick={() => onChange({ ...value, defaultServings: Math.max(1, value.defaultServings - 1) })} disabled={disabled || value.defaultServings <= 1} aria-label="Fewer servings"><Minus size={18} /></button>
        <span aria-live="polite"><strong>{value.defaultServings}</strong> servings</span>
        <button type="button" className="icon-button" onClick={() => onChange({ ...value, defaultServings: Math.min(20, value.defaultServings + 1) })} disabled={disabled || value.defaultServings >= 20} aria-label="More servings"><Plus size={18} /></button>
      </div>
    </div>
  </div>
}
