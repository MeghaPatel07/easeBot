import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
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
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-white/80">{label}</span>
        <span className="text-xs font-bold text-[#A17A63] bg-[#A17A63]/10 px-2 py-0.5 rounded-full min-w-[2rem] text-center">{value}</span>
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
        <span className="text-2xs text-white/30">{leftLabel}</span>
        <span className="text-2xs text-white/30">{rightLabel}</span>
      </div>
    </div>
  )
}

// ── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'identity', label: 'Identity', icon: User },
  { id: 'tone', label: 'Tone', icon: Sliders },
  { id: 'voice', label: 'Voice', icon: Volume2 },
] as const

type TabId = typeof TABS[number]['id']

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
}

// ── Main component ────────────────────────────────────────────────────────────

export function SettingsModal({ open, onClose }: Props) {
  const { user, profile } = useAuth()

  const [activeTab, setActiveTab] = useState<TabId>('identity')
  const [nickname, setNickname] = useState('')
  const [voiceId, setVoiceId] = useState('')
  const [toneSettings, setToneSettings] = useState<ToneSettings>(DEFAULT_TONE)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (open) {
      setNickname(profile?.nickname ?? '')
      setVoiceId(profile?.voiceId ?? '')
      setToneSettings(profile?.toneSettings ?? DEFAULT_TONE)
      setSaveState('idle')
      setActiveTab('identity')
    } else {
      previewAudioRef.current?.pause()
      setPreviewingVoiceId(null)
      setPreviewLoadingId(null)
    }
  }, [open, profile])

  const previewVoice = async (presetId: string, e: React.MouseEvent) => {
    e.stopPropagation()
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
      const audioUrl = await requestTTS({ text: preset.sampleText, voiceName: preset.geminiVoiceName, language })
      const audio = new Audio(audioUrl)
      previewAudioRef.current = audio
      setPreviewingVoiceId(presetId)
      audio.onended = () => { setPreviewingVoiceId(null); URL.revokeObjectURL(audioUrl) }
      audio.onerror = () => { setPreviewingVoiceId(null); URL.revokeObjectURL(audioUrl) }
      audio.play().catch(() => { setPreviewingVoiceId(null); URL.revokeObjectURL(audioUrl) })
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
      setTimeout(() => onClose(), 900)
    } catch (err) {
      console.error('Failed to save personalization:', err)
      setSaveState('idle')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-[520px] glass-panel rounded-2xl p-0 border border-white/[0.08] bg-[#0F0D0C]/90 backdrop-blur-2xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.05)] overflow-hidden">
        {/* Decorative blurs */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-h-[85dvh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-6 pt-6 pb-4">
            <p className="text-xs font-medium uppercase tracking-widest text-primary mb-2">Personalization</p>
            <h2 className="font-headline text-[1.5rem] leading-tight tracking-tight text-white">
              Make it <span className="text-primary">yours</span>
            </h2>
            <p className="text-xs text-white/40 mt-1.5">Customize how Viva interacts with you</p>
          </div>

          {/* Tab bar */}
          <div className="px-6 mb-1">
            <div className="flex gap-1 p-1 rounded-full bg-white/[0.04]">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-xs font-medium transition-all duration-200 ${
                    activeTab === id
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-white/40 hover:text-white/60 hover:bg-white/[0.06]'
                  }`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4">
            {/* ── Identity ── */}
            {activeTab === 'identity' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-white/50 ml-1">Nickname</label>
                  <p className="text-xs text-white/30 ml-1">What should the AI call you during conversations?</p>
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="e.g. Priya, Babe, The Bride"
                    className="w-full h-12 px-4 rounded-2xl bg-transparent border border-white/[0.12] text-sm text-white/90 placeholder:text-white/25 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="rounded-xl bg-gradient-to-br from-[#A17A63]/5 to-transparent border border-[#A17A63]/10 p-4">
                  <p className="text-xs text-white/50 leading-relaxed">
                    Your nickname helps create a more personal and warm conversation experience. You can change it anytime.
                  </p>
                </div>
              </div>
            )}

            {/* ── Tone ── */}
            {activeTab === 'tone' && (
              <div>
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4 mb-4">
                  <p className="text-xs text-white/45 leading-relaxed">
                    Adjust these sliders to shape how the AI communicates with you.
                  </p>
                </div>
                <div className="space-y-1">
                  <SliderRow label="Warm" leftLabel="Cool" rightLabel="Warm" value={toneSettings.warm} onChange={updateTone('warm')} />
                  <SliderRow label="Analytical" leftLabel="Intuitive" rightLabel="Analytical" value={toneSettings.analytical} onChange={updateTone('analytical')} />
                  <SliderRow label="Friendly" leftLabel="Formal" rightLabel="Friendly" value={toneSettings.friendly} onChange={updateTone('friendly')} />
                  <SliderRow label="Professional" leftLabel="Casual" rightLabel="Professional" value={toneSettings.professional} onChange={updateTone('professional')} />
                  <SliderRow label="Enthusiastic" leftLabel="Calm" rightLabel="Enthusiastic" value={toneSettings.enthusiastic} onChange={updateTone('enthusiastic')} />
                  <SliderRow label="Concise" leftLabel="Detailed" rightLabel="Concise" value={toneSettings.concise} onChange={updateTone('concise')} />
                  <SliderRow label="Quirky" leftLabel="Straight" rightLabel="Quirky" value={toneSettings.quirky} onChange={updateTone('quirky')} />
                  <SliderRow label="Candid" leftLabel="Diplomatic" rightLabel="Candid" value={toneSettings.candid} onChange={updateTone('candid')} />
                  <SliderRow label="Emojis" leftLabel="None" rightLabel="Lots" value={toneSettings.emojis} onChange={updateTone('emojis')} />
                  <SliderRow label="Headers & Lists" leftLabel="Prose" rightLabel="Structured" value={toneSettings.headers} onChange={updateTone('headers')} />
                </div>
              </div>
            )}

            {/* ── Voice ── */}
            {activeTab === 'voice' && (
              <div>
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4 mb-4">
                  <p className="text-xs text-white/45 leading-relaxed">
                    Choose a voice for AI audio responses.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {VOICE_PRESETS.map((preset) => {
                    const isSelected = voiceId === preset.id
                    const isPreviewing = previewingVoiceId === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setVoiceId(preset.id)}
                        className={`rounded-xl p-3.5 cursor-pointer text-left transition-all duration-200 ${
                          isSelected
                            ? 'bg-gradient-to-br from-[#A17A63]/15 to-[#D6C1C7]/5 border border-[#A17A63]/30 shadow-md shadow-[#A17A63]/10'
                            : 'bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-white/90">{preset.name}</span>
                            <span className={`text-3xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                              preset.gender === 'female'
                                ? 'bg-pink-500/15 text-pink-300'
                                : 'bg-blue-500/15 text-blue-300'
                            }`}>
                              {preset.gender}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              role="button"
                              title={isPreviewing ? 'Stop preview' : 'Preview voice'}
                              onClick={(e) => previewVoice(preset.id, e)}
                              className={`h-7 w-7 rounded-full flex items-center justify-center transition-all ${
                                isPreviewing
                                  ? 'bg-[#A17A63] text-white shadow-md shadow-[#A17A63]/30'
                                  : 'text-white/35 hover:text-[#A17A63] hover:bg-[#A17A63]/10'
                              }`}
                            >
                              {previewLoadingId === preset.id
                                ? <Loader2 size={11} className="animate-spin" />
                                : isPreviewing
                                  ? <Square size={10} fill="currentColor" />
                                  : <Volume2 size={13} />}
                            </span>
                            {isSelected && (
                              <div className="h-5 w-5 rounded-full bg-[#A17A63] flex items-center justify-center">
                                <Check size={11} className="text-white" />
                              </div>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-white/35 leading-relaxed">{preset.description}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-white/[0.06] bg-white/[0.02]">
            <button
              onClick={onClose}
              disabled={saveState === 'saving'}
              className="px-5 h-10 rounded-full text-sm font-medium text-white/50 hover:text-white/70 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saveState !== 'idle'}
              className={`px-6 h-10 rounded-full text-sm font-medium transition-all min-w-[100px] ${
                saveState === 'saved'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 disabled:opacity-60'
              }`}
            >
              {saveState === 'saving' && (
                <span className="flex items-center gap-1.5">
                  <Loader2 size={14} className="animate-spin" /> Saving...
                </span>
              )}
              {saveState === 'saved' && (
                <span className="flex items-center gap-1.5">
                  <Check size={14} /> Saved
                </span>
              )}
              {saveState === 'idle' && 'Save Changes'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
