import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { authApi, type AuthUser } from '../lib/authApi'
import { getSupabaseClient } from '../lib/supabase'

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  error: string
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    let unsubscribe = () => {}

    async function refreshUser() {
      try {
        const result = await authApi.me()
        if (active) {
          setUser(result?.user ?? null)
          setError('')
        }
      } catch {
        if (active) {
          setUser(null)
          setError('Authentication service is unavailable. Check the Supabase configuration.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    try {
      const client = getSupabaseClient()
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        if (!session) {
          setUser(null)
          setLoading(false)
          return
        }
        queueMicrotask(() => { if (active) void refreshUser() })
      })
      unsubscribe = () => data.subscription.unsubscribe()
      void refreshUser()
    } catch {
      setError('Supabase is not configured. Set VITE_SUPABASE_URL and either VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY.')
      setLoading(false)
    }

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    setError('')
    const signedInUser = await authApi.signIn(email, password)
    setUser(signedInUser)
  }, [])

  const signOut = useCallback(async () => {
    await authApi.signOut()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, error, signIn, signOut }),
    [user, loading, error, signIn, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
