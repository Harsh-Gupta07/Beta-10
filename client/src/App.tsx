import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { api, errorMessage, type Household, type User } from './lib/api'
import { SessionContext, type Session } from './lib/session'
import { AppShell } from './components/AppShell'
import { Spinner } from './components/ui'
import { AuthScreen } from './features/auth/AuthScreen'
import { HouseholdSetup } from './features/household/HouseholdSetup'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { PantryPage } from './features/pantry/PantryPage'
import { RecipesPage } from './features/recipes/RecipesPage'
import { RecipeDetailPage } from './features/recipes/RecipeDetailPage'
import { PlannerPage } from './features/planner/PlannerPage'
import { ComingSoon } from './features/ComingSoon'

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
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pantry" element={<PantryPage />} />
        <Route path="/planner" element={<PlannerPage />} />
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/recipes/:recipeId" element={<RecipeDetailPage />} />
        <Route path="/shopping" element={<ComingSoon title="Shopping List" milestone="Missing ingredients collected into one list. Stock only increases when you confirm what was actually received." />} />
        <Route path="/assistant" element={<ComingSoon title="AI Assistant" milestone="Ask what you can cook, add stock in plain language, or get shortages explained. The core app keeps working without it." />} />
        <Route path="/settings" element={<ComingSoon title="Household & Settings" milestone="Manage your household name, default servings and members, and invite family to share the same kitchen." />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  </SessionContext.Provider>
}

export default App
