import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../../app/ThemeProvider'
import type { ThemePreference } from '../../lib/themePreference'

const icons: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

export function ThemeControl() {
  const { preference, setPreference } = useTheme()
  const Icon = icons[preference]

  return (
    <label className="theme-control">
      <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
      <span className="theme-control__label">Theme</span>
      <select
        aria-label="Color theme"
        value={preference}
        onChange={(event) => setPreference(event.currentTarget.value as ThemePreference)}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  )
}
