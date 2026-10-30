import { createContext, useContext } from 'react'
import type { Household, User } from './api'

export type Session = { user: User; household: Household; signOut: () => Promise<void> }

export const SessionContext = createContext<Session | null>(null)

/** The signed-in user and active household. Only usable inside the authenticated app shell. */
export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside the authenticated app shell.')
  return session
}
