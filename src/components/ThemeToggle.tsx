'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { colorMode, colorPreference, setColorPreference, toggleColorMode } = useTheme()
  const isDark = colorMode === 'dark'

  if (compact) {
    return <button onClick={toggleColorMode} aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`} title={`Appearance: ${colorPreference === 'system' ? 'System' : colorMode === 'dark' ? 'Dark' : 'Light'}`} className="theme-icon-button relative">
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      {colorPreference === 'system' && <Monitor className="absolute -right-1 -bottom-1 w-2.5 h-2.5 p-px rounded-full bg-[var(--sx-surface)] text-[var(--sx-muted)]" />}
    </button>
  }

  return <div className="inline-flex items-center rounded-xl border border-[var(--sx-border)] bg-[var(--sx-surface-soft)] p-1 shadow-sm" aria-label="Appearance settings">
    <button onClick={() => setColorPreference('light')} className={`theme-choice ${colorPreference === 'light' ? 'theme-choice-active' : ''}`} aria-pressed={colorPreference === 'light'} title="Light mode"><Sun className="w-3.5 h-3.5" /><span className="sr-only">Light</span></button>
    <button onClick={() => setColorPreference('system')} className={`theme-choice ${colorPreference === 'system' ? 'theme-choice-active' : ''}`} aria-pressed={colorPreference === 'system'} title="Use device setting"><Monitor className="w-3.5 h-3.5" /><span className="sr-only">System</span></button>
    <button onClick={() => setColorPreference('dark')} className={`theme-choice ${colorPreference === 'dark' ? 'theme-choice-active' : ''}`} aria-pressed={colorPreference === 'dark'} title="Dark mode"><Moon className="w-3.5 h-3.5" /><span className="sr-only">Dark</span></button>
  </div>
}
