import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, BookOpen, Clock, Plus, Search, SearchX, Users } from 'lucide-react'
import { api, errorMessage, type RecipeSummary } from '../../lib/api'
import { useSession } from '../../lib/session'
import { Badge, EmptyState, Notice, PageHeader, Segmented, Spinner } from '../../components/ui'
import { RecipeForm } from './RecipeForm'
import { RecipePhoto } from './RecipePhoto'

export function RecipesPage() {
  const { household } = useSession()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<{ servings: number; recipes: RecipeSummary[] } | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [readyOnly, setReadyOnly] = useState(false)
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
    return (recipes ?? []).filter(r => (category === 'all' || r.category === category) && (!readyOnly || r.missingCount === 0)
      && (!q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)))
  }, [recipes, search, category, readyOnly])
  const readyCount = (recipes ?? []).filter(r => r.missingCount === 0).length
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
      </section>

      {visible.length === 0
        ? <section className="panel"><EmptyState icon={recipes.length ? SearchX : BookOpen} title={recipes.length ? 'No recipes match' : 'No recipes yet'}
            action={recipes.length ? <button className="secondary-button" onClick={() => { setSearch(''); setCategory('all'); setReadyOnly(false) }}>Clear filters</button> : undefined}>
            {readyOnly ? 'Nothing can be cooked entirely from your pantry right now. Add stock or turn off “Ready to cook”.' : 'Try a different search or category.'}
          </EmptyState></section>
        : <section className="recipe-grid">{visible.map(recipe => <Link key={recipe.id} to={`/recipes/${recipe.id}`} className="recipe-card">
            <div className="recipe-card-image"><RecipePhoto name={recipe.name} />
              <span className="recipe-category">{recipe.category}</span>
              <span className="recipe-readiness">{recipe.missingCount === 0 ? <Badge tone="green">Ready to cook</Badge> : <Badge tone="amber">{recipe.missingCount} missing</Badge>}</span>
            </div>
            <div className="recipe-card-body">
              <div className="recipe-card-top"><h2>{recipe.name}</h2>{recipe.custom && <Badge tone="blue">Your recipe</Badge>}</div>
              <p>{recipe.description || 'A dependable home-style recipe.'}</p>
              <div className="recipe-meta">
                <span><Clock size={14} aria-hidden />{recipe.prepMinutes + recipe.cookMinutes} min</span>
                <span><Users size={14} aria-hidden />{recipe.baseServings} servings</span>
                <span>{recipe.ingredientCount} ingredients</span>
              </div>
              <span className="recipe-open">View recipe <ArrowRight size={15} aria-hidden /></span>
            </div>
          </Link>)}</section>}
    </>}

    {creating && <RecipeForm categories={categories} onClose={closeForm} onSaved={recipe => { closeForm(); navigate(`/recipes/${recipe.id}`) }} />}
  </>
}
