// AppearanceTab — Sprint 2 (Yuki). Settings & Profile redesign, PRD §5.
//
// Three cards: Theme (system/light/dark), Density (comfortable/compact),
// Language (existing supported languages). All persist through
// useAccount.updatePreferences, optimistic with rollback. Theme also flips
// the live `dark` class on <html> via ThemeContext.
//
// Touches only this file (Sprint 2 scope rule).

import React, { useCallback, useEffect, useState } from 'react'
import { useAccount } from '@/hooks/useAccount'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme, type Theme } from '@/contexts/ThemeContext'
import { useToast } from '@/hooks/use-toast'
import { updatePreferredLanguage } from '@/services/authService'
import { SUPPORTED_LANGUAGES } from '@/components/chat/constants'
import type { UserPreferences } from '@/types'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Monitor, Sun, Moon, Rows, Rows3 } from 'lucide-react'
import TabShell from './_TabShell'
import { track } from '@/lib/analytics'

type Density = 'comfortable' | 'compact'

const THEME_OPTIONS: { value: Theme; label: string; description: string; Icon: React.ElementType }[] = [
  { value: 'system', label: 'System', description: 'Match your device setting.', Icon: Monitor },
  { value: 'light', label: 'Light', description: 'Always use the light palette.', Icon: Sun },
  { value: 'dark', label: 'Dark', description: 'Always use the dark palette.', Icon: Moon },
]

const DENSITY_OPTIONS: { value: Density; label: string; description: string; Icon: React.ElementType }[] = [
  { value: 'comfortable', label: 'Comfortable', description: 'Roomier spacing for relaxed reading.', Icon: Rows },
  { value: 'compact', label: 'Compact', description: 'Tighter rows to fit more on screen.', Icon: Rows3 },
]

function applyDensityAttr(d: Density) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.density = d
}

