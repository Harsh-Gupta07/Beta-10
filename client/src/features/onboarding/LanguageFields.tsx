import { Minus, Plus } from 'lucide-react'
import type { AppLanguage } from '../../lib/api'

export type LanguageSetup = {
  language: AppLanguage
  voiceLanguage: 'en-IN' | 'hi-IN'
  katoriMl: number
  chammachMl: number
  mutthiGrams: number
}

const LANGUAGES: Array<[AppLanguage, string, string]> = [['EN', 'English', 'Simple English'], ['HI', 'हिन्दी', 'Hindi in Devanagari'], ['HINGLISH', 'Hinglish', '“Aaj dal bana lo”']]
const VOICES: Array<['en-IN' | 'hi-IN', string]> = [['en-IN', 'English (India)'], ['hi-IN', 'हिन्दी / Hindi']]

/** Language for replies and voice, plus the household's own katori, chammach and mutthi. */
export function LanguageFields({ value, onChange, measuresEditable = true, showLanguage = true }: { value: LanguageSetup; onChange: (next: LanguageSetup) => void; measuresEditable?: boolean; showLanguage?: boolean }) {
  const stepper = (label: string, hint: string, key: 'katoriMl' | 'chammachMl' | 'mutthiGrams', unit: string, step: number, min: number, max: number) =>
    <div className="measure-row">
      <span className="measure-text"><strong>{label}</strong><small>{hint}</small></span>
      <span className="measure-stepper" role="group" aria-label={label}>
        <button type="button" className="icon-button" disabled={!measuresEditable || value[key] <= min} onClick={() => onChange({ ...value, [key]: Math.max(min, value[key] - step) })} aria-label={`Smaller ${label}`}><Minus size={16} /></button>
        <span aria-live="polite">≈ <strong>{value[key]}</strong> {unit}</span>
        <button type="button" className="icon-button" disabled={!measuresEditable || value[key] >= max} onClick={() => onChange({ ...value, [key]: Math.min(max, value[key] + step) })} aria-label={`Bigger ${label}`}><Plus size={16} /></button>
      </span>
    </div>

  return <div className="person-fields">
    {showLanguage && <>
      <fieldset className="chip-field">
        <legend className="field-label">Language for the kitchen assistant</legend>
        <div className="chip-options">{LANGUAGES.map(([code, label, hint]) => <button type="button" key={code} className={`toggle-chip ${value.language === code ? 'active' : ''}`}
          aria-pressed={value.language === code} onClick={() => onChange({ ...value, language: code })} title={hint}>{label}</button>)}</div>
        <small className="muted">The assistant replies in this language. Translating every screen is coming later.</small>
      </fieldset>
      <fieldset className="chip-field">
        <legend className="field-label">Language you’ll speak in voice notes</legend>
        <div className="chip-options">{VOICES.map(([code, label]) => <button type="button" key={code} className={`toggle-chip ${value.voiceLanguage === code ? 'active' : ''}`}
          aria-pressed={value.voiceLanguage === code} onClick={() => onChange({ ...value, voiceLanguage: code })}>{label}</button>)}</div>
      </fieldset>
    </>}
    <fieldset className="chip-field">
      <legend className="field-label">Your kitchen’s measures</legend>
      <small className="muted">How big are yours? Pour water from your katori and spoon into a measuring cup once if you can. These are always treated as approximate.</small>
      <div className="measure-list">
        {stepper('1 katori', 'small bowl, for milk, oil, water', 'katoriMl', 'ml', 10, 50, 500)}
        {stepper('1 chammach', 'serving spoon', 'chammachMl', 'ml', 1, 2, 30)}
        {stepper('1 mutthi', 'a handful, for dal, rice, atta', 'mutthiGrams', 'g', 5, 10, 150)}
      </div>
      {!measuresEditable && <small className="muted">Only the household owner can change the measures.</small>}
    </fieldset>
  </div>
}
