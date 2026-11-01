import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Check, Clock3, ShoppingCart, UsersRound } from 'lucide-react'
import { api, errorMessage, type MealSlot, type RecipeDetail, type SuggestionsData } from '../../lib/api'
import { useSession } from '../../lib/session'
import { formatQuantity, slotLabel } from '../../lib/format'
import { Badge, Field, Notice, PageHeader, Spinner } from '../../components/ui'
import { RecipePhoto } from '../recipes/RecipePhoto'

const mealTypes: Array<{ value: MealSlot; label: string }> = [
  { value: 'BREAKFAST', label: 'Breakfast' },
  { value: 'LUNCH', label: 'Lunch' },
  { value: 'DINNER', label: 'Dinner' },
]

type GuestSuggestion = SuggestionsData['suggestions'][number] & { mealTypes: MealSlot[] }
type GuestResults = { suggestions: GuestSuggestion[]; excludedForSafety: number }

export function GuestModePage() {
  const { household } = useSession()
  const [guestCount, setGuestCount] = useState(4)
  const [selectedMealTypes, setSelectedMealTypes] = useState<MealSlot[]>(['DINNER'])
  const [data, setData] = useState<GuestResults | null>(null)
  const [details, setDetails] = useState<Record<string, RecipeDetail>>({})
  const [loading, setLoading] = useState(false)
  const [busyRecipe, setBusyRecipe] = useState('')
  const [error, setError] = useState('')

  async function findMeals(event?: FormEvent) {
    event?.preventDefault()
    setLoading(true)
    setError('')
    try {
      const responses = await Promise.all(selectedMealTypes.map(slot =>
        api.get<SuggestionsData>(`/households/${household.id}/suggestions`, {
          params: { scope: 'household', limit: 30, slot },
        }),
      ))
      const combined = new Map<string, GuestSuggestion>()
      for (let index = 0; index < responses.length; index++) {
        const slot = selectedMealTypes[index]!
        const suggestions = responses[index]!.data
        for (const suggestion of suggestions.suggestions) {
          const current = combined.get(suggestion.recipe.id)
          if (current) current.mealTypes.push(slot)
          else combined.set(suggestion.recipe.id, { ...suggestion, mealTypes: [slot] })
        }
      }
      setData({
        suggestions: [...combined.values()].sort((a, b) => b.score - a.score),
        excludedForSafety: Math.max(0, ...responses.map(response => response.data.excludedForSafety)),
      })
      setDetails({})
    } catch (err) {
      setError(errorMessage(err, 'Guest meal ideas could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }

  async function showIngredients(recipeId: string) {
    setBusyRecipe(recipeId)
    setError('')
    try {
      const { data: recipe } = await api.get<RecipeDetail>(`/households/${household.id}/recipes/${recipeId}`, {
        params: { servings: guestCount },
      })
      setDetails(current => ({ ...current, [recipeId]: recipe }))
    } catch (err) {
      setError(errorMessage(err, 'Recipe ingredients could not be loaded.'))
    } finally {
      setBusyRecipe('')
    }
  }

  function toggleMealType(slot: MealSlot) {
    setSelectedMealTypes(current => current.includes(slot)
      ? current.filter(value => value !== slot)
      : [...current, slot])
    setData(null)
    setDetails({})
  }

  return <>
    <PageHeader
      eyebrow="HOSTING AT HOME"
      title="Guest Mode"
      description="Tell us how many guests are joining and choose any meal types you’re considering. Get tasty ideas ranked from your pantry, including options that may need a shopping trip."
    />

    <form className="panel guest-form" onSubmit={findMeals}>
      <Field label="Number of guests" hint="Ingredient quantities will be scaled for this many servings.">
        <input type="number" min={1} max={50} step={1} value={guestCount}
          onChange={event => {
            setGuestCount(Math.min(50, Math.max(1, Number(event.target.value) || 1)))
            setDetails({})
          }} />
      </Field>
      <fieldset className="guest-meal-types">
        <legend>What type of meal?</legend>
        <div>{mealTypes.map(meal => <label key={meal.value}>
          <input type="checkbox" checked={selectedMealTypes.includes(meal.value)} disabled={loading} onChange={() => toggleMealType(meal.value)} />
          <span>{meal.label}</span>
        </label>)}</div>
      </fieldset>
      <button className="primary-button" type="submit" disabled={loading || selectedMealTypes.length === 0}>
        <UsersRound size={16} aria-hidden />{loading ? 'Finding meal ideas…' : 'Find guest meals'}
      </button>
    </form>

    {!selectedMealTypes.length && <Notice tone="warning">Choose at least one meal type to find ideas.</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {loading && <Spinner label="Finding tasty, suitable meals…" />}
    {!data && !loading && <section className="panel guest-empty">
      <p className="eyebrow">A MEAL EVERYONE CAN ENJOY</p>
      <h2>Make room at the table</h2>
      <p className="muted">Choose the guest count and one or more meal types. There’s no date or time restriction. We’ll avoid known allergy or diet conflicts and flag anything that hasn’t been fully checked.</p>
    </section>}

    {data && !loading && <>
      <div className="panel-heading guest-results-heading">
        <div><p className="eyebrow">IDEAS FOR {guestCount} {guestCount === 1 ? 'GUEST' : 'GUESTS'}</p><h2>{selectedMealTypes.map(slot => slotLabel[slot]).join(', ')} ideas</h2></div>
        <Badge tone="blue">{data.suggestions.length} ideas</Badge>
      </div>
      {data.suggestions.length === 0
        ? <section className="panel guest-empty"><h2>No suitable meals found</h2><p className="muted">Add recipes that suit your household or check food preferences and allergies.</p></section>
        : <div className="guest-meal-grid">{data.suggestions.map(({ recipe, mealTypes: recipeMealTypes }) => {
          const detail = details[recipe.id]
          const missing = detail?.ingredients.filter(line => !line.enough) ?? []
          return <article className="panel guest-meal-card" key={recipe.id}>
            <RecipePhoto name={recipe.name} showSource />
            <div className="row-between">
              <p className="eyebrow">{recipe.category} · {recipeMealTypes.map(slot => slotLabel[slot]).join(', ')}</p>
              <Badge tone={detail ? missing.length === 0 ? 'green' : 'amber' : recipe.missingCount === 0 ? 'green' : 'amber'}>
                {detail
                  ? missing.length === 0 ? 'Ready for guests' : `Needs ${missing.length} ingredient${missing.length === 1 ? '' : 's'}`
                  : recipe.missingCount === 0 ? 'Pantry match at usual servings' : `May need ${recipe.missingCount} ingredient${recipe.missingCount === 1 ? '' : 's'}`}
              </Badge>
            </div>
            <h2>{recipe.name}</h2>
            {recipe.description && <p className="muted small">{recipe.description}</p>}
            <div className="guest-meal-meta">
              <span><Clock3 size={14} aria-hidden />{recipe.prepMinutes + recipe.cookMinutes} min</span>
              <span>{recipe.cuisine}</span>
            </div>
            {recipe.safety.status === 'UNKNOWN' && <p className="guest-safety-note">Some ingredients haven’t been checked for household food preferences.</p>}
            <button className="secondary-button" disabled={busyRecipe === recipe.id} onClick={() => void showIngredients(recipe.id)}>
              {recipe.missingCount === 0 ? <Check size={15} aria-hidden /> : <ShoppingCart size={15} aria-hidden />}
              {busyRecipe === recipe.id ? 'Calculating…' : `Ingredients for ${guestCount}`}
            </button>
            {detail && <div className="guest-ingredients">
              <strong>For {guestCount} servings</strong>
              <ul>{detail.ingredients.map(line => <li key={line.ingredient.id}>
                <span>{line.ingredient.name}</span>
                <span>{formatQuantity(line.quantity, line.unit)}</span>
                {!line.enough && <small>{line.inPantry === null ? 'Not in pantry' : `Short ${formatQuantity(line.missing, line.unit)}`}</small>}
              </li>)}</ul>
              {missing.length > 0 && <Link className="ghost-button" to="/shopping"><ShoppingCart size={14} aria-hidden />Open shopping list</Link>}
              <Link className="link-button" to={`/recipes/${recipe.id}`}>View full recipe</Link>
            </div>}
          </article>
        })}</div>}
      <p className="muted small guest-safety-note">Known allergy and diet conflicts are excluded. Pantry labels show the usual household serving estimate until you open the ingredient list, which recalculates exact quantities for your guests. Planning meals may reserve stock.</p>
    </>}
  </>
}
