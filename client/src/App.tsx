import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { api, errorMessage, type Household, type User } from './lib/api'
import { SessionContext, type Session } from './lib/session'
import { AppShell } from './components/AppShell'
import { Spinner } from './components/ui'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useToast } from './components/Toast'
import { AuthScreen } from './features/auth/AuthScreen'
import { Onboarding } from './features/onboarding/Onboarding'
import { DashboardPage } from './features/dashboard/DashboardPage'

// Pages other than the dashboard load on demand, keeping the first download small.
const PantryPage = lazy(() => import('./features/pantry/PantryPage').then(m => ({ default: m.PantryPage })))
const RecipesPage = lazy(() => import('./features/recipes/RecipesPage').then(m => ({ default: m.RecipesPage })))
const RecipeDetailPage = lazy(() => import('./features/recipes/RecipeDetailPage').then(m => ({ default: m.RecipeDetailPage })))
const PlannerPage = lazy(() => import('./features/planner/PlannerPage').then(m => ({ default: m.PlannerPage })))
const ShoppingPage = lazy(() => import('./features/shopping/ShoppingPage').then(m => ({ default: m.ShoppingPage })))
const VerifyPage = lazy(() => import('./features/verification/VerifyPage').then(m => ({ default: m.VerifyPage })))
const AssistantPage = lazy(() => import('./features/assistant/AssistantPage').then(m => ({ default: m.AssistantPage })))
const SuggestionsPage = lazy(() => import('./features/suggestions/SuggestionsPage').then(m => ({ default: m.SuggestionsPage })))
const FoodPreferencesPage = lazy(() => import('./features/preferences/FoodPreferencesPage').then(m => ({ default: m.FoodPreferencesPage })))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then(m => ({ default: m.SettingsPage })))
const FitPage = lazy(() => import('./features/fit/FitPage').then(m => ({ default: m.FitPage })))

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [household, setHousehold] = useState<Household | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const toast = useToast()

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

  // A session that ends while the app is open (expired, signed out elsewhere, demo over) returns to sign-in
  // instead of every page showing "Please sign in to continue."
  const signedIn = user !== null
  useEffect(() => {
    if (!signedIn) return
    const id = api.interceptors.response.use(undefined, error => {
      if (error?.response?.status === 401 && !String(error.config?.url ?? '').startsWith('/auth/')) {
        toast.info('Your session ended. Please sign in again.')
        void refresh()
      }
      return Promise.reject(error)
    })
    return () => api.interceptors.response.eject(id)
  }, [signedIn, refresh, toast])

  const signOut = useCallback(async () => {
    try { await api.post('/auth/logout'); toast.info('You’re signed out.') } finally { setUser(null); setHousehold(null) }
  }, [toast])

  const session = useMemo<Session | null>(() => user && household ? { user, household, signOut } : null, [user, household, signOut])

  if (loading) return <main className="center-state"><Spinner label="Loading your kitchen…" /></main>
  if (!user) return <AuthScreen onSignedIn={refresh} error={error} />
  // New owners see the onboarding cards until they finish; people who joined go straight in.
  if (!household || !session || (household.onboardingCompletedAt === null && household.yourRole === 'OWNER')) return <Onboarding user={user} household={household} onChanged={refresh} onSignOut={signOut} />

  return <SessionContext.Provider value={session}>
    <AppShell>
      <PageBoundary>
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
        <Route path="/suggestions" element={<SuggestionsPage />} />
        <Route path="/preferences"element={<FoodPreferencesPage />} />
        <Route path="/settings"element={<SettingsPage onSessionChange={refresh} />} />
        <Route path="/fit" element={<FitPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </PageBoundary>
    </AppShell>
  </SessionContext.Provider>
}

function PageBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary resetKey={useLocation().pathname}>{children}</ErrorBoundary>
}

export default App
