// AiBehaviorTab — Sprint 2 (Aarav). PRD §5 / §6.
// Migrates the Tone + Voice surfaces from the existing SettingsModal so users
// can do everything here that they could do in the legacy modal. We REUSE
// `savePersonalization` from settingsService — no new persistence code.
//
// SettingsModal.tsx remains intact and is still mounted; this tab is the
// canonical surface going forward but does not delete the legacy entry point.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Loader2,
  RotateCcw,
  Square as SquareIcon,
  Volume2,
} from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'

import { useAuth } from '@/contexts/AuthContext'
import { useAccount } from '@/hooks/useAccount'
import { useToast } from '@/hooks/use-toast'
import { updatePreferredLanguage } from '@/services/authService'
import { SUPPORTED_LANGUAGES } from '@/components/chat/constants'
// REUSE: existing persistence helper. Do NOT duplicate or replace.
// settingsService.ts:5 — savePersonalization(uid, { nickname?, voiceId?, toneSettings? })
import { savePersonalization, getLocalVoiceId, setLocalVoiceId } from '@/services/settingsService'
// REUSE: existing voice preset list + lookup. Do NOT redeclare in this file.
// voicePresets.ts:19 — VOICE_PRESETS, voicePresets.ts — getVoicePreset
import { VOICE_PRESETS, getVoicePreset } from '@/services/voicePresets'
// REUSE: existing TTS request used by SettingsModal voice preview.
import { requestTTS } from '@/services/ttsService'
import { MODE_CONFIG } from '@/components/chat/constants'
import type { ToneSettings, UserPreferences } from '@/types'

import TabShell from './_TabShell'

// ── Tone defaults (mirror SettingsModal.tsx:13–24) ───────────────────────────
// Kept locally to match the legacy UX exactly; the source-of-truth defaults
// live in SettingsModal which we are intentionally not modifying.
const DEFAULT_TONE: ToneSettings = {
  warm: 50,
  analytical: 30,
  friendly: 70,
  professional: 50,
  enthusiastic: 50,
  concise: 50,
  quirky: 20,
  candid: 50,
  emojis: 30,
  headers: 40,
}

interface SliderDef {
  key: keyof ToneSettings
  label: string
  leftLabel: string
  rightLabel: string
}

// Labels lifted verbatim from SettingsModal.tsx:232–241.
const TONE_SLIDERS: SliderDef[] = [
  { key: 'warm', label: 'Warm', leftLabel: 'Cool', rightLabel: 'Warm' },
  { key: 'analytical', label: 'Analytical', leftLabel: 'Intuitive', rightLabel: 'Analytical' },
  { key: 'friendly', label: 'Friendly', leftLabel: 'Formal', rightLabel: 'Friendly' },
  { key: 'professional', label: 'Professional', leftLabel: 'Casual', rightLabel: 'Professional' },
  { key: 'enthusiastic', label: 'Enthusiastic', leftLabel: 'Calm', rightLabel: 'Enthusiastic' },
  { key: 'concise', label: 'Concise', leftLabel: 'Detailed', rightLabel: 'Concise' },
  { key: 'quirky', label: 'Quirky', leftLabel: 'Straight', rightLabel: 'Quirky' },
  { key: 'candid', label: 'Candid', leftLabel: 'Diplomatic', rightLabel: 'Candid' },
  { key: 'emojis', label: 'Emojis', leftLabel: 'None', rightLabel: 'Lots' },
  { key: 'headers', label: 'Headers & Lists', leftLabel: 'Prose', rightLabel: 'Structured' },
]

// ── Component ────────────────────────────────────────────────────────────────

