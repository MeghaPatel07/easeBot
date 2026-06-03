import React, { useState, useEffect, useRef } from 'react';
import {
  Send, Image as ImageIcon, StopCircle, Mic, Loader2, ChevronDown, ChevronUp, X, Check, Plus,
  Paperclip, FileText, ListChecks, Calendar, File as FileIcon, ArrowUp,
} from 'lucide-react';
import { MODE_CONFIG, modeConfig, type ModeOrAuto } from './constants';
import { useIsMobile } from '@/hooks/use-mobile';
import { useChatAttachments, type ChatAttachment, type ChatAttachmentKind } from '@/contexts/ChatAttachmentsContext';
import AttachmentPicker from './AttachmentPicker';

// ─────────────────────────────────────────────────────────────────────────────
// ChatInput — text input, image attachment, voice, mode selector, send/stop
// ─────────────────────────────────────────────────────────────────────────────
export interface ChatInputProps {
  inputText: string;
  onInputChange: (v: string) => void;
  /**
   * Fired when the user hits send. Receives the current text plus any
   * attachments currently staged in ChatAttachmentsContext. The parent owns
   * clearing the tray (only after a successful send) so a failed send
   * doesn't make the user re-pick attachments.
   */
  onSend: (text: string, attachments: ChatAttachment[]) => void;
  onStop?: () => void;
  isTyping: boolean;
  placeholder: string;
  isRecording: boolean;
  voiceState: 'idle' | 'recording' | 'transcribing' | 'requesting';
  onMicClick: () => void;
  attachedImage?: { preview: string } | null;
  onAttachImage: () => void;
  onRemoveImage: () => void;
  selectedMode?: ModeOrAuto;
  onModeChange?: (mode: ModeOrAuto) => void;
  recordingDuration?: number;
  onCancelRecording?: () => void;
  /** Live mic amplitudes (0-255) for the recording waveform. */
  amplitudes?: number[];
  className?: string;
}

// Auto-grow caps — the textarea grows freely up to these limits, then shows
// an expand button. Expanded mode raises the cap significantly.
const MAX_HEIGHT_DESKTOP = 200;   // ~10 lines
const MAX_HEIGHT_MOBILE = 160;    // ~8 lines
const EXPANDED_MAX_DESKTOP = 480; // ~24 lines
const EXPANDED_MAX_MOBILE = 360;  // ~18 lines

// Icon lookup for attachment chips — matches ChatAttachmentKind discriminator.
const ATTACHMENT_ICONS: Record<ChatAttachmentKind, React.ElementType> = {
  note: FileText,
  checklist: ListChecks,
  timeline: Calendar,
  image: ImageIcon,
  file: FileIcon,
};

const truncate = (s: string, n = 30) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