export function AppearanceTab() {
  const { profile, updatePreferences } = useAccount()
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()

  const initialDensity: Density = (profile?.preferences?.density as Density | undefined) ?? 'comfortable'
  const initialLanguage: string =
    profile?.preferences?.language ?? profile?.preferredLanguage ?? 'auto'

  const [density, setDensityState] = useState<Density>(initialDensity)
  const [language, setLanguageState] = useState<string>(initialLanguage)

  // Sync local UI state with profile when it loads.
  useEffect(() => {
    const d = (profile?.preferences?.density as Density | undefined) ?? 'comfortable'
    setDensityState(d)
    applyDensityAttr(d)
  }, [profile?.preferences?.density])

  useEffect(() => {
    const l = profile?.preferences?.language ?? profile?.preferredLanguage ?? 'auto'
    setLanguageState(l)
  }, [profile?.preferences?.language, profile?.preferredLanguage])

  // Apply density attr immediately on first render too.
  useEffect(() => {
    applyDensityAttr(density)
  }, [density])

  const mergedPrefs = useCallback(
    (patch: Partial<UserPreferences>): UserPreferences => ({
      ...(profile?.preferences ?? {}),
      ...patch,
    }),
    [profile?.preferences],
  )

  // ── Theme ──────────────────────────────────────────────────────────────────
  const onThemeChange = useCallback(
    async (next: string) => {
      const value = next as Theme
      const previous = theme
      // Optimistic: apply immediately.
      setTheme(value)
      try {
        await updatePreferences(mergedPrefs({ theme: value }))
        track('theme_toggled', { theme: value, previous_theme: previous })
      } catch (err) {
        setTheme(previous)
        toast({
          title: 'Could not save theme',
          description: 'Reverted to your previous selection.',
          variant: 'destructive',
        })
      }
    },
    [theme, setTheme, updatePreferences, mergedPrefs, toast],
  )

  // ── Density ────────────────────────────────────────────────────────────────
  const onDensityChange = useCallback(
    async (next: string) => {
      const value = next as Density
      const previous = density
      setDensityState(value)
      applyDensityAttr(value)
      try {
        await updatePreferences(mergedPrefs({ density: value }))
      } catch (err) {
        setDensityState(previous)
        applyDensityAttr(previous)
        toast({
          title: 'Could not save density',
          description: 'Reverted to your previous selection.',
          variant: 'destructive',
        })
      }
    },
    [density, updatePreferences, mergedPrefs, toast],
  )

  // ── Language ───────────────────────────────────────────────────────────────
  const onLanguageChange = useCallback(
    async (next: string) => {
      const previous = language
      setLanguageState(next)
      try {
        await updatePreferences(mergedPrefs({ language: next }))
        // Back-compat: keep the legacy preferredLanguage field in sync.
        if (user?.uid) {
          try {
            await updatePreferredLanguage(user.uid, next)
          } catch {
            // Non-fatal: legacy back-compat best-effort only.
          }
        }
      } catch (err) {
        setLanguageState(previous)
        toast({
          title: 'Could not save language',
          description: 'Reverted to your previous selection.',
          variant: 'destructive',
        })
      }
    },
    [language, updatePreferences, mergedPrefs, user?.uid, toast],
  )

  return (
    <TabShell
      title="Appearance"
      description="Theme, density, and language for the TheWeddingBot interface."
    >
      {/* Theme card */}
      <Card className="p-6">
        <div className="mb-4">
          <h3 className="text-base font-semibold">Theme</h3>
          <p className="mt-1 text-xs text-foreground/90">
            Choose how TheWeddingBot looks. Your selection is applied instantly.
          </p>
        </div>
        <RadioGroup
          value={theme}
          onValueChange={onThemeChange}
          aria-label="Theme"
          className="grid gap-3 sm:grid-cols-3"
        >
          {THEME_OPTIONS.map(({ value, label, description, Icon }) => {
            const id = `theme-${value}`
            const selected = theme === value
            return (
              <Label
                key={value}
                htmlFor={id}
                data-active={selected}
                className="group flex min-h-11 cursor-pointer items-start gap-3 rounded-md border-0 bg-foreground/[0.04] p-4 text-left transition-colors hover:bg-foreground/[0.06] data-[active=true]:bg-primary/10 focus-within:ring-1 focus-within:ring-foreground/10"
              >
                <RadioGroupItem id={id} value={value} aria-label={label} className="mt-0.5" />
                <div className="flex flex-1 items-start gap-3">
                  <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 text-foreground/90" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground/90">{label}</div>
                    <p className="mt-0.5 text-xs text-foreground/90">{description}</p>
                  </div>
                </div>
              </Label>
            )
          })}
        </RadioGroup>
      </Card>

      {/* Density card */}
      <Card className="p-6">
        <div className="mb-4">
          <h3 className="text-base font-semibold">Density</h3>
          <p className="mt-1 text-xs text-foreground/90">
            Controls vertical rhythm across menus and lists.
          </p>
        </div>
        <RadioGroup
          value={density}
          onValueChange={onDensityChange}
          aria-label="Density"
          className="grid gap-3 sm:grid-cols-2"
        >
          {DENSITY_OPTIONS.map(({ value, label, description, Icon }) => {
            const id = `density-${value}`
            const selected = density === value
            return (
              <Label
                key={value}
                htmlFor={id}
                data-active={selected}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border-0 bg-foreground/[0.04] p-4 text-left transition-colors hover:bg-foreground/[0.06] data-[active=true]:bg-primary/10 focus-within:ring-1 focus-within:ring-foreground/10"
              >
                <RadioGroupItem id={id} value={value} aria-label={label} className="mt-0.5" />
                <div className="flex flex-1 items-start gap-3">
                  <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 text-foreground/90" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground/90">{label}</div>
                    <p className="mt-0.5 text-xs text-foreground/90">{description}</p>
                  </div>
                </div>
              </Label>
            )
          })}
        </RadioGroup>
      </Card>

      {/* Language card */}
      <Card className="p-6">
        <div className="mb-4">
          <h3 className="text-base font-semibold">Language</h3>
          <p className="mt-1 text-xs text-foreground/90">
            TheWeddingBot will try to reply in this language. Auto-detect lets the AI mirror
            whatever language you write in.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="language-select" className="text-sm font-medium">
            Preferred language
          </Label>
          <Select value={language} onValueChange={onLanguageChange}>
            <SelectTrigger
              id="language-select"
              aria-label="Preferred language"
              className="min-h-11 w-full bg-foreground/[0.04] text-foreground/90 focus-visible:ring-ring sm:max-w-xs"
            >
              <SelectValue placeholder="Select a language" />
            </SelectTrigger>
            <SelectContent className="bg-popover text-foreground/90">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <SelectItem
                  key={lang.code}
                  value={lang.code}
                  className="min-h-11 text-sm"
                >
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>
    </TabShell>
  )
}

export default AppearanceTab
