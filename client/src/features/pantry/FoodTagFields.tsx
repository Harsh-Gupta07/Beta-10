import type { Allergen, DietClass } from '../../lib/api'
import { ALLERGENS, ALLERGEN_LABEL, DIET_CLASS_LABEL } from '../../lib/food'
import { Field } from '../../components/ui'

export type FoodTags = { dietClass: DietClass | null; allergens: Allergen[]; allergensReviewed: boolean }
export const untagged: FoodTags = { dietClass: null, allergens: [], allergensReviewed: false }

/** Diet class and allergens for a household's own ingredient. Recipes use these to warn about allergies and diets. */
export function FoodTagFields({ value, onChange }: { value: FoodTags; onChange: (tags: FoodTags) => void }) {
  const toggle = (allergen: Allergen) => {
    const allergens = value.allergens.includes(allergen) ? value.allergens.filter(a => a !== allergen) : [...value.allergens, allergen]
    // Naming an allergen means someone looked at the label.
    onChange({ ...value, allergens, allergensReviewed: value.allergensReviewed || allergens.length > 0 })
  }
  return <>
    <Field label="What is it?" hint="Used to mark recipes veg, egg or non-veg.">
      <select value={value.dietClass ?? ''} onChange={e => onChange({ ...value, dietClass: (e.target.value || null) as DietClass | null })}>
        <option value="">Not sure</option>
        {(Object.keys(DIET_CLASS_LABEL) as DietClass[]).map(c => <option key={c} value={c}>{DIET_CLASS_LABEL[c]}</option>)}
      </select>
    </Field>
    <div className="full">
      <fieldset className="chip-field">
        <legend className="field-label">Contains allergens</legend>
        <div className="chip-options">{ALLERGENS.map(a => <button type="button" key={a} className={`toggle-chip ${value.allergens.includes(a) ? 'active' : ''}`} aria-pressed={value.allergens.includes(a)} onClick={() => toggle(a)}>{ALLERGEN_LABEL[a]}</button>)}</div>
      </fieldset>
      <label className="check-row">
        <input type="checkbox" checked={value.allergensReviewed} onChange={e => onChange({ ...value, allergensReviewed: e.target.checked })} />
        <span>I’ve checked the label{value.allergens.length ? '' : ' and it has none of these'}</span>
      </label>
      {!value.allergensReviewed && <p className="muted small">Until checked, recipes using it show “Check ingredients” for anyone with an allergy.</p>}
    </div>
  </>
}