export function AiBehaviorTab() {
  const { user, profile } = useAuth()
  const { profile: accountProfile, updatePreferences } = useAccount()
  const { toast } = useToast()

  // ── Tone state ────────────────────────────────────────────────────────────
  const initialTone = useMemo<ToneSettings>(
    () => profile?.toneSettings ?? DEFAULT_TONE,
    [profile?.toneSettings],
  )
  const [tone, setTone] = useState<ToneSettings>(initialTone)
  const [savingTone, setSavingTone] = useState(false)

  useEffect(() => setTone(initialTone), [initialTone])

  const toneDirty = useMemo(
    () => (Object.keys(tone) as (keyof ToneSettings)[]).some((k) => tone[k] !== initialTone[k]),
    [tone, initialTone],
  )

  const updateTone = (key: keyof ToneSettings) => (value: number) =>
    setTone((p) => ({ ...p, [key]: value }))

  const handleSaveTone = async () => {
    if (!user || !toneDirty || savingTone) return
    setSavingTone(true)
    try {
      await savePersonalization(user.uid, { toneSettings: tone })
      toast({
        title: 'Tone updated',
        description: 'TheWeddingBot will use your new conversation style.',
      })
    } catch (err) {
      console.error('[AiBehaviorTab] tone save failed:', err)
      toast({
        title: 'Could not save tone',
        description: 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSavingTone(false)
    }
  }

  const handleResetTone = async () => {
    if (!user) return
    setTone(DEFAULT_TONE)
    setSavingTone(true)
    try {
      await savePersonalization(user.uid, { toneSettings: DEFAULT_TONE })
      toast({ title: 'Tone reset', description: 'All sliders are back to defaults.' })
    } catch (err) {
      console.error('[AiBehaviorTab] tone reset failed:', err)
      toast({
        title: 'Could not reset',
        description: 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSavingTone(false)
    }
  }

  // ── Voice state ───────────────────────────────────────────────────────────
  // Prefer the Firestore profile value; fall back to the guest localStorage
  // cache so unauthenticated users still see their previously chosen voice.
  const initialVoiceId = profile?.voiceId ?? getLocalVoiceId() ?? ''
  const [voiceId, setVoiceId] = useState(initialVoiceId)
  const [savingVoice, setSavingVoice] = useState(false)
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => setVoiceId(initialVoiceId), [initialVoiceId])
  useEffect(
    () => () => {
      // Cleanup any in-flight preview audio when leaving the tab.
      previewAudioRef.current?.pause()
      previewAudioRef.current = null
    },
    [],
  )

  const voiceDirty = voiceId !== initialVoiceId

  const handleSaveVoice = async () => {
    if (!voiceDirty || savingVoice) return
    setSavingVoice(true)
    try {
      // Always mirror to localStorage so playback can read it instantly and
      // guests get persistence across sessions.
      setLocalVoiceId(voiceId || null)
      if (user) {
        await savePersonalization(user.uid, { voiceId })
      }
      toast({ title: 'Voice updated', description: 'Audio replies will use your new voice.' })
    } catch (err) {
      console.error('[AiBehaviorTab] voice save failed:', err)
      toast({
        title: 'Could not save voice',
        description: 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSavingVoice(false)
    }
  }

  // Preview logic mirrors SettingsModal.tsx:108–136 — same TTS service, same
  // language fallback, same single-audio-at-a-time behaviour.
  const previewVoice = async (presetId: string) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
      previewAudioRef.current = null
    }
    if (previewingVoiceId === presetId) {
      setPreviewingVoiceId(null)
      return
    }
    const preset = getVoicePreset(presetId)
    if (!preset) return
    const storedLang = profile?.preferredLanguage
    const language = storedLang && storedLang !== 'auto' ? storedLang : 'en'
    setPreviewLoadingId(presetId)
    try {
      const audioUrl = await requestTTS({
        text: preset.sampleText,
        voiceName: preset.geminiVoiceName,
        language,
      })
      const audio = new Audio(audioUrl)
      previewAudioRef.current = audio
      setPreviewingVoiceId(presetId)
      const cleanup = () => {
        setPreviewingVoiceId(null)
        URL.revokeObjectURL(audioUrl)
      }
      audio.onended = cleanup
      audio.onerror = cleanup
      audio.play().catch(cleanup)
    } catch (err) {
      console.error('[AiBehaviorTab] preview failed:', err)
      setPreviewingVoiceId(null)
    } finally {
      setPreviewLoadingId(null)
    }
  }

  // ── Language ──────────────────────────────────────────────────────────────
  // Moved over from the (now hidden) Appearance tab. Persists through the same
  // `updatePreferences` pipeline and keeps the legacy `preferredLanguage` field
  // in sync so older code paths that read it keep working.
  const initialLanguage =
    accountProfile?.preferences?.language ??
    accountProfile?.preferredLanguage ??
    profile?.preferredLanguage ??
    'auto'
  const [language, setLanguageState] = useState<string>(initialLanguage)

  useEffect(() => {
    const l =
      accountProfile?.preferences?.language ??
      accountProfile?.preferredLanguage ??
      profile?.preferredLanguage ??
      'auto'
    setLanguageState(l)
  }, [
    accountProfile?.preferences?.language,
    accountProfile?.preferredLanguage,
    profile?.preferredLanguage,
  ])

  const onLanguageChange = async (next: string) => {
    const previous = language
    setLanguageState(next)
    const merged: UserPreferences = {
      ...(accountProfile?.preferences ?? {}),
      language: next,
    }
    try {
      await updatePreferences(merged)
      if (user?.uid) {
        try {
          await updatePreferredLanguage(user.uid, next)
        } catch {
          // Best-effort legacy back-compat.
        }
      }
      toast({
        title: 'Language updated',
        description: 'TheWeddingBot will reply in your new preferred language.',
      })
    } catch (err) {
      setLanguageState(previous)
      toast({
        title: 'Could not save language',
        description: 'Reverted to your previous selection.',
        variant: 'destructive',
      })
    }
  }

  // ── Default mode (placeholder — no profile field yet) ────────────────────
  const modeOptions = MODE_CONFIG

  return (
    <TabShell
      title="AI Behavior"
      description="Tone, voice, and the default mode TheWeddingBot reaches for first."
    >
      {/* ── Tone sliders ─────────────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-foreground/90">
              Conversation tone
            </h3>
            <p className="mt-1 text-xs text-foreground/90">
              Shape how TheWeddingBot writes — every slider runs 0 to 100.
            </p>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 rounded-full border-0 bg-foreground/[0.04] text-foreground/90 hover:bg-foreground/[0.06] focus-visible:ring-ring focus-visible:ring-offset-background"
              >
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Reset
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border border-foreground/[0.08] bg-card-elevated/90 backdrop-blur-2xl text-foreground/90 shadow-modal">
              <AlertDialogHeader>
                <AlertDialogTitle>Reset tone to defaults?</AlertDialogTitle>
                <AlertDialogDescription>
                  All ten sliders will return to neutral starting values. This
                  will save immediately and overwrite your current tone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-10 rounded-full">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleResetTone}
                  className="h-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Reset to defaults
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {TONE_SLIDERS.map((s) => (
            <div key={s.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={`tone-${s.key}`} className="text-sm font-medium">
                  {s.label}
                </Label>
                <span
                  aria-live="polite"
                  className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-2xs font-semibold text-foreground/90"
                >
                  {tone[s.key]}
                </span>
              </div>
              <Slider
                id={`tone-${s.key}`}
                aria-label={s.label}
                value={[tone[s.key]]}
                onValueChange={([v]) => updateTone(s.key)(v)}
                min={0}
                max={100}
                step={5}
              />
              <div className="flex justify-between text-2xs text-foreground/90">
                <span>{s.leftLabel}</span>
                <span>{s.rightLabel}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {toneDirty && (
            <span className="text-xs text-foreground/90">Unsaved changes</span>
          )}
          <Button
            type="button"
            onClick={handleSaveTone}
            disabled={!toneDirty || savingTone}
            className="h-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring focus-visible:ring-offset-background"
          >
            {savingTone ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              'Save tone'
            )}
          </Button>
        </div>
      </Card>

      {/* ── Voice ────────────────────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-5">
          <h3 className="text-base font-semibold text-foreground/90">Voice</h3>
          <p className="mt-1 text-xs text-foreground/90">
            Pick a voice for spoken replies. Tap the speaker to preview.
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Voice preset"
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
        >
          {VOICE_PRESETS.map((preset) => {
            const isSelected = voiceId === preset.id
            const isPreviewing = previewingVoiceId === preset.id
            const isLoading = previewLoadingId === preset.id
            return (
              <div
                key={preset.id}
                className={`flex h-100 rounded-full items-start gap-3 rounded-md p-4 transition-colors ${
                  isSelected
                    ? 'bg-primary/10'
                    : 'bg-foreground/[0.04] hover:bg-foreground/[0.06]'
                }`}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setVoiceId(preset.id)}
                  className="flex flex-1 flex-col items-start text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground/90">
                      {preset.name}
                    </span>
                    <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-foreground/90">
                      {preset.gender}
                    </span>
                    {isSelected && (
                      <Check
                        className="h-4 w-4 text-primary"
                        aria-label="Selected"
                      />
                    )}
                  </div>
                  <span className="mt-1 text-xs text-foreground/90">
                    {preset.description}
                  </span>
                </button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={isPreviewing ? `Stop preview of ${preset.name}` : `Preview ${preset.name}`}
                  onClick={() => previewVoice(preset.id)}
                  className="h-10 rounded-full min-w-11 shrink-0 text-foreground/90 hover:text-foreground/90 focus-visible:ring-ring focus-visible:ring-offset-background"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : isPreviewing ? (
                    <SquareIcon className="h-4 w-4" fill="currentColor" aria-hidden="true" />
                  ) : (
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </div>
            )
          })}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {voiceDirty && (
            <span className="text-xs text-foreground/90">Unsaved changes</span>
          )}
          <Button
            type="button"
            onClick={handleSaveVoice}
            disabled={!voiceDirty || savingVoice}
            className="h-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring focus-visible:ring-offset-background"
          >
            {savingVoice ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              'Save voice'
            )}
          </Button>
        </div>
      </Card>

      {/* ── Language (moved from Appearance) ─────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-4">
          <h3 className="text-base font-semibold">Language</h3>
          <p className="mt-1 text-xs text-foreground/90">
            TheWeddingBot will try to reply in this language. Auto-detect lets the AI
            mirror whatever language you write in.
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
              className="h-10 rounded-full w-full bg-foreground/[0.04] text-foreground/90 focus-visible:ring-ring sm:max-w-xs"
            >
              <SelectValue placeholder="Select a language" />
            </SelectTrigger>
            <SelectContent className="bg-popover text-foreground/90">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <SelectItem
                  key={lang.code}
                  value={lang.code}
                  className="h-10 rounded-full text-sm"
                >
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* ── Default mode (placeholder) ──────────────────────────────────── */}
      {/* <Card className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-foreground/90">
              Default AI mode
            </h3>
            <p className="mt-1 text-xs text-foreground/90">
              Which mode TheWeddingBot starts new chats in. Coming soon — saving is
              disabled until the backend wires this up.
            </p>
          </div>
          <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-foreground/90">
            Coming soon
          </span>
        </div>

        <div className="space-y-2">
          <Label htmlFor="default-mode" className="text-sm font-medium">
            Mode
          </Label>
          <Select disabled value="auto">
            <SelectTrigger
              id="default-mode"
              aria-label="Default AI mode"
              className="h-10 rounded-full bg-foreground/[0.04] text-foreground/90 focus-visible:ring-ring"
            >
              <SelectValue placeholder="Auto" />
            </SelectTrigger>
            <SelectContent className="bg-popover text-foreground/90">
              {modeOptions.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card> */}
    </TabShell>
  )
}

export default AiBehaviorTab
