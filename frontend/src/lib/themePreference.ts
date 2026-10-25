export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = Exclude<ThemePreference, 'system'>

const STORAGE_KEY = 'remera-theme-preference'

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function getSavedThemePreference(): ThemePreference | undefined {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return isThemePreference(value) ? value : undefined
  } catch {
    return undefined
  }
}

export function saveThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // The selected theme remains active for this visit when storage is unavailable.
  }
}

export function getInitialThemePreference(): ThemePreference {
  const bootstrapped = document.documentElement.dataset.themePreference
  return isThemePreference(bootstrapped) ? bootstrapped : getSavedThemePreference() ?? 'system'
}

export function resolveTheme(preference: ThemePreference, systemIsDark: boolean): ResolvedTheme {
  return preference === 'system' ? (systemIsDark ? 'dark' : 'light') : preference
}

export function applyTheme(preference: ThemePreference, systemIsDark: boolean): ResolvedTheme {
  const resolved = resolveTheme(preference, systemIsDark)
  document.documentElement.dataset.themePreference = preference
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#2c2e30' : '#ffffff')
  return resolved
}
