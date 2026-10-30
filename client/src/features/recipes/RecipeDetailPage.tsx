import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Clock, Copy, Minus, PencilLine, Plus, Trash2, TriangleAlert, Users } from 'lucide-react'
import { api, errorMessage, type RecipeDetail } from '../../lib/api'
import { useSession } from '../../lib/session'
import { formatQuantity } from '../../lib/format'
import { Badge, Modal, Notice, Spinner } from '../../components/ui'
import { RecipeForm } from './RecipeForm'

export function RecipeDetailPage() {
  const { recipeId } = useParams()
  const { household } = useSession()
  const navigate = useNavigate()
  const [servings, setServings] = useState<number | null>(null)
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [editing, setEditing] = useState<RecipeDetail | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const path = `/households/${household.id}/recipes/${recipeId}`

  const load = useCallback(async () => {
    setError('')
    try {
      const { data } = await api.get<RecipeDetail>(path, { params: servings ? { servings } : undefined })
      setRecipe(data)
      if (servings === null) setServings(data.servings)
    } catch (err) { setError(errorMessage(err, 'This recipe could not be loaded.')) }
  }, [path, servings])
  useEffect(() => { void load() }, [load])

  async function startEdit() {
    setActionError('')
    try { setEditing((await api.get<RecipeDetail>(path, { params: { servings: recipe!.baseServings } })).data) }
    catch (err) { setActionError(errorMessage(err)) }
  }
  async function duplicate() {
    setBusy(true); setActionError('')
    try { const { data } = await api.post<RecipeDetail>(`${path}/duplicate`); setServings(null); navigate(`/recipes/${data.id}`) }
    catch (err) { setActionError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  async function remove() {
    setBusy(true); setActionError('')
    try { await api.delete(path); navigate('/recipes') }
    catch (err) { setActionError(errorMessage(err)); setBusy(false); setConfirmDelete(false) }
  }

  if (error) return <><BackLink /><Notice onRetry={load}>{error}</Notice></>
  if (!recipe) return <><BackLink /><Spinner label="Loading recipe…" /></>

  const missing = recipe.ingredients.filter(l => !l.enough)
  return <>
    <BackLink />
    <header className="recipe-hero">
      <div>
        <p className="eyebrow">{recipe.category}</p>
        <h1>{recipe.name} {recipe.custom && <Badge tone="blue">Yours</Badge>}</h1>
        {recipe.description && <p className="muted">{recipe.description}</p>}
        <div className="recipe-meta large">
          <span><Clock size={15} aria-hidden />Prep {recipe.prepMinutes} min · Cook {recipe.cookMinutes} min</span>
          <span><Users size={15} aria-hidden />Written for {recipe.baseServings}</span>
        </div>
      </div>
      <div className="header-actions">
        {recipe.custom
          ? <><button className="ghost-button danger-text" onClick={() => setConfirmDelete(true)}><Trash2 size={15} aria-hidden />Delete</button><button className="secondary-button" onClick={startEdit}><PencilLine size={15} aria-hidden />Edit</button></>
          : <button className="secondary-button" onClick={duplicate} disabled={busy} title="Built-in recipes are read-only"><Copy size={15} aria-hidden />{busy ? 'Copying…' : 'Make a copy to edit'}</button>}
      </div>
    </header>
    {actionError && <Notice>{actionError}</Notice>}

    <section className="recipe-layout">
      <article className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">INGREDIENTS</p><h2>For {recipe.servings} {recipe.servings === 1 ? 'serving' : 'servings'}</h2></div>
          <div className="stepper" role="group" aria-label="Servings">
            <button className="icon-button" onClick={() => setServings(Math.max(1, recipe.servings - 1))} disabled={recipe.servings <= 1} aria-label="Fewer servings"><Minus size={16} /></button>
            <span aria-live="polite">{recipe.servings}</span>
            <button className="icon-button" onClick={() => setServings(Math.min(50, recipe.servings + 1))} disabled={recipe.servings >= 50} aria-label="More servings"><Plus size={16} /></button>
          </div>
        </div>
        <div className={`pantry-check ${missing.length ? 'short' : 'ok'}`}>
          {missing.length
            ? <><TriangleAlert size={16} aria-hidden /><span>Your pantry is short on {missing.length} ingredient{missing.length === 1 ? '' : 's'} for {recipe.servings} servings. <Link to="/pantry">Update pantry</Link></span></>
            : <><Check size={16} aria-hidden /><span>Everything is in your pantry for {recipe.servings} servings.</span></>}
        </div>
        <ul className="ingredient-table">
          {recipe.ingredients.map(line => <li key={line.ingredient.id}>
            <span className="ing-name"><strong>{line.ingredient.name}</strong>{line.note && <small>{line.note}</small>}</span>
            <span className="ing-qty">{formatQuantity(line.quantity, line.unit)}</span>
            <span className="ing-status">{line.enough
              ? <Badge tone="green">In pantry</Badge>
              : line.inPantry === null ? <Badge tone="grey">Not in pantry</Badge>
              : <Badge tone="amber">Short {formatQuantity(line.missing, line.unit)}</Badge>}</span>
          </li>)}
        </ul>
        <p className="muted small">Pantry check compares with what’s on hand now. It doesn’t reserve stock; that comes with meal planning.</p>
      </article>

      <article className="panel">
        <p className="eyebrow">METHOD</p><h2 className="panel-title">How to make it</h2>
        {recipe.instructions.length
          ? <ol className="steps">{recipe.instructions.map((step, i) => <li key={i}><span className="step-no">{i + 1}</span><p>{step}</p></li>)}</ol>
          : <p className="muted">No steps written yet.</p>}
      </article>
    </section>

    {editing && <RecipeForm recipe={editing} categories={[]} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load() }} />}
    {confirmDelete && <Modal title={`Delete ${recipe.name}?`} subtitle="This removes your recipe. Built-in recipes are not affected." onClose={() => setConfirmDelete(false)}
      footer={<><button className="ghost-button" onClick={() => setConfirmDelete(false)}>Keep it</button><button className="danger-button" onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Delete recipe'}</button></>}>
      <p className="muted">Meals already planned with this recipe will block deletion until they’re changed.</p>
    </Modal>}
  </>
}

function BackLink() {
  return <Link to="/recipes" className="back-link"><ArrowLeft size={15} aria-hidden />All recipes</Link>
}