const ChatInput = ({
  inputText, onInputChange, onSend, onStop, isTyping, placeholder,
  isRecording, voiceState, onMicClick, attachedImage, onAttachImage, onRemoveImage,
  selectedMode, onModeChange, recordingDuration, onCancelRecording, amplitudes,
  className = "max-w-3xl mx-auto w-full",
}: ChatInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  // Unified mobile breakpoint (768px) — was previously hardcoded 640px here
  // while use-mobile.tsx used 768. One source of truth now.
  const isMobileViewport = useIsMobile();

  // Attachment tray — sourced from ChatAttachmentsContext. If the provider
  // isn't mounted yet (Wave-1 state), the hook returns an empty array + no-op
  // mutators so this just renders nothing. Note: we intentionally do NOT
  // clear the tray from here — the parent (Index.tsx) clears it only after
  // sendMessage resolves successfully, so a failed send keeps the user's
  // attachments intact for retry.
  const { attachments, removeAttachment } = useChatAttachments();
  const collapsedMax = isMobileViewport ? MAX_HEIGHT_MOBILE : MAX_HEIGHT_DESKTOP;
  const expandedMax = isMobileViewport ? EXPANDED_MAX_MOBILE : EXPANDED_MAX_DESKTOP;
  const maxHeight = isExpanded ? expandedMax : collapsedMax;

  const currentMode = selectedMode ? modeConfig(selectedMode) : MODE_CONFIG[0];

  // Auto-resize textarea to fit content, up to maxHeight then scroll.
  // Track when content exceeds the collapsed cap to show the expand button.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const sh = el.scrollHeight;
    el.style.height = `${Math.min(sh, maxHeight)}px`;
    setIsOverflowing(sh > collapsedMax);
  }, [inputText, maxHeight, collapsedMax]);

  // Collapse back when input is cleared
  useEffect(() => {
    if (!inputText) setIsExpanded(false);
  }, [inputText]);

  // Close mode dropdown on outside click
  useEffect(() => {
    if (!showModeDropdown) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !target.closest('[data-mode-dropdown]')) {
        setShowModeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showModeDropdown]);

  const hasContent = inputText.trim().length > 0 || !!attachedImage;
  const isVoiceActive = voiceState === 'recording' || voiceState === 'requesting' || voiceState === 'transcribing';
  const isTranscribing = voiceState === 'transcribing';
  // Render a stable 64-bar lane regardless of actual amplitude sample count.
  // We RIGHT-align the incoming waveform history (newest on the right) and
  // pad the left with zero-height placeholder bars so the lane width is
  // constant — matching ChatGPT's dense "bars scrolling leftward" feel.
  const WAVEFORM_BARS = 64;
  const displayBars: number[] = (() => {
    const src = amplitudes ?? [];
    if (src.length >= WAVEFORM_BARS) return src.slice(src.length - WAVEFORM_BARS);
    return new Array(WAVEFORM_BARS - src.length).fill(0).concat(src);
  })();
  const formatDuration = (s?: number): string => {
    if (s == null) return '0:00';
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  // Forward the current text + staged attachments to the parent. The parent
  // owns threading `attachments` into sendMessage() and clearing the tray on
  // success — see rationale above.
  const handleSend = () => {
    onSend(inputText, attachments);
  };

  // Shared mode-dropdown menu. On mobile we render it slightly wider + center
  // so it sits comfortably within the viewport above the chip. The parent
  // wrapper deliberately avoids overflow:hidden so the absolute popover isn't
  // clipped (this was the root cause of the "Auto shows nothing on mobile"
  // bug — an ancestor `overflow-x-auto` was clipping the menu).
  const modeDropdownMenuJSX = showModeDropdown ? (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 sm:left-auto sm:right-0 sm:translate-x-0 mb-2 w-[min(18rem,calc(100vw-2rem))] max-h-[60dvh] overflow-y-auto custom-scrollbar rounded-xl bg-card-elevated/95 backdrop-blur-xl border border-foreground/[0.1] shadow-dropdown-sm py-1.5 z-[60] animate-in fade-in slide-in-from-bottom-2 duration-150">
      {MODE_CONFIG.map(m => {
        const isActive = selectedMode === m.key;
        return (
          <button
            key={m.key}
            onClick={() => { onModeChange?.(m.key); setShowModeDropdown(false); }}
            className={`w-full flex items-start gap-3 px-3.5 py-2.5 text-left transition-colors ${isActive ? 'bg-foreground/[0.08]' : 'hover:bg-foreground/[0.05]'}`}
          >
            <m.icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isActive ? 'text-primary' : 'text-foreground/35'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${isActive ? 'text-primary' : 'text-foreground/75'}`}>{m.label}</span>
                {isActive && <Check className="h-3 w-3 text-primary" />}
              </div>
              <p className="text-2xs text-foreground/35 leading-snug mt-0.5">{m.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div className={className}>
      {/* MOBILE-ONLY mode chip row, ABOVE the input.
          IMPORTANT: no overflow-x-auto on this wrapper — it would clip the
          absolute-positioned dropdown above the chip and the sub-agent list
          would render off-screen on mobile (previous bug). */}
      {onModeChange && (
        <div className="flex sm:hidden items-center justify-center gap-2 mb-2 px-0.5">
          <div className="relative flex-shrink-0" data-mode-dropdown>
            <button
              type="button"
              onClick={() => setShowModeDropdown(v => !v)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-foreground/[0.06] border border-foreground/[0.1] text-xs font-medium text-foreground/75 hover:bg-foreground/[0.1] active:scale-95 transition-all"
            >
              <currentMode.icon className="h-3.5 w-3.5 text-primary/80" />
              <span>{currentMode.label}</span>
              <ChevronDown className={`h-3 w-3 text-foreground/50 transition-transform ${showModeDropdown ? 'rotate-180' : ''}`} />
            </button>
            {modeDropdownMenuJSX}
          </div>
        </div>
      )}

      {/* Attachment chip row — appears above the textarea, below the mode chip.
          Only renders when the tray has entries. Horizontal scroll is contained
          to this row via overflow-x-auto + min-w-0; never leaks to the page. */}
      {attachments.length > 0 && (
        <div className="mb-2 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-1.5 w-max px-0.5">
            {attachments.map(att => {
              const Icon = ATTACHMENT_ICONS[att.kind] ?? FileIcon;
              return (
                <div
                  key={`${att.kind}:${att.id}`}
                  className="flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-full bg-foreground/[0.08] border border-foreground/[0.12] text-xs text-foreground/80 flex-shrink-0 max-w-[220px]"
                  title={att.preview ?? att.title}
                >
                  <Icon className="h-3.5 w-3.5 text-primary/80 flex-shrink-0" />
                  <span className="truncate">{truncate(att.title)}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id, att.kind)}
                    aria-label={`Remove ${att.title}`}
                    className="h-5 w-5 flex items-center justify-center rounded-full text-foreground/40 hover:text-foreground/80 hover:bg-foreground/[0.1] transition-colors flex-shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Mobile layout: [ + ]  [ input pill ]  ─────────────────────── */}
      {/* ── Desktop layout: [ input pill with + inside ]  ──────────────── */}
      <div className="flex items-end gap-2.5 sm:gap-0">

        {/* Mobile attachment picker — OUTSIDE the pill on mobile, hidden on desktop.
            Opens a menu: Note | Checklist | Timeline | Gallery | Upload image.
            "Upload image" falls through to onAttachImage so the existing
            device-file-picker flow is preserved. */}
        <div className="sm:hidden flex-shrink-0">
          <AttachmentPicker
            onUploadImage={onAttachImage}
            triggerClassName="h-11 w-11 flex items-center justify-center rounded-[22px] border border-foreground/[0.12] bg-foreground/[0.08] backdrop-blur-xl text-foreground/55 hover:text-primary hover:bg-foreground/[0.12] active:scale-95 transition-all flex-shrink-0 shadow-lg shadow-black/20"
            TriggerIcon={Plus}
            triggerIconClassName="h-5 w-5"
          />
        </div>

        {/* ── Input pill ───────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 bg-foreground/[0.08] backdrop-blur-xl rounded-[22px] sm:rounded-2xl  sm:p-1.5 shadow-lg shadow-black/20 border border-foreground/[0.12] input-glow transition-shadow duration-300">

          {/* ── ChatGPT-style voice recording panel — replaces the composer
               while recording / requesting mic / transcribing. ─────────── */}
          {isVoiceActive ? (
            <div
              className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 animate-in fade-in duration-150"
              role="group"
              aria-label={isTranscribing ? 'Transcribing voice message' : 'Recording voice message'}
            >
              {/* Cancel (discard recording) — left, ghost outline */}
              <button
                type="button"
                onClick={onCancelRecording}
                disabled={!onCancelRecording}
                aria-label="Cancel recording"
                title="Cancel"
                className="h-10 w-10 sm:h-9 sm:w-9 inline-flex items-center justify-center rounded-full border border-foreground/15 bg-foreground/[0.04] text-foreground/70 hover:text-foreground hover:bg-foreground/[0.08] hover:border-foreground/25 active:scale-95 transition-all flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X className="h-4 w-4 sm:h-[15px] sm:w-[15px]" />
              </button>

              {/* Waveform lane — ChatGPT-style:
                    • 64 thin bars, uniform white/75 (no color accent on peaks)
                    • GPU-friendly `transform: scaleY()` on fixed-height bars
                      — silence collapses each bar to a ~6 % sliver, reading as
                      a dot-line just like ChatGPT's recording UI.
                    • transform-origin: center → bars grow symmetrically up/down
                      around the midline. Full-amplitude speech = solid band.
                    • `will-change: transform` hints the compositor to promote
                      these to their own layer so the 60 Hz update from
                      useVoice doesn't cause paint churn.
                    • Transcribing state dims the whole lane to ~40 %.         */}
              <div
                aria-hidden
                className={`flex items-center gap-[1px] sm:gap-[1px] h-8 sm:h-7 flex-1 min-w-0 overflow-hidden transition-opacity duration-200 ${
                  isTranscribing ? 'opacity-40' : 'opacity-100'
                }`}
              >
                {displayBars.map((amp, i) => {
                  // Normalize to [0, 1]. A power curve (exp 0.7) slightly
                  // boosts quiet signals so the lane feels "alive" at
                  // conversational volume without clipping loud peaks.
                  const norm = Math.min(255, Math.max(0, amp)) / 255;
                  const shaped = Math.pow(norm, 0.7);
                  // Clamp to [0.06, 1.2]: 0.06 keeps silence visible as a
                  // thin dot; 1.2 lets confident peaks slightly overshoot the
                  // lane height for that punchy ChatGPT "spike" look.
                  const scale = Math.max(0.06, Math.min(1.2, shaped * 1.2));
                  return (
                    <div
                      key={i}
                      className="flex-1 min-w-[1.5px] h-full rounded-full bg-foreground/75"
                      style={{
                        transform: `scaleY(${scale})`,
                        transformOrigin: 'center',
                        willChange: 'transform',
                      }}
                    />
                  );
                })}
              </div>

              {/* Status / timer — swaps to "Transcribing…" during transcribing */}
              <div className="flex items-center gap-1.5 flex-shrink-0 min-w-[3rem] justify-end">
                {isTranscribing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                    <span className="text-[11px] font-medium text-primary tracking-wide">
                      Transcribing…
                    </span>
                  </>
                ) : (
                  <span
                    className="text-xs font-semibold text-foreground/80 tabular-nums"
                    aria-live="polite"
                  >
                    {formatDuration(recordingDuration)}
                  </span>
                )}
              </div>

              {/* Send voice — primary filled, up-arrow (matches ChatGPT submit
                  style). During transcribing it's disabled; during recording
                  it triggers onMicClick which stops + kicks off transcription. */}
              <button
                type="button"
                onClick={onMicClick}
                disabled={isTranscribing}
                aria-label="Send voice message"
                title="Send voice"
                className="h-10 w-10 sm:h-9 sm:w-9 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary-light active:scale-95 transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
              >
                {isTranscribing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-5 w-5 sm:h-[18px] sm:w-[18px]" strokeWidth={2.4} />
                )}
              </button>
            </div>
          ) : (
          <>
          {/* Image preview */}
          {attachedImage && (
            <div className="relative inline-block mx-3 mt-2 mb-1">
              <img src={attachedImage.preview} alt="Attached" className="h-12 w-12 sm:h-16 sm:w-16 rounded-lg object-cover border border-foreground/20" />
              <button
                type="button"
                onClick={onRemoveImage}
                aria-label="Remove attached image"
                title="Remove attached image"
                className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full h-4 w-4 flex items-center justify-center hover:bg-destructive/90 transition-colors shadow-sm"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          )}

          {/* Expand / collapse toggle — only shows when text exceeds collapsed max */}
          {(isOverflowing || isExpanded) && (
            <div className="flex justify-end px-2 pt-1">
              <button
                type="button"
                onClick={() => setIsExpanded(v => !v)}
                aria-label={isExpanded ? 'Collapse input' : 'Expand input'}
                title={isExpanded ? 'Collapse input' : 'Expand input'}
                className="h-6 w-6 inline-flex items-center justify-center rounded-full text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.06] transition-colors"
              >
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}

          {/* Main row: [attach(desktop)] [textarea] [mode(desktop)] [mic|send] */}
          <div className="flex items-end gap-0.5 sm:gap-1">
            {/* Attach picker — DESKTOP ONLY inside the pill. Mobile has the
                external + circle above. Opens a 2-level menu: pick a category
                (Note/Checklist/Timeline/Gallery/Upload) → pick an item. */}
            <div className="hidden sm:flex flex-shrink-0">
              <AttachmentPicker
                onUploadImage={onAttachImage}
                triggerClassName="h-9 w-9 flex items-center justify-center text-foreground/55 hover:text-primary hover:bg-foreground/[0.08] active:scale-95 transition-all rounded-full flex-shrink-0"
                TriggerIcon={Paperclip}
                triggerIconClassName="h-4 w-4"
              />
            </div>

            {/* Textarea — auto-grows with content */}
            <textarea
              ref={textareaRef}
              data-ph-mask
              aria-label="Message TheWeddingBot"
              value={inputText}
              onChange={e => onInputChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                voiceState === 'recording' ? 'Recording…'
                : voiceState === 'transcribing' ? 'Transcribing…'
                : placeholder
              }
              readOnly={voiceState === 'recording' || voiceState === 'transcribing'}
              rows={1}
              className="flex-1 min-w-0 bg-transparent border-none text-foreground/90 py-2 sm:py-2 px-2 sm:px-3 custom-scrollbar resize-none text-[15px] sm:text-sm leading-snug sm:leading-normal placeholder-foreground/40 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 min-h-[34px] sm:min-h-[36px]"
              style={{ maxHeight: `${maxHeight}px` }}
            />

            {/* Right group */}
            <div className="flex items-center gap-0.5 pr-0.5 flex-shrink-0">
              {/* Mode dropdown — DESKTOP ONLY inside the pill */}
              {onModeChange && (
                <div className="relative hidden sm:block" data-mode-dropdown>
                  <button
                    type="button"
                    onClick={() => setShowModeDropdown(v => !v)}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-foreground/55 hover:text-foreground/75 hover:bg-foreground/[0.06] transition-colors"
                  >
                    <currentMode.icon className="h-3.5 w-3.5 text-primary/70" />
                    <span>{currentMode.label}</span>
                    <ChevronDown className={`h-3 w-3 transition-transform ${showModeDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {modeDropdownMenuJSX}
                </div>
              )}

              {/* Mic / Stop-recording */}
              <button
                type="button"
                onClick={onMicClick}
                disabled={voiceState === 'transcribing'}
                aria-label={
                  voiceState === 'recording' ? 'Stop recording'
                  : voiceState === 'requesting' ? 'Starting microphone'
                  : voiceState === 'transcribing' ? 'Transcribing audio'
                  : 'Record voice message'
                }
                title={
                  voiceState === 'recording' ? 'Stop recording'
                  : voiceState === 'requesting' ? 'Starting microphone…'
                  : voiceState === 'transcribing' ? 'Transcribing…'
                  : 'Record voice message'
                }
                className={`${(hasContent || isTyping) && voiceState === 'idle' ? 'hidden sm:flex' : 'flex'} h-10 w-10 sm:h-9 sm:w-9 items-center justify-center transition-all active:scale-95 rounded-full flex-shrink-0 ${
                  voiceState === 'recording' || voiceState === 'requesting'
                    ? 'text-destructive bg-destructive/15'
                    : voiceState === 'transcribing'
                      ? 'text-cat-budget bg-cat-budget/10'
                      : 'text-foreground/55 hover:text-primary hover:bg-foreground/[0.08]'
                }`}
              >
                {voiceState === 'recording' || voiceState === 'requesting' ? (
                  <span className="relative flex items-center justify-center">
                    <span className="absolute inline-flex h-8 w-8 sm:h-6 sm:w-6 rounded-full bg-destructive/50 opacity-60 animate-ping" />
                    <StopCircle className="h-5 w-5 sm:h-4 sm:w-4 relative z-10" fill="currentColor" />
                  </span>
                ) : voiceState === 'transcribing' ? (
                  <Loader2 className="h-5 w-5 sm:h-4 sm:w-4 animate-spin" />
                ) : (
                  <Mic className="h-5 w-5 sm:h-4 sm:w-4" />
                )}
              </button>

              {/* Send / Stop */}
              {isTyping && onStop ? (
                <button
                  onClick={onStop}
                  aria-label="Stop generating reply"
                  title="Stop generating"
                  className="h-10 w-10 sm:h-9 sm:w-9 flex items-center justify-center text-foreground/55 hover:text-foreground/80 rounded-full hover:bg-foreground/[0.08] active:scale-95 transition-all flex-shrink-0"
                >
                  <StopCircle className="h-5 w-5 sm:h-4 sm:w-4" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!hasContent || voiceState === 'recording' || voiceState === 'transcribing'}
                  aria-label="Send message"
                  title="Send"
                  className={`${hasContent ? 'flex' : 'hidden sm:flex'} h-10 w-10 sm:h-9 sm:w-9 items-center justify-center text-foreground rounded-full  active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md  flex-shrink-0`}
                >
                  <Send className="h-5 w-5 sm:h-4 sm:w-4" />
                </button>
              )}
            </div>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
