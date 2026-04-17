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

// Auto-grow caps — the textarea grows freely up to these limits, then shows
// an expand button. Expanded mode raises the cap significantly.
const MAX_HEIGHT_DESKTOP = 200;   // ~10 lines
const MAX_HEIGHT_MOBILE = 160;    // ~8 lines
const EXPANDED_MAX_DESKTOP = 480; // ~24 lines
const EXPANDED_MAX_MOBILE = 360;  // ~18 lines

const ChatInput = ({
  inputText, onInputChange, onSend, onStop, isTyping, placeholder,
  isRecording, voiceState, onMicClick, attachedImage, onAttachImage, onRemoveImage,
  selectedMode, onModeChange, recordingDuration, onCancelRecording,
}: ChatInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  // Track viewport size reactively
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobileViewport(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
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

  // Shared mode-dropdown menu
  const modeDropdownMenuJSX = showModeDropdown ? (
    <div className="absolute bottom-full left-0 sm:left-auto sm:right-0 mb-2 w-[min(18rem,calc(100vw-2rem))] max-h-[60dvh] overflow-y-auto custom-scrollbar rounded-xl bg-[#0F0D0C]/95 backdrop-blur-xl border border-white/[0.1] shadow-2xl shadow-black/40 py-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
      {MODE_CONFIG.map(m => {
        const isActive = selectedMode === m.key;
        return (
          <button
            key={m.key}
            onClick={() => { onModeChange?.(m.key); setShowModeDropdown(false); }}
            className={`w-full flex items-start gap-3 px-3.5 py-2.5 text-left transition-colors ${isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'}`}
          >
            <m.icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isActive ? 'text-[#A17A63]' : 'text-white/35'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${isActive ? 'text-[#A17A63]' : 'text-white/75'}`}>{m.label}</span>
                {isActive && <Check className="h-3 w-3 text-[#A17A63]" />}
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
      {/* MOBILE-ONLY mode chip row, ABOVE the input */}
      {onModeChange && (
        <div className="flex sm:hidden items-center justify-center gap-2 mb-2 px-0.5 overflow-x-auto scrollbar-hide">
          <div className="relative flex-shrink-0" data-mode-dropdown>
            <button
              type="button"
              onClick={() => setShowModeDropdown(v => !v)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/[0.06] border border-white/[0.1] text-xs font-medium text-white/75 hover:bg-white/[0.1] active:scale-95 transition-all"
            >
              <currentMode.icon className="h-3.5 w-3.5 text-[#A17A63]/80" />
              <span>{currentMode.label}</span>
              <ChevronDown className={`h-3 w-3 text-white/50 transition-transform ${showModeDropdown ? 'rotate-180' : ''}`} />
            </button>
            {modeDropdownMenuJSX}
          </div>
        </div>
      )}

      {/* ── Mobile layout: [ + ]  [ input pill ]  ─────────────────────── */}
      {/* ── Desktop layout: [ input pill with + inside ]  ──────────────── */}
      <div className="flex items-end gap-2.5 sm:gap-0">

        {/* + button — OUTSIDE pill on mobile, hidden on desktop (desktop has it inside).
            Matches the input pill's collapsed height (44px) and border-radius (22px). */}
        <button
          type="button"
          onClick={onAttachImage}
          title="Attach image"
          className="sm:hidden h-11 w-11 flex items-center justify-center rounded-[22px] border border-white/[0.12] bg-white/[0.08] backdrop-blur-xl text-white/55 hover:text-[#A17A63] hover:bg-white/[0.12] active:scale-95 transition-all flex-shrink-0 shadow-lg shadow-black/20"
        >
          <Plus className="h-5 w-5" />
        </button>

        {/* ── Input pill ───────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 bg-white/[0.08] backdrop-blur-xl rounded-[22px] sm:rounded-2xl  sm:p-1.5 shadow-lg shadow-black/20 border border-white/[0.12] input-glow transition-shadow duration-300">

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

          {/* Expand / collapse toggle — only shows when text exceeds collapsed max */}
          {(isOverflowing || isExpanded) && (
            <div className="flex justify-end px-2 pt-1">
              <button
                type="button"
                onClick={() => setIsExpanded(v => !v)}
                aria-label={isExpanded ? 'Collapse input' : 'Expand input'}
                title={isExpanded ? 'Collapse input' : 'Expand input'}
                className="h-6 w-6 inline-flex items-center justify-center rounded-full text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
              >
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}

          {/* Main row: [attach(desktop)] [textarea] [mode(desktop)] [mic|send] */}
          <div className="flex items-end gap-0.5 sm:gap-1">
            {/* Attach — Image icon DESKTOP ONLY (mobile has the external + circle) */}
            <button
              type="button"
              onClick={onAttachImage}
              title="Attach image"
              className="hidden sm:flex h-9 w-9 items-center justify-center text-white/55 hover:text-[#A17A63] hover:bg-white/[0.08] active:scale-95 transition-all rounded-full flex-shrink-0"
            >
              <Image className="h-4 w-4" />
            </button>

            {/* Textarea — auto-grows with content */}
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
              readOnly={voiceState === 'recording' || voiceState === 'transcribing'}
              rows={1}
              className="flex-1 min-w-0 bg-transparent border-none text-white/90 py-2 sm:py-2 px-2 sm:px-3 custom-scrollbar resize-none text-[15px] sm:text-sm leading-snug sm:leading-normal placeholder-white/40 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 min-h-[34px] sm:min-h-[36px]"
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
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-white/55 hover:text-white/75 hover:bg-white/[0.06] transition-colors"
                  >
                    <currentMode.icon className="h-3.5 w-3.5 text-[#A17A63]/70" />
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
                title={
                  voiceState === 'recording' ? 'Stop recording'
                  : voiceState === 'requesting' ? 'Starting microphone…'
                  : voiceState === 'transcribing' ? 'Transcribing…'
                  : 'Record voice message'
                }
                className={`${(hasContent || isTyping) && voiceState === 'idle' ? 'hidden sm:flex' : 'flex'} h-10 w-10 sm:h-9 sm:w-9 items-center justify-center transition-all active:scale-95 rounded-full flex-shrink-0 ${
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

              {/* Send / Stop */}
              {isTyping && onStop ? (
                <button
                  onClick={onStop}
                  title="Stop generating"
                  className="h-10 w-10 sm:h-9 sm:w-9 flex items-center justify-center text-white/55 hover:text-white/80 rounded-full hover:bg-white/[0.08] active:scale-95 transition-all flex-shrink-0"
                >
                  <StopCircle className="h-5 w-5 sm:h-4 sm:w-4" />
                </button>
              ) : (
                <button
                  onClick={onSend}
                  disabled={!hasContent || voiceState === 'recording' || voiceState === 'transcribing'}
                  title="Send"
                  className={`${hasContent ? 'flex' : 'hidden sm:flex'} h-10 w-10 sm:h-9 sm:w-9 items-center justify-center text-white rounded-full  active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md  flex-shrink-0`}
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
    </div>
  );
};

export default ChatInput;
