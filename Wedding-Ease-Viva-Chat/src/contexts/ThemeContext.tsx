// ThemeContext — Sprint 2 (Yuki). Settings & Profile redesign, PRD §5/§7.
//
// Minimal class-based theme provider per docs/settings-design-system.md §1.
// - Reads initial theme synchronously from localStorage (no flicker)
// - Toggles `dark` class on <html> based on resolved theme
// - Listens to prefers-color-scheme when theme === 'system'
// - Syncs from profile.preferences.theme when profile loads (profile wins)
// - Persists every setTheme to localStorage
// - Exposes { theme, resolvedTheme, setTheme }
//
// Sprint 4 (Hana): localStorage persistence + boot-time read to kill the
// dark-mode flash on cold reload (Marcus QA C-2). Pairs with the inline
// boot script in index.html that runs before React mounts.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export type Theme = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'easebot-theme'

function readStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'system' || raw === 'light' || raw === 'dark') return raw
    return null
  } catch {
    return null
  }
}

function writeStoredTheme(theme: Theme): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* swallow — private mode / quota */
  }
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyDarkClass(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth()

  // Initial theme: localStorage first (synchronous, set by inline boot script),
  // then profile preference, then 'system'.
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = readStoredTheme()
    if (stored) return stored
    return (profile?.preferences?.theme as Theme | undefined) ?? 'system'
  })

  // Sync from profile when it loads/changes (profile wins on mismatch).
  useEffect(() => {
    const t = profile?.preferences?.theme as Theme | undefined
    if (t && t !== theme) {
      setThemeState(t)
      writeStoredTheme(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.preferences?.theme])

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    const initial = readStoredTheme() ?? (profile?.preferences?.theme as Theme | undefined) ?? 'system'
    return initial === 'system' ? getSystemTheme() : initial
  })

  // Apply class + recompute resolved theme whenever theme or system pref changes.
  useEffect(() => {
    if (theme !== 'system') {
      applyDarkClass(theme)
      setResolvedTheme(theme)
      return
    }
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => {
      const r: ResolvedTheme = mql.matches ? 'dark' : 'light'
      setResolvedTheme(r)
      applyDarkClass(r)
    }
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    writeStoredTheme(next)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    // Soft-fail so consumers (Settings tabs) never crash if mounted outside.
    return {
      theme: 'system',
      resolvedTheme: 'dark',
      setTheme: () => {},
    }
  }
  return ctx
}
