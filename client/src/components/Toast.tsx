import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'

// Short confirmations of what just changed ("Rice added to your pantry"), shown at the bottom of the screen.
// The rest of the household hears about the same change through the notification bell.

type Tone = 'success' | 'error' | 'info'
type Item = { id: number; tone: Tone; text: string }
type Toast = { success: (text: string) => void; error: (text: string) => void; info: (text: string) => void }

const ToastContext = createContext<Toast | null>(null)
const LIFETIME: Record<Tone, number> = { success: 4500, info: 4500, error: 8000 }
const MAX_VISIBLE = 3

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const nextId = useRef(1)
  const dismiss = useCallback((id: number) => setItems(prev => prev.filter(item => item.id !== id)), [])
  const show = useCallback((tone: Tone, text: string) => {
    const id = nextId.current++
    // The same message twice in a row (e.g. a double tap) shows once.
    setItems(prev => prev.at(-1)?.text === text ? prev : [...prev, { id, tone, text }].slice(-MAX_VISIBLE))
    setTimeout(() => dismiss(id), LIFETIME[tone])
  }, [dismiss])
  const toast = useMemo<Toast>(() => ({ success: text => show('success', text), error: text => show('error', text), info: text => show('info', text) }), [show])

  return <ToastContext.Provider value={toast}>
    {children}
    <div className="toast-region" aria-live="polite">
      {items.map(item => {
        const Icon = item.tone === 'success' ? CircleCheck : item.tone === 'error' ? CircleAlert : Info
        return <div key={item.id} className={`toast ${item.tone}`} role={item.tone === 'error' ? 'alert' : 'status'}>
          <Icon size={17} aria-hidden /><span>{item.text}</span>
          <button className="toast-close" onClick={() => dismiss(item.id)} aria-label="Dismiss"><X size={15} /></button>
        </div>
      })}
    </div>
  </ToastContext.Provider>
}

/** Confirms a change to the person who made it. Use for every save, add, remove and status change. */
export function useToast(): Toast {
  const toast = useContext(ToastContext)
  if (!toast) throw new Error('useToast must be used inside <ToastProvider>.')
  return toast
}
