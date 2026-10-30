import { useEffect, useId, useRef, type ReactNode } from 'react'
import { CircleAlert, LoaderCircle, X, type LucideIcon } from 'lucide-react'

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-header">
    <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="muted">{description}</p>}</div>
    {actions && <div className="header-actions">{actions}</div>}
  </header>
}

export function Notice({ tone = 'error', children, onRetry }: { tone?: 'error' | 'success' | 'warning'; children: ReactNode; onRetry?: () => void }) {
  return <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
    {tone === 'error' && <CircleAlert size={16} aria-hidden />}<span>{children}</span>
    {onRetry && <button className="link-button" onClick={onRetry}>Try again</button>}
  </div>
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="loading-state" role="status"><LoaderCircle className="spin" size={20} aria-hidden /><span>{label}</span></div>
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={22} aria-hidden /></span><strong>{title}</strong>{children && <p>{children}</p>}{action}</div>
}

export function Badge({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'grey' | 'blue'; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; label: string }) {
  return <div className="segmented" role="radiogroup" aria-label={label}>
    {options.map(option => <button type="button" key={option.value} role="radio" aria-checked={value === option.value} className={value === option.value ? 'active' : ''} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>
}

/** Accessible dialog: traps initial focus, closes on Escape and backdrop click, and becomes a bottom sheet on phones. */
export function Modal({ title, subtitle, onClose, children, footer, wide }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first = panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.modal-close)')
    ;(first ?? panel.current)?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; previous?.focus() }
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={panel} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <div className="modal-head"><div><h2 id={titleId}>{title}</h2>{subtitle && <div className="modal-subtitle">{subtitle}</div>}</div><button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </div>
  </div>
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}
