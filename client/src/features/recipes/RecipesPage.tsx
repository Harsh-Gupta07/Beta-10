import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BookOpen, Clock, Plus, Search, SearchX, Users } from 'lucide-react'
import { api, errorMessage, type RecipeSummary } from '../../lib/api'
import { useSession } from '../../lib/session'
import { Badge, EmptyState, Notice, PageHeader, Segmented, Spinner } from '../../components/ui'
import { RecipeForm } from './RecipeForm'
import { DietBadge, SafetyBadge } from './RecipeSafety'

export function RecipesPage() {
  const { household } = useSession()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<{ servings: number; recipes: RecipeSummary[] } | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [readyOnly, setReadyOnly] = useState(false)
  const [safeOnly, setSafeOnly] = useState(false)
  const creating = params.get('new') === '1'

  const load = useCallback(async () => {
    setError('')
    try { setData((await api.get(`/households/${household.id}/recipes`)).data) }
    catch (err) { setError(errorMessage(err, 'Recipes could not be loaded.')) }
  }, [household.id])
  useEffect(() => { void load() }, [load])

  const recipes = data?.recipes
  const categories = useMemo(() => [...new Set((recipes ?? []).map(r => r.category))].sort(), [recipes])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (recipes ?? []).filter(r => (category === 'all' || r.category === category) && (!readyOnly || r.missingCount === 0) && (!safeOnly || r.safety.status === 'SUITABLE')
      && (!q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) || r.cuisine.toLowerCase().includes(q) || r.tags.some(t => t.includes(q))))
  }, [recipes, search, category, readyOnly, safeOnly])
  const readyCount = (recipes ?? []).filter(r => r.missingCount === 0).length
  const safeCount = (recipes ?? []).filter(r => r.safety.status === 'SUITABLE').length
  const closeForm = () => setParams(prev => { const next = new URLSearchParams(prev); next.delete('new'); return next }, { replace: true })

  return <>
    <PageHeader eyebrow="RECIPES" title="Recipe library" description={`Indian home recipes with structured ingredients. Pantry checks use your usual ${data?.servings ?? household.defaultServings} servings.`}
      actions={<button className="primary-button" onClick={() => setParams({ new: '1' })}><Plus size={16} aria-hidden />New recipe</button>} />

    {error && <Notice onRetry={load}>{error}</Notice>}
    {!data && !error && <Spinner label="Loading recipes…" />}

    {recipes && <>
      <section className="toolbar">
        <label className="search-box"><Search size={16} aria-hidden /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search recipes" aria-label="Search recipes" /></label>
        <div className="category-scroll"><Segmented label="Category" value={category} onChange={setCategory} options={[{ value: 'all', label: 'All' }, ...categories.map(c => ({ value: c, label: c }))]} /></div>
        <button className={`toggle-chip ${readyOnly ? 'active' : ''}`} aria-pressed={readyOnly} onClick={() => setReadyOnly(!readyOnly)}>Ready to cook <span>{readyCount}</span></button>
        <button className={`toggle-chip ${safeOnly ? 'active' : ''}`} aria-pressed={safeOnly} onClick={() => setSafeOnly(!safeOnly)} title="Hides dishes that clash with anyone’s allergies or diet, or that have unchecked ingredients">Safe for everyone <span>{safeCount}</span></button>
      </section>

      {visible.length === 0
        ? <section className="panel"><EmptyState icon={recipes.length ? SearchX : BookOpen} title={recipes.length ? 'No recipes match' : 'No recipes yet'}
            action={recipes.length ? <button className="secondary-button" onClick={() => { setSearch(''); setCategory('all'); setReadyOnly(false); setSafeOnly(false) }}>Clear filters</button> : undefined}>
            {readyOnly ? 'Nothing can be cooked entirely from your pantry right now. Add stock or turn off “Ready to cook”.'
              : safeOnly ? 'No dish suits everyone’s stated needs with fully checked ingredients. Turn off “Safe for everyone” to see warnings.'
              : 'Try a different search or category.'}
          </EmptyState></section>
        : <section className="recipe-grid">{visible.map(recipe => <Link key={recipe.id} to={`/recipes/${recipe.id}`} className="recipe-card">
            <div className="recipe-card-top"><span className="eyebrow">{recipe.category}</span>{recipe.custom && <Badge tone="blue">Yours</Badge>}</div>
            <h2>{recipe.name}</h2>
            <p>{recipe.description || 'No description.'}</p>
            <div className="recipe-meta">
              <span><Clock size={14} aria-hidden />{recipe.prepMinutes + recipe.cookMinutes} min</span>
              <span><Users size={14} aria-hidden />Serves {recipe.baseServings}</span>
              <span>{recipe.ingredientCount} ingredients</span>
              {recipe.cuisine && <span>{recipe.cuisine}</span>}
            </div>
            <div className="badge-row">
              {recipe.missingCount === 0 ? <Badge tone="green">Ready to cook</Badge> : <Badge tone="amber">Missing {recipe.missingCount} of {recipe.ingredientCount}</Badge>}
              <DietBadge recipe={recipe} />
              <SafetyBadge recipe={recipe} />
            </div>
          </Link>)}</section>}
    </>}

    {creating && <RecipeForm categories={categories} onClose={closeForm} onSaved={recipe => { closeForm(); navigate(`/recipes/${recipe.id}`) }} />}
  </>
}
