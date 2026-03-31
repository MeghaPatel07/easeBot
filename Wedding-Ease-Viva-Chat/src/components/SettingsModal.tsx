import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { useAuth } from '@/contexts/AuthContext'
import { savePersonalization } from '@/services/settingsService'
import { VOICE_PRESETS, getVoicePreset } from '@/services/voicePresets'
import { requestTTS } from '@/services/ttsService'
import type { ToneSettings, UserPersonalization } from '@/types'
import { User, Sliders, Volume2, Check, Square, Loader2 } from 'lucide-react'

// ── Defaults ─────────────────────────────────────────────────────────────────

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

// ── SliderRow helper ──────────────────────────────────────────────────────────

function SliderRow({
  label,
  leftLabel,
  rightLabel,
  value,
  onChange,
}: {
  label: string
  leftLabel: string
  rightLabel: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="mb-5">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm font-medium text-stone-700">{label}</span>
        <span className="text-xs font-semibold text-primary w-8 text-right">{value}</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={0}
        max={100}
        step={5}
        className="mb-1"
      />
      <div className="flex justify-between">
        <span className="text-2xs text-stone-400">{leftLabel}</span>
        <span className="text-2xs text-stone-400">{rightLabel}</span>
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
}

// ── Main component ────────────────────────────────────────────────────────────

export function SettingsModal({ open, onClose }: Props) {
  const { user, profile } = useAuth()

  const [nickname, setNickname] = useState('')
  const [voiceId, setVoiceId] = useState('')
  const [toneSettings, setToneSettings] = useState<ToneSettings>(DEFAULT_TONE)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  // Populate from profile whenever the modal opens or profile changes
  useEffect(() => {
    if (open) {
      setNickname(profile?.nickname ?? '')
      setVoiceId(profile?.voiceId ?? '')
      setToneSettings(profile?.toneSettings ?? DEFAULT_TONE)
      setSaveState('idle')
    } else {
      previewAudioRef.current?.pause()
      setPreviewingVoiceId(null)
      setPreviewLoadingId(null)
    }
  }, [open, profile])

  const previewVoice = async (presetId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    // Stop any playing preview
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
    const language = (storedLang && storedLang !== 'auto') ? storedLang : 'en'

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
      audio.onended = () => { setPreviewingVoiceId(null); URL.revokeObjectURL(audioUrl) }
      audio.onerror = () => { setPreviewingVoiceId(null); URL.revokeObjectURL(audioUrl) }
      audio.play().catch(() => {
        setPreviewingVoiceId(null);
        URL.revokeObjectURL(audioUrl);
      })
    } catch {
      setPreviewingVoiceId(null)
    } finally {
      setPreviewLoadingId(null)
    }
  }

  const updateTone = (key: keyof ToneSettings) => (value: number) => {
    setToneSettings((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (!user) return

    setSaveState('saving')

    const personalization: UserPersonalization = {
      nickname: nickname.trim() || undefined,
      voiceId,
      toneSettings,
    }

    try {
      await savePersonalization(user.uid, personalization)
      setSaveState('saved')
      setTimeout(() => {
        onClose()
      }, 900)
    } catch (err) {
      console.error('Failed to save personalization:', err)
      setSaveState('idle')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg w-full rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-lg font-semibold text-stone-800">
            Personalize Your Experience
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="identity" className="w-full">
          {/* Tab list */}
          <TabsList className="w-full rounded-none border-b border-stone-100 bg-white px-6 h-12 gap-1">
            <TabsTrigger
              value="identity"
              className="flex items-center gap-1.5 text-sm data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              <User size={14} />
              Identity
            </TabsTrigger>
            <TabsTrigger
              value="tone"
              className="flex items-center gap-1.5 text-sm data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              <Sliders size={14} />
              Tone
            </TabsTrigger>
            <TabsTrigger
              value="voice"
              className="flex items-center gap-1.5 text-sm data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              <Volume2 size={14} />
              Voice
            </TabsTrigger>
          </TabsList>

          {/* ── Identity Tab ── */}
          <TabsContent
            value="identity"
            className="max-h-[60vh] overflow-y-auto px-6 py-5 focus:outline-none"
          >
            <div className="mb-3">
              <label className="block text-sm font-medium text-stone-700 mb-1.5">
                Nickname
              </label>
              <p className="text-xs text-stone-400 mb-2">
                What should the AI call you during conversations?
              </p>
              <Input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="e.g. Priya, Babe, The Bride"
                className="border-stone-200 focus-visible:ring-primary text-base sm:text-sm"
              />
            </div>
          </TabsContent>

          {/* ── Tone Tab ── */}
          <TabsContent
            value="tone"
            className="max-h-[60vh] overflow-y-auto px-6 py-5 focus:outline-none"
          >
            <p className="text-xs text-stone-400 mb-4">
              Adjust these sliders to shape how the AI communicates with you.
            </p>
            <SliderRow
              label="Warm"
              leftLabel="Cool"
              rightLabel="Warm"
              value={toneSettings.warm}
              onChange={updateTone('warm')}
            />
            <SliderRow
              label="Analytical"
              leftLabel="Intuitive"
              rightLabel="Analytical"
              value={toneSettings.analytical}
              onChange={updateTone('analytical')}
            />
            <SliderRow
              label="Friendly"
              leftLabel="Formal"
              rightLabel="Friendly"
              value={toneSettings.friendly}
              onChange={updateTone('friendly')}
            />
            <SliderRow
              label="Professional"
              leftLabel="Casual"
              rightLabel="Professional"
              value={toneSettings.professional}
              onChange={updateTone('professional')}
            />
            <SliderRow
              label="Enthusiastic"
              leftLabel="Calm"
              rightLabel="Enthusiastic"
              value={toneSettings.enthusiastic}
              onChange={updateTone('enthusiastic')}
            />
            <SliderRow
              label="Concise"
              leftLabel="Detailed"
              rightLabel="Concise"
              value={toneSettings.concise}
              onChange={updateTone('concise')}
            />
            <SliderRow
              label="Quirky"
              leftLabel="Straight"
              rightLabel="Quirky"
              value={toneSettings.quirky}
              onChange={updateTone('quirky')}
            />
            <SliderRow
              label="Candid"
              leftLabel="Diplomatic"
              rightLabel="Candid"
              value={toneSettings.candid}
              onChange={updateTone('candid')}
            />
            <SliderRow
              label="Emojis"
              leftLabel="None"
              rightLabel="Lots 😄"
              value={toneSettings.emojis}
              onChange={updateTone('emojis')}
            />
            <SliderRow
              label="Headers & Lists"
              leftLabel="Prose"
              rightLabel="Structured"
              value={toneSettings.headers}
              onChange={updateTone('headers')}
            />
          </TabsContent>

          {/* ── Voice Tab ── */}
          <TabsContent
            value="voice"
            className="max-h-[60vh] overflow-y-auto px-6 py-5 focus:outline-none"
          >
            <p className="text-xs text-stone-400 mb-4">
              Choose a voice for AI audio responses. Availability depends on your device.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {VOICE_PRESETS.map((preset) => {
                const isSelected = voiceId === preset.id
                const isPreviewing = previewingVoiceId === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setVoiceId(preset.id)}
                    className={[
                      'rounded-xl border-2 p-3 cursor-pointer text-left transition-colors',
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : 'border-stone-200 bg-white hover:border-stone-300',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-stone-800">{preset.name}</span>
                        <span className={`text-3xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                          preset.gender === 'female'
                            ? 'bg-pink-100 text-pink-500'
                            : 'bg-blue-100 text-blue-500'
                        }`}>
                          {preset.gender}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          role="button"
                          title={isPreviewing ? 'Stop preview' : 'Preview voice'}
                          onClick={(e) => previewVoice(preset.id, e)}
                          className={[
                            'h-6 w-6 rounded-full flex items-center justify-center transition-colors',
                            isPreviewing
                              ? 'bg-primary text-white'
                              : 'text-stone-400 hover:text-primary hover:bg-primary/10',
                          ].join(' ')}
                        >
                          {previewLoadingId === preset.id
                            ? <Loader2 size={10} className="animate-spin" />
                            : isPreviewing
                              ? <Square size={10} fill="currentColor" />
                              : <Volume2 size={12} />}
                        </span>
                        {isSelected && <Check size={14} className="text-primary" />}
                      </div>
                    </div>
                    <span className="text-xs text-stone-500">{preset.description}</span>
                  </button>
                )
              })}
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-stone-100">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saveState === 'saving'}
            className="text-stone-500 hover:text-stone-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveState !== 'idle'}
            className="bg-primary text-white hover:bg-primary-muted min-w-[90px]"
          >
            {saveState === 'saving' && 'Saving...'}
            {saveState === 'saved' && (
              <span className="flex items-center gap-1">
                <Check size={14} /> Saved
              </span>
            )}
            {saveState === 'idle' && 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
