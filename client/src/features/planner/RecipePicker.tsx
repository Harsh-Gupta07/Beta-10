import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { RecipeSummary } from '../../lib/api'
import { Badge } from '../../components/ui'

/** Searchable recipe list; readiness reflects the pantry at the household's usual servings. */
export function RecipePicker({ recipes, selectedId, onSelect }: { recipes: RecipeSummary[]; selectedId?: string; onSelect: (recipe: RecipeSummary) => void }) {
  const [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return recipes.filter(r => !q || r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
      .sort((a, b) => a.missingCount - b.missingCount || a.name.localeCompare(b.name))
  }, [recipes, query])
  return <div className="recipe-picker">
    <label className="search-box"><Search size={16} aria-hidden /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search recipes" aria-label="Search recipes" autoFocus /></label>
    <div className="picker-list tall" role="listbox" aria-label="Recipes">
      {visible.map(r => <button type="button" role="option" aria-selected={r.id === selectedId} key={r.id} className={r.id === selectedId ? 'selected' : ''} onClick={() => onSelect(r)}>
        <span><strong>{r.name}</strong><small>{r.category} · {r.prepMinutes + r.cookMinutes} min</small></span>
        {r.missingCount === 0 ? <Badge tone="green">Ready</Badge> : <Badge tone="grey">{r.missingCount} missing</Badge>}
      </button>)}
      {!visible.length && <p className="picker-empty">No recipes match “{query}”.</p>}
    </div>
  </div>
}
