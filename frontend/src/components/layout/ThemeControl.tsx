import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../app/ThemeProvider'

export function ThemeControl() {
  const { resolvedTheme, setPreference } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const Icon = isDark ? Moon : Sun

  return (
    <button
      className="theme-control"
      type="button"
      role="switch"
      aria-label="Dark theme"
      aria-checked={isDark}
      title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      onClick={() => setPreference(isDark ? 'light' : 'dark')}
    >
      <span className="theme-control__track" aria-hidden="true">
        <span className="theme-control__thumb">
          <Icon size={14} strokeWidth={2} />
        </span>
      </span>
    </button>
  )
}
