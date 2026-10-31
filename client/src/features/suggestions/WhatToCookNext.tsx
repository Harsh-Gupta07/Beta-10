import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type SuggestionsData } from '../../lib/api'
import { useSession } from '../../lib/session'
import { SuggestionCard } from './SuggestionCard'

/** Dashboard card: the top three ideas. Hidden if suggestions can't be loaded, so the dashboard still works. */
export function WhatToCookNext() {
  const { household } = useSession()
  const [data, setData] = useState<SuggestionsData | null>(null)
  useEffect(() => {
    api.get<SuggestionsData>(`/households/${household.id}/suggestions`, { params: { limit: 3 } }).then(r => setData(r.data)).catch(() => setData(null))
  }, [household.id])
  if (!data?.suggestions.length) return null
  return <section className="panel">
    <div className="panel-heading"><div><p className="eyebrow">IDEAS</p><h2>What to cook next</h2></div><Link to="/suggestions">More ideas</Link></div>
    <div className="suggestion-grid">{data.suggestions.map(s => <SuggestionCard key={s.recipe.id} suggestion={s} compact today={data.today} onChanged={() => undefined} />)}</div>
  </section>
}
