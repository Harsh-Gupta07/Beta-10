import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { api, errorMessage, type Ingredient, type InputUnit, type RecipeDetail, type RecipeDraft } from '../../lib/api'
import { useSession } from '../../lib/session'
import { baseUnit, unitOptions } from '../../lib/format'
import { Badge, Field, Modal, Notice, Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { SPICE_LABEL } from '../../lib/food'

type Line = { key: number; ingredientId: string; quantity: string; unit: InputUnit; note: string }
type Props = { recipe?: RecipeDetail; draft?: RecipeDraft; categories: string[]; onClose: () => void; onSaved: (recipe: RecipeDetail) => void }

let nextKey = 1
const blankLine = (): Line => ({ key: nextKey++, ingredientId: '', quantity: '', unit: 'g', note: '' })

/**
 * Create a recipe, edit a household-owned one (`recipe`, fetched at its base servings),
 * or review an assistant draft (`draft`) before saving it as a new recipe.
 */
export function RecipeForm({ recipe, draft, categories, onClose, onSaved }: Props) {
  const { household } = useSession()
  const [catalog, setCatalog] = useState<Ingredient[] | null>(null)
  const source = recipe ?? draft
  const [name, setName] = useState(source?.name ?? '')
  const [category, setCategory] = useState(source?.category ?? '')
  const [description, setDescription] = useState(source?.description ?? '')
  const [baseServings, setBaseServings] = useState(String(source?.baseServings ?? household.defaultServings))
  const [prepMinutes, setPrepMinutes] = useState(String(source?.prepMinutes ?? 15))
  const [cookMinutes, setCookMinutes] = useState(String(source?.cookMinutes ?? 20))
  const [steps, setSteps] = useState(source?.instructions.join('\n') ?? '')
  const [cuisine, setCuisine] = useState(recipe?.cuisine ?? draft?.cuisine ?? '')
  const spice = recipe?.spiceLevel ?? draft?.spiceLevel
  const [spiceLevel, setSpiceLevel] = useState(spice ? String(spice) : '')
  const [tags, setTags] = useState((recipe?.tags ?? draft?.tags ?? []).join(', '))
  const [lines, setLines] = useState<Line[]>(() => recipe
    ? recipe.ingredients.map(l => ({ key: nextKey++, ingredientId: l.ingredient.id, quantity: l.quantity, unit: baseUnit[l.unit], note: l.note }))
    : draft?.ingredients.length ? draft.ingredients.map(l => ({ key: nextKey++, ingredientId: l.ingredientId, quantity: l.quantity, unit: l.unit, note: l.note }))
    : [blankLine(), blankLine(), blankLine()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()

  useEffect(() => {
    api.get<Ingredient[]>(`/households/${household.id}/ingredients`).then(r => setCatalog(r.data)).catch(err => { setCatalog([]); setError(errorMessage(err, 'Could not load ingredients.')) })
  }, [household.id])

  const byId = useMemo(() => new Map((catalog ?? []).map(i => [i.id, i])), [catalog])
  const grouped = useMemo(() => {
    const groups = new Map<string, Ingredient[]>()
    for (const i of catalog ?? []) groups.set(i.category, [...(groups.get(i.category) ?? []), i])
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [catalog])

  const update = (key: number, patch: Partial<Line>) => setLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l))
  function chooseIngredient(key: number, ingredientId: string) {
    const family = byId.get(ingredientId)?.canonicalUnit ?? 'g'
    update(key, { ingredientId, unit: baseUnit[family] })
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    const filled = lines.filter(l => l.ingredientId)
    if (!filled.length) return setError('Add at least one ingredient.')
    const missingQty = filled.find(l => !l.quantity.trim())
    if (missingQty) return setError(`Enter a quantity for ${byId.get(missingQty.ingredientId)?.name ?? 'each ingredient'}.`)
    setBusy(true)
    const body = {
      name, category, description, baseServings: Number(baseServings), prepMinutes: Number(prepMinutes || 0), cookMinutes: Number(cookMinutes || 0),
      instructions: steps.split('\n').map(s => s.trim()).filter(Boolean),
      cuisine, spiceLevel: spiceLevel ? Number(spiceLevel) : null, tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      ingredients: filled.map(l => ({ ingredientId: l.ingredientId, quantity: l.quantity.trim(), unit: l.unit, note: l.note.trim() || undefined })),
    }
    try {
      const { data } = recipe ? await api.put<RecipeDetail>(`/households/${household.id}/recipes/${recipe.id}`, body) : await api.post<RecipeDetail>(`/households/${household.id}/recipes`, body)
      toast.success(recipe ? `Changes to ${data.name} saved.` : draft ? `${data.name} saved to your recipes after your review.` : `${data.name} added to your recipes.`)
      onSaved(data)
    } catch (err) { setError(errorMessage(err, 'Could not save this recipe.')) }
    finally { setBusy(false) }
  }

  const chosen = new Set(lines.map(l => l.ingredientId).filter(Boolean))
  const title = recipe ? `Edit ${recipe.name}` : draft?.kind === 'SWAP' ? 'Review recipe with swaps' : draft ? 'Review AI recipe draft' : 'New recipe'
  const subtitle = draft?.kind === 'SWAP' ? 'This saves a copy of the recipe with the swaps; the original stays as it is. Check the quantities, then press Create.'
    : draft ? 'Check every quantity and step before saving. Nothing is saved until you press Create.' : 'Quantities are for the number of servings below and scale automatically.'
  return <Modal wide title={title} subtitle={<>{draft && draft.kind !== 'SWAP' && <Badge tone="blue">AI Draft</Badge>} {subtitle}</>} onClose={onClose}
    footer={<><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button form="recipe-form" className="primary-button" disabled={busy || !catalog}>{busy ? 'Saving…' : recipe ? 'Save recipe' : 'Create recipe'}</button></>}>
    {error && <Notice>{error}</Notice>}
    {draft && draft.unresolved.length > 0 && <Notice tone="warning">Not in your ingredient catalog, so not added: {draft.unresolved.join(', ')}. Add them as custom ingredients in the Pantry if you need them.</Notice>}
    <form id="recipe-form" className="form-grid" onSubmit={submit}>
      <div className="full"><Field label="Recipe name"><input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={80} placeholder="e.g. Sambar" /></Field></div>
      <Field label="Category">
        <input value={category} onChange={e => setCategory(e.target.value)} list="recipe-categories" maxLength={40} placeholder="e.g. Dals & Curries" />
        <datalist id="recipe-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label="Serves"><input type="number" min={1} max={50} value={baseServings} onChange={e => setBaseServings(e.target.value)} required /></Field>
      <Field label="Prep time (min)"><input type="number" min={0} max={1440} value={prepMinutes} onChange={e => setPrepMinutes(e.target.value)} /></Field>
      <Field label="Cook time (min)"><input type="number" min={0} max={1440} value={cookMinutes} onChange={e => setCookMinutes(e.target.value)} /></Field>
      <Field label="Cuisine"><input value={cuisine} onChange={e => setCuisine(e.target.value)} maxLength={40} placeholder="e.g. South Indian" /></Field>
      <Field label="Spice level">
        <select value={spiceLevel} onChange={e => setSpiceLevel(e.target.value)}>
          <option value="">Not set</option>
          {[1, 2, 3, 4, 5].map(level => <option key={level} value={level}>{level}: {SPICE_LABEL[level]}</option>)}
        </select>
      </Field>
      <div className="full"><Field label="Tags" hint="Comma separated, e.g. quick, one-pot. Veg/non-veg and allergens are worked out from the ingredients."><input value={tags} onChange={e => setTags(e.target.value)} maxLength={250} placeholder="quick, comfort" /></Field></div>
      <div className="full"><Field label="Short description"><textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} maxLength={500} placeholder="What makes this dish yours?" /></Field></div>

      <div className="full">
        <span className="field-label">Ingredients</span>
        {!catalog ? <Spinner label="Loading ingredients…" /> : <div className="ingredient-lines">
          {lines.map((line, index) => {
            const family = byId.get(line.ingredientId)?.canonicalUnit ?? 'g'
            return <div className="ingredient-line" key={line.key}>
              <select value={line.ingredientId} onChange={e => chooseIngredient(line.key, e.target.value)} aria-label={`Ingredient ${index + 1}`}>
                <option value="">Choose ingredient…</option>
                {grouped.map(([group, items]) => <optgroup key={group} label={group}>{items.map(i => <option key={i.id} value={i.id} disabled={chosen.has(i.id) && i.id !== line.ingredientId}>{i.name}</option>)}</optgroup>)}
              </select>
              <input value={line.quantity} onChange={e => update(line.key, { quantity: e.target.value })} inputMode="decimal" pattern="\d+(\.\d+)?" title="A number, e.g. 200 or 0.5" placeholder="Qty" aria-label={`Quantity ${index + 1}`} />
              <select value={line.unit} onChange={e => update(line.key, { unit: e.target.value as InputUnit })} aria-label={`Unit ${index + 1}`}>{unitOptions[family].map(u => <option key={u} value={u}>{u === 'l' ? 'L' : u}</option>)}</select>
              <input value={line.note} onChange={e => update(line.key, { note: e.target.value })} maxLength={80} placeholder="Note (e.g. chopped)" aria-label={`Note ${index + 1}`} />
              <button type="button" className="icon-button" onClick={() => setLines(prev => prev.length > 1 ? prev.filter(l => l.key !== line.key) : [blankLine()])} aria-label={`Remove ingredient ${index + 1}`}><X size={16} /></button>
            </div>
          })}
          <button type="button" className="link-button add-line" onClick={() => setLines(prev => [...prev, blankLine()])}><Plus size={14} aria-hidden /> Add ingredient</button>
          <p className="muted small">Missing an ingredient? Add it as a custom ingredient from the Pantry’s “Add item” screen.</p>
        </div>}
      </div>

      <div className="full"><Field label="Method" hint="One step per line."><textarea rows={6} value={steps} onChange={e => setSteps(e.target.value)} placeholder={'Heat oil and add cumin.\nAdd onion and cook until golden.'} /></Field></div>
    </form>
  </Modal>
}
