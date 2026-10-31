import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { api, errorMessage, type Household, type User } from './lib/api'
import { SessionContext, type Session } from './lib/session'
import { AppShell } from './components/AppShell'
import { Spinner } from './components/ui'
import { AuthScreen } from './features/auth/AuthScreen'
import { HouseholdSetup } from './features/household/HouseholdSetup'
import { DashboardPage } from './features/dashboard/DashboardPage'

// Pages other than the dashboard load on demand, keeping the first download small.
const PantryPage = lazy(() => import('./features/pantry/PantryPage').then(m => ({ default: m.PantryPage })))
const RecipesPage = lazy(() => import('./features/recipes/RecipesPage').then(m => ({ default: m.RecipesPage })))
const RecipeDetailPage = lazy(() => import('./features/recipes/RecipeDetailPage').then(m => ({ default: m.RecipeDetailPage })))
const PlannerPage = lazy(() => import('./features/planner/PlannerPage').then(m => ({ default: m.PlannerPage })))
const ShoppingPage = lazy(() => import('./features/shopping/ShoppingPage').then(m => ({ default: m.ShoppingPage })))
const VerifyPage = lazy(() => import('./features/verification/VerifyPage').then(m => ({ default: m.VerifyPage })))
const AssistantPage = lazy(() => import('./features/assistant/AssistantPage').then(m => ({ default: m.AssistantPage })))
const FoodPreferencesPage = lazy(() => import('./features/preferences/FoodPreferencesPage').then(m => ({ default: m.FoodPreferencesPage })))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then(m => ({ default: m.SettingsPage })))

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [household, setHousehold] = useState<Household | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setError('')
    try {
      const { data } = await api.get('/auth/me')
      setUser(data.user)
      setHousehold(data.household ?? null)
    } catch (err: any) {
      if (err.response?.status !== 401) setError(errorMessage(err))
      setUser(null)
      setHousehold(null)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const signOut = useCallback(async () => {
    try { await api.post('/auth/logout') } finally { setUser(null); setHousehold(null) }
  }, [])

  const session = useMemo<Session | null>(() => user && household ? { user, household, signOut } : null, [user, household, signOut])

  if (loading) return <main className="center-state"><Spinner label="Loading your kitchen…" /></main>
  if (!user) return <AuthScreen onSignedIn={refresh} error={error} />
  if (!household || !session) return <HouseholdSetup user={user} onCreated={refresh} onSignOut={signOut} />

  return <SessionContext.Provider value={session}>
    <AppShell>
      <Suspense fallback={<Spinner label="Loading…" />}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/planner" element={<PlannerPage />} />
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/recipes/:recipeId" element={<RecipeDetailPage />} />
        <Route path="/pantry" element={<PantryPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/shopping" element={<ShoppingPage />} />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/preferences" element={<FoodPreferencesPage />} />
        <Route path="/settings"element={<SettingsPage onSessionChange={refresh} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </AppShell>
  </SessionContext.Provider>
}

export default App
