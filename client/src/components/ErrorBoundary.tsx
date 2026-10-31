import { Component, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'

/**
 * Catches a page that fails to render, most often a page file from before a new release was deployed,
 * and offers a reload instead of leaving a blank screen. `resetKey` (the current path) clears it on navigation.
 */
export class ErrorBoundary extends Component<{ resetKey: string; children: ReactNode }, { failed: boolean; resetKey: string }> {
  state = { failed: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError() { return { failed: true } }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { failed: boolean; resetKey: string }) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey }
  }

  componentDidCatch(error: unknown) { console.error(error) }

  render() {
    if (!this.state.failed) return this.props.children
    return <div className="empty-state" role="alert">
      <span className="empty-icon"><CircleAlert size={22} aria-hidden /></span>
      <strong>This page couldn’t load</strong>
      <p>KitchenSync may have just been updated. Reloading usually fixes it, and nothing you saved is lost.</p>
      <button className="primary-button" onClick={() => window.location.reload()}>Reload</button>
    </div>
  }
}
