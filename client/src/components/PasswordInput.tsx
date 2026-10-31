import { useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/** A password field with a show/hide button. Accepts the usual input props (name, value, autoComplete…). */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return <span className="password-input">
    <input {...props} type={visible ? 'text' : 'password'} />
    <button type="button" className="password-toggle" onClick={() => setVisible(!visible)} aria-pressed={visible}
      aria-label={visible ? 'Hide password' : 'Show password'} title={visible ? 'Hide password' : 'Show password'}>
      {visible ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
    </button>
  </span>
}
