import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Check, PackagePlus, SendHorizontal, ShoppingCart, Sparkles, X } from 'lucide-react'
import { api, errorMessage, type AssistantAction, type AssistantReply, type RecipeDetail, type RecipeDraft } from '../../lib/api'
import { useSession } from '../../lib/session'
import { Badge, Notice, PageHeader } from '../../components/ui'
import { RecipeForm } from '../recipes/RecipeForm'

type Message = { id: string; role: 'user' | 'assistant'; text: string; mode?: 'ai' | 'fallback'; googleSearch?: AssistantReply['googleSearch']; sources?: AssistantReply['sources']; actions?: AssistantAction[] }
type AssistantStatus = { configured: boolean; model: string | null; searchModel: string | null }
type ActionState = 'pending' | 'busy' | 'done' | 'dismissed'

const SUGGESTIONS = ['What can I cook today?', 'Suggest dinner using potatoes and paneer.', 'Add two packets of milk to my inventory.', 'How much rice do I need for five people?', 'Why is my dinner showing a shortage?']

export function AssistantPage() {
  const { household } = useSession()
  const navigate = useNavigate()
  const [status, setStatus] = useState<AssistantStatus | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [actionState, setActionState] = useState<Record<string, ActionState>>({})
  const [actionNote, setActionNote] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<{ actionId: string; recipe: RecipeDraft } | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => { api.get<AssistantStatus>(`/households/${household.id}/assistant`).then(r => setStatus(r.data)).catch(() => setStatus({ configured: false, model: null, searchModel: null })) }, [household.id])
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, busy])

  async function send(text: string) {
    const message = text.trim()
    if (!message || busy) return
    setError(''); setInput('')
    const history = messages.slice(-10).map(m => ({ role: m.role, text: m.text }))
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text: message }])
    setBusy(true)
    try {
      const { data } = await api.post<AssistantReply>(`/households/${household.id}/assistant/messages`, { message, history })
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: data.reply, mode: data.mode, googleSearch: data.googleSearch, sources: data.sources, actions: data.actions }])
    } catch (err) { setError(errorMessage(err, 'The assistant could not answer.')) }
    finally { setBusy(false) }
  }

  async function confirm(action: AssistantAction) {
    if (action.type === 'RECIPE_DRAFT') { setDraft({ actionId: action.id, recipe: action.draft }); return }
    setActionState(prev => ({ ...prev, [action.id]: 'busy' }))
    try {
      if (action.type === 'ADD_STOCK') {
        // The action id doubles as the idempotency key, so a double click can't add stock twice.
        await api.post(`/households/${household.id}/pantry/receive`, { ingredientId: action.ingredientId, quantity: action.quantity, unit: action.unit, note: 'Added via assistant', idempotencyKey: action.id })
        setActionNote(prev => ({ ...prev, [action.id]: 'Added to your pantry.' }))
      } else {
        for (const item of action.items) await api.post(`/households/${household.id}/shopping/items`, { ingredientId: item.ingredientId, quantity: item.quantity, unit: item.unit, source: 'ASSISTANT' })
        setActionNote(prev => ({ ...prev, [action.id]: 'Added to your shopping list.' }))
      }
      setActionState(prev => ({ ...prev, [action.id]: 'done' }))
    } catch (err) {
      setActionState(prev => ({ ...prev, [action.id]: 'pending' }))
      setActionNote(prev => ({ ...prev, [action.id]: errorMessage(err) }))
    }
  }

  const submit = (event: FormEvent) => { event.preventDefault(); void send(input) }

  return <div className="assistant-page">
    <PageHeader eyebrow="AI ASSISTANT" title="Kitchen assistant" description="Ask in plain language. Gemini can search Google for current answers and show its sources. Kitchen facts come from your real pantry, recipes and plan, and nothing changes until you confirm."
      actions={status && <Badge tone={status.configured ? 'green' : 'grey'}>{status.configured ? 'Google AI configured' : 'Offline mode'}</Badge>} />
    {status && !status.configured && <Notice tone="warning">The AI assistant isn’t switched on yet, so you’ll get simpler built-in answers. Everything else in KitchenSync works as usual.</Notice>}

    <section className="chat panel" aria-live="polite">
      {!messages.length && <div className="chat-empty">
        <span className="empty-icon"><Sparkles size={22} aria-hidden /></span>
        <strong>How can I help in the kitchen?</strong>
        <div className="suggestion-chips">{SUGGESTIONS.map(s => <button key={s} className="toggle-chip" onClick={() => void send(s)}>{s}</button>)}</div>
      </div>}

      {messages.map(m => <div key={m.id} className={`bubble-row ${m.role}`}>
        <div className={`bubble ${m.role}`}>
          {m.role === 'assistant' && m.mode === 'fallback' && <Badge tone="grey">Offline answer</Badge>}
          {m.role === 'assistant' && m.googleSearch === 'grounded' && <Badge tone="green">Google Search grounded</Badge>}
          {m.role === 'assistant' && m.googleSearch === 'uncited' && <Badge tone="amber">Google Search returned no citations</Badge>}
          {m.role === 'assistant' && m.googleSearch === 'not-used' && <Badge tone="grey">Google Search not used</Badge>}
          {m.role === 'assistant' && m.googleSearch === 'unavailable' && <Badge tone="amber">Google Search unavailable</Badge>}
          {m.role === 'assistant' && m.googleSearch === 'not-configured' && <Badge tone="grey">Google Search not configured</Badge>}
          <FormattedText text={m.text} />
          {!!m.sources?.length && <div className="assistant-sources">
            <strong>Sources</strong>
            <ul>{m.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>
          </div>}
          {m.actions?.map(action => {
            const state = actionState[action.id] ?? 'pending'
            if (state === 'dismissed') return null
            const Icon = action.type === 'ADD_STOCK' ? PackagePlus : action.type === 'ADD_TO_SHOPPING' ? ShoppingCart : BookOpen
            return <div key={action.id} className={`action-card ${state}`}>
              <Icon size={18} aria-hidden />
              <div className="action-body">
                <strong>{action.summary}</strong>
                {action.type === 'ADD_TO_SHOPPING' && <small>{action.items.map(i => `${i.quantity} ${i.unit === 'l' ? 'L' : i.unit} ${i.ingredientName}`).join(', ')}</small>}
                {action.type === 'RECIPE_DRAFT' && <small>{action.draft.ingredients.length} ingredients matched{action.draft.unresolved.length ? `; not in catalog: ${action.draft.unresolved.join(', ')}` : ''}</small>}
                {actionNote[action.id] && <small className={state === 'done' ? 'ok-text' : 'error-text'}>{actionNote[action.id]}</small>}
              </div>
              {state !== 'done' && <div className="action-buttons">
                <button className="primary-button small-button" disabled={state === 'busy'} onClick={() => void confirm(action)}><Check size={14} aria-hidden />{action.type === 'RECIPE_DRAFT' ? 'Review & save' : state === 'busy' ? 'Saving…' : 'Confirm'}</button>
                <button className="icon-button" aria-label="Dismiss" onClick={() => setActionState(prev => ({ ...prev, [action.id]: 'dismissed' }))}><X size={15} /></button>
              </div>}
            </div>
          })}
        </div>
      </div>)}
      {busy && <div className="bubble-row assistant"><div className="bubble assistant typing"><span /><span /><span /></div></div>}
      <div ref={bottom} />
    </section>

    {error && <Notice>{error}</Notice>}
    <form className="chat-input" onSubmit={submit}>
      <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about cooking, stock or your plan…" maxLength={1000} aria-label="Message" disabled={busy} />
      <button className="primary-button" disabled={busy || !input.trim()} aria-label="Send"><SendHorizontal size={17} /></button>
    </form>

    {draft && <RecipeForm draft={draft.recipe} categories={[]} onClose={() => setDraft(null)} onSaved={(recipe: RecipeDetail) => {
      setActionState(prev => ({ ...prev, [draft.actionId]: 'done' }))
      setActionNote(prev => ({ ...prev, [draft.actionId]: 'Saved to your recipes.' }))
      setDraft(null); navigate(`/recipes/${recipe.id}`)
    }} />}
  </div>
}

/** Renders the assistant's light markdown (bold, bullets, paragraphs) without injecting HTML. */
function FormattedText({ text }: { text: string }) {
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part)
  const blocks = text.split(/\n{2,}/)
  return <>{blocks.map((block, i) => {
    const lines = block.split('\n').filter(Boolean)
    if (lines.length && lines.every(l => /^\s*([*•-]|\d+\.)\s+/.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([*•-]|\d+\.)\s+/, ''))}</li>)}</ul>
    return <p key={i}>{lines.map((l, j) => <span key={j}>{inline(l.replace(/^\s*[*•-]\s+/, '• '))}{j < lines.length - 1 && <br />}</span>)}</p>
  })}</>
}
