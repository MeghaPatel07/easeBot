import React, { useState, useEffect, useRef } from 'react';
import {
  Send, Image, StopCircle, Mic, Loader2, ChevronDown, ChevronUp, X, Check,
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
  voiceState: 'idle' | 'recording' | 'transcribing';
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
const MOBILE_MAX = 36;      // single line on mobile (< 640px)

const ChatInput = ({
  inputText, onInputChange, onSend, onStop, isTyping, placeholder,
  isRecording, voiceState, onMicClick, attachedImage, onAttachImage, onRemoveImage,
  selectedMode, onModeChange, recordingDuration, onCancelRecording,
}: ChatInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const modeDropdownRef = useRef<HTMLDivElement>(null);

  const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 640;
  const maxHeight = isMobileViewport ? MOBILE_MAX : isExpanded ? EXPANDED_MAX : COLLAPSED_MAX;

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

  // Close mode dropdown on outside click
  useEffect(() => {
    if (!showModeDropdown) return;
    const handler = (e: MouseEvent) => {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(e.target as Node)) {
        setShowModeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showModeDropdown]);

  return (
    <div className="max-w-3xl mx-auto w-full">
      {/* Input bar */}
      <div className="bg-white/[0.07] backdrop-blur-xl rounded-2xl p-1.5 shadow-lg shadow-black/20 border border-white/[0.12] input-glow transition-shadow duration-300">

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

        <div className="flex items-end gap-1">
          {/* Image attach button */}
          <button
            type="button"
            onClick={onAttachImage}
            title="Attach image"
            className="p-2.5 sm:p-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center text-white/40 hover:text-[#C6944A] transition-colors rounded-lg"
          >
            <Image className="h-4 w-4" />
          </button>
          {/* Textarea */}
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
            className="flex-1 bg-transparent border-none text-white/90 py-2 px-3 custom-scrollbar resize-none text-base sm:text-sm placeholder-white/40 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            style={{ minHeight: '36px', maxHeight: `${maxHeight}px` }}
          />

          {/* Right side: mode selector + mic + send/stop */}
          <div className="flex items-center gap-0.5 pr-0.5 flex-shrink-0">
            {/* Mode dropdown — inline, Gemini-style */}
            {onModeChange && (
              <div className="relative" ref={modeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowModeDropdown(v => !v)}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-white/45 hover:text-white/65 hover:bg-white/[0.06] transition-colors"
                >
                  <currentMode.icon className="h-3.5 w-3.5 text-[#C6944A]/60" />
                  <span className="hidden sm:inline">{currentMode.label}</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${showModeDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showModeDropdown && (
                  <div className="absolute bottom-full right-0 mb-2 w-64 rounded-xl bg-[#2D0A1A]/95 backdrop-blur-xl border border-white/[0.1] shadow-2xl shadow-black/40 py-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    {MODE_CONFIG.map(m => {
                      const isActive = selectedMode === m.key;
                      return (
                        <button
                          key={m.key}
                          onClick={() => { onModeChange(m.key); setShowModeDropdown(false); }}
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
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onMicClick}
              disabled={voiceState === 'transcribing'}
              title={voiceState === 'recording' ? 'Stop recording' : voiceState === 'transcribing' ? 'Transcribing...' : 'Record voice message'}
              className={`p-2.5 sm:p-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center transition-colors rounded-lg ${voiceState === 'recording'
                ? 'text-red-500'
                : voiceState === 'transcribing'
                  ? 'text-amber-500'
                  : 'text-white/40 hover:text-primary'
                }`}
            >
              {voiceState === 'recording' ? (
                <span className="relative flex items-center justify-center">
                  <span className="absolute inline-flex h-5 w-5 rounded-full bg-red-400 opacity-40 animate-ping" />
                  <StopCircle className="h-4 w-4 relative z-10" />
                </span>
              ) : voiceState === 'transcribing' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>

            {isTyping && onStop ? (
              <button onClick={onStop} className="p-2.5 sm:p-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center bg-red-500 text-white rounded-xl hover:bg-red-600 active:scale-95 transition-all">
                <StopCircle className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={onSend} disabled={!inputText.trim() && !attachedImage} className="p-2.5 sm:p-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center bg-gradient-to-br from-[#D4A853] to-[#B07D35] text-white rounded-full hover:from-[#C6944A] hover:to-[#9B6B2F] active:scale-95 transition-all disabled:opacity-30 shadow-md shadow-[#C6944A]/20">
                <Send className="w-4 h-4" />
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
