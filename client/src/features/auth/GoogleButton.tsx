import { useEffect, useRef, useState } from 'react'

// Google Identity Services: Google draws its own button and hands us a signed ID token, which the server verifies.
type GoogleId = {
  initialize: (options: { client_id: string; callback: (response: { credential: string }) => void; ux_mode: 'popup'; context: 'signin' }) => void
  renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void
}
declare global { interface Window { google?: { accounts: { id: GoogleId } } } }

let loading: Promise<void> | null = null
function loadGoogleScript() {
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => { loading = null; reject(new Error('Google sign-in could not load')) }
    document.head.appendChild(script)
  })
  return loading
}

export function GoogleButton({ clientId, onCredential }: { clientId: string; onCredential: (credential: string) => void }) {
  const slot = useRef<HTMLDivElement>(null)
  const callback = useRef(onCredential)
  callback.current = onCredential
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadGoogleScript().then(() => {
      const google = window.google?.accounts.id
      if (cancelled || !slot.current || !google) return
      google.initialize({ client_id: clientId, callback: response => callback.current(response.credential), ux_mode: 'popup', context: 'signin' })
      google.renderButton(slot.current, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', logo_alignment: 'center', width: Math.min(400, Math.max(220, slot.current.offsetWidth)) })
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [clientId])

  if (failed) return <p className="muted small">Google sign-in couldn’t load. Check your connection, or use email or the demo.</p>
  return <div ref={slot} className="google-button-slot" />
}
