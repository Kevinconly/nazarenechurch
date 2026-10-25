import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  applyTheme,
  getInitialThemePreference,
  resolveTheme,
  saveThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from '../lib/themePreference'

type ThemeContextValue = {
  preference: ThemePreference
  resolvedTheme: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(getInitialThemePreference)
  const [systemIsDark, setSystemIsDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true,
  )

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) {
      applyTheme(preference, false)
      return
    }

    const update = (event: MediaQueryListEvent) => setSystemIsDark(event.matches)
    setSystemIsDark(media.matches)
    media.addEventListener?.('change', update)
    // Older Safari versions expose addListener instead of addEventListener.
    if (!media.addEventListener) media.addListener(update)
    return () => {
      media.removeEventListener?.('change', update)
      if (!media.removeEventListener) media.removeListener(update)
    }
  }, [])

  useEffect(() => {
    applyTheme(preference, systemIsDark)
  }, [preference, systemIsDark])

  const setPreference = useCallback((next: ThemePreference) => {
    saveThemePreference(next)
    setPreferenceState(next)
  }, [])

  const value = useMemo(() => ({
    preference,
    resolvedTheme: resolveTheme(preference, systemIsDark),
    setPreference,
  }), [preference, setPreference, systemIsDark])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
