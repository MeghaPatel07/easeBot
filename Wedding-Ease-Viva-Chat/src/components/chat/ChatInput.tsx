import React, { useState, useEffect, useRef } from 'react';
import {
  Send, Image, StopCircle, Mic, Loader2, ChevronDown, ChevronUp, X, Check, Plus,
} from 'lucide-react';
import { MODE_CONFIG, modeConfig, type ModeOrAuto } from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// ChatInput — text input, image attachment, voice, mode selector, send/stop
// ─────────────────────────────────────────────────────────────────────────────
export interface ChatInputProps {
  inputText: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
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
}

const COLLAPSED_MAX = 120;  // ~5 lines — normal state
const EXPANDED_MAX = 400;   // ~16 lines — after user expands
const MOBILE_COLLAPSED_MAX = 96;   // ~3 lines on mobile — comfortable but doesn't hog the viewport
const MOBILE_EXPANDED_MAX = 200;   // ~8 lines on mobile when user expands

const ChatInput = ({
  inputText, onInputChange, onSend, onStop, isTyping, placeholder,
  isRecording, voiceState, onMicClick, attachedImage, onAttachImage, onRemoveImage,
  selectedMode, onModeChange, recordingDuration, onCancelRecording,
}: ChatInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);

  // Track viewport size reactively so rotating a phone or opening the keyboard updates the cap.
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobileViewport(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const maxHeight = isMobileViewport
    ? (isExpanded ? MOBILE_EXPANDED_MAX : MOBILE_COLLAPSED_MAX)
    : (isExpanded ? EXPANDED_MAX : COLLAPSED_MAX);

  const currentMode = selectedMode ? modeConfig(selectedMode) : MODE_CONFIG[0];

  // Auto-resize up to the active max-height; track overflow for expand button
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const sh = el.scrollHeight;
    el.style.height = `${Math.min(sh, maxHeight)}px`;
    setIsOverflowing(sh > COLLAPSED_MAX);
  }, [inputText, maxHeight]);

  // Collapse back when input is cleared
  useEffect(() => {
    if (!inputText) setIsExpanded(false);
  }, [inputText]);

  // Close mode dropdown on outside click.
  // Uses a `data-mode-dropdown` attribute on the dropdown root(s) so the
  // handler works even when the dropdown is rendered twice (once inline for
  // desktop, once in the row-2 toolbar for mobile) — a ref-based check would
  // only track the last-mounted copy.
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

  // Gemini-style right-slot logic on mobile: when the user has content or we're
  // mid-stream, show send/stop; otherwise the mic is the primary right action
  // (mic and send SWAP, not coexist — cleaner than cramming both on a 375px pill).
  const hasContent = inputText.trim().length > 0 || !!attachedImage;

  // Shared mode-dropdown JSX — rendered twice (once as chip above the pill on
  // mobile, once inline in the pill on desktop). Both copies carry the
  // `data-mode-dropdown` marker so the closest()-based outside-click handler
  // works across both instances. State (showModeDropdown) is shared.
  const modeDropdownMenuJSX = showModeDropdown ? (
    <div className="absolute bottom-full left-0 sm:left-auto sm:right-0 mb-2 w-[min(18rem,calc(100vw-2rem))] max-h-[60dvh] overflow-y-auto custom-scrollbar rounded-xl bg-[#2D0A1A]/95 backdrop-blur-xl border border-white/[0.1] shadow-2xl shadow-black/40 py-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
      {MODE_CONFIG.map(m => {
        const isActive = selectedMode === m.key;
        return (
          <button
            key={m.key}
            onClick={() => { onModeChange?.(m.key); setShowModeDropdown(false); }}
            className={`w-full flex items-start gap-3 px-3.5 py-2.5 text-left transition-colors ${isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'}`}
          >
            <m.icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isActive ? 'text-[#C6944A]' : 'text-white/35'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${isActive ? 'text-[#C6944A]' : 'text-white/75'}`}>{m.label}</span>
                {isActive && <Check className="h-3 w-3 text-[#C6944A]" />}
              </div>
              <p className="text-2xs text-white/35 leading-snug mt-0.5">{m.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="max-w-3xl mx-auto w-full">
      {/*
        ── MOBILE-ONLY mode chip row, ABOVE the input pill ────────────────
        Gemini-style: a compact pill-shaped chip sitting above the input,
        horizontally scrollable so more tool chips can live here later.
      */}
      {onModeChange && (
        <div className="flex sm:hidden items-center gap-2 mb-2 px-0.5 overflow-x-auto scrollbar-hide">
          <div className="relative flex-shrink-0" data-mode-dropdown>
            <button
              type="button"
              onClick={() => setShowModeDropdown(v => !v)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/[0.06] border border-white/[0.1] text-xs font-medium text-white/75 hover:bg-white/[0.1] active:scale-95 transition-all"
            >
              <currentMode.icon className="h-3.5 w-3.5 text-[#C6944A]/80" />
              <span>{currentMode.label}</span>
              <ChevronDown className={`h-3 w-3 text-white/50 transition-transform ${showModeDropdown ? 'rotate-180' : ''}`} />
            </button>
            {modeDropdownMenuJSX}
          </div>
        </div>
      )}

      {/* ── Input pill ─────────────────────────────────────────────────── */}
      <div className="bg-white/[0.08] backdrop-blur-xl rounded-[28px] sm:rounded-2xl px-1.5 py-1 sm:p-1.5 shadow-lg shadow-black/20 border border-white/[0.12] input-glow transition-shadow duration-300">

        {/* Image preview */}
        {attachedImage && (
          <div className="relative inline-block mx-3 mt-2 mb-1">
            <img src={attachedImage.preview} alt="Attached" className="h-12 w-12 sm:h-16 sm:w-16 rounded-lg object-cover border border-white/20" />
            <button
              type="button"
              onClick={onRemoveImage}
              className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full h-4 w-4 flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        )}

        {/* Expand / collapse toggle */}
        {(isOverflowing || isExpanded) && (
          <div className="flex justify-end px-2 pt-1">
            <button
              type="button"
              onClick={() => setIsExpanded(v => !v)}
              title={isExpanded ? 'Collapse input' : 'Expand input'}
              className="flex items-center gap-1 text-2xs text-white/40 hover:text-white/60 transition-colors"
            >
              {isExpanded ? (
                <><ChevronDown className="h-3 w-3" /><span>Collapse</span></>
              ) : (
                <><ChevronUp className="h-3 w-3" /><span>Expand</span></>
              )}
            </button>
          </div>
        )}

        {/* Main row: [attach] [textarea] [mode(desktop)] [mic|send] */}
        <div className="flex items-end gap-0.5 sm:gap-1">
          {/* Attach — Plus icon on mobile (Gemini-like), Image on desktop */}
          <button
            type="button"
            onClick={onAttachImage}
            title="Attach image"
            className="h-11 w-11 sm:h-9 sm:w-9 flex items-center justify-center text-white/55 hover:text-[#C6944A] hover:bg-white/[0.08] active:scale-95 transition-all rounded-full flex-shrink-0"
          >
            <Plus className="h-5 w-5 sm:hidden" />
            <Image className="h-4 w-4 hidden sm:block" />
          </button>

          {/* Textarea
              Mobile: single-line feel — tight leading, min-h 24px, py-1.
              Desktop: relaxed — min-h 36px, py-2, normal leading.
              The auto-resize effect writes to style.height directly, so the
              class-based min-height is only used for the initial/empty state. */}
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={placeholder}
            rows={1}
            className="flex-1 min-w-0 bg-transparent border-none text-white/90 py-1 sm:py-2 px-2 sm:px-3 custom-scrollbar resize-none text-base sm:text-sm leading-tight sm:leading-normal placeholder-white/40 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 min-h-[24px] sm:min-h-[36px]"
            style={{ maxHeight: `${maxHeight}px` }}
          />

          {/* Right group */}
          <div className="flex items-center gap-0.5 pr-0.5 flex-shrink-0">
            {/* Mode dropdown — DESKTOP ONLY inside the pill (mobile version
                is the chip above the pill) */}
            {onModeChange && (
              <div className="relative hidden sm:block" data-mode-dropdown>
                <button
                  type="button"
                  onClick={() => setShowModeDropdown(v => !v)}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-white/55 hover:text-white/75 hover:bg-white/[0.06] transition-colors"
                >
                  <currentMode.icon className="h-3.5 w-3.5 text-[#C6944A]/70" />
                  <span>{currentMode.label}</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${showModeDropdown ? 'rotate-180' : ''}`} />
                </button>
                {modeDropdownMenuJSX}
              </div>
            )}

            {/*
              Mobile: mic ⇄ send SWAP — only one is visible at a time
                  empty → mic (primary voice action)
                  content → send (primary send action)
                  streaming → stop
              Desktop: mic + send are BOTH always visible side-by-side.
            */}

            {/*
              Mic / Stop-recording button.

              The useVoice hook has FOUR states — idle, requesting, recording,
              transcribing — but this button previously handled only three,
              which meant the 'requesting' phase (permission prompt / recorder
              spin-up) silently showed a plain Mic icon, so on mobile the user
              couldn't see that anything was happening and the stop button
              never appeared. Treat 'requesting' like 'recording' for visuals
              (show StopCircle + pulsing ring) since the user's next tap should
              stop the in-progress recording attempt.
            */}
            <button
              type="button"
              onClick={onMicClick}
              disabled={voiceState === 'transcribing'}
              title={
                voiceState === 'recording' ? 'Stop recording'
                : voiceState === 'requesting' ? 'Starting microphone…'
                : voiceState === 'transcribing' ? 'Transcribing…'
                : 'Record voice message'
              }
              className={`${(hasContent || isTyping) && voiceState === 'idle' ? 'hidden sm:flex' : 'flex'} h-11 w-11 sm:h-9 sm:w-9 items-center justify-center transition-all active:scale-95 rounded-full flex-shrink-0 ${
                voiceState === 'recording' || voiceState === 'requesting'
                  ? 'text-red-500 bg-red-500/15'
                  : voiceState === 'transcribing'
                    ? 'text-amber-500 bg-amber-500/10'
                    : 'text-white/55 hover:text-primary hover:bg-white/[0.08]'
              }`}
            >
              {voiceState === 'recording' || voiceState === 'requesting' ? (
                <span className="relative flex items-center justify-center">
                  <span className="absolute inline-flex h-8 w-8 sm:h-6 sm:w-6 rounded-full bg-red-500/50 opacity-60 animate-ping" />
                  <StopCircle className="h-5 w-5 sm:h-4 sm:w-4 relative z-10" fill="currentColor" />
                </span>
              ) : voiceState === 'transcribing' ? (
                <Loader2 className="h-5 w-5 sm:h-4 sm:w-4 animate-spin" />
              ) : (
                <Mic className="h-5 w-5 sm:h-4 sm:w-4" />
              )}
            </button>

            {/* Send / Stop — hidden on mobile when input is empty */}
            {isTyping && onStop ? (
              <button
                onClick={onStop}
                title="Stop generating"
                className="h-11 w-11 sm:h-9 sm:w-9 flex items-center justify-center bg-red-500 text-white rounded-full hover:bg-red-600 active:scale-95 transition-all shadow-md shadow-red-500/30 flex-shrink-0"
              >
                <StopCircle className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!hasContent}
                title="Send"
                className={`${hasContent ? 'flex' : 'hidden sm:flex'} h-11 w-11 sm:h-9 sm:w-9 items-center justify-center bg-gradient-to-br from-[#D4A853] to-[#B07D35] text-white rounded-full hover:from-[#C6944A] hover:to-[#9B6B2F] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md shadow-[#C6944A]/25 flex-shrink-0`}
              >
                <Send className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
            )}
          </div>
        </div>
        {voiceState === 'recording' && (
          <div className="flex items-center gap-2 pl-3 pb-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="text-3xs font-semibold text-red-400 tracking-wide">
              Listening{recordingDuration != null ? ` · ${Math.floor(recordingDuration / 60)}:${String(recordingDuration % 60).padStart(2, '0')}` : '...'}
            </span>
            {onCancelRecording && (
              <button type="button" onClick={onCancelRecording} className="text-3xs text-white/30 hover:text-white/50 ml-1 transition-colors">
                Cancel
              </button>
            )}
          </div>
        )}
        {voiceState === 'transcribing' && (
          <div className="flex items-center gap-2 pl-3 pb-1">
            <Loader2 className="h-2.5 w-2.5 text-amber-500 animate-spin" />
            <span className="text-3xs font-semibold text-amber-500 tracking-wide">Processing speech...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatInput;
