import React, { useEffect, useRef, useMemo } from 'react';
import { useTypewriter } from '@/hooks/useTypewriter';
import {
  Send, Sparkles, Calendar, CheckSquare,
  Copy, Download, ThumbsUp, Edit3, Lock,
  RefreshCw, Loader2, Bookmark, Heart,
  Check, Volume2, X, ImagePlus,
  ChevronUp, ChevronLeft, ChevronRight,
  Minimize2, Maximize2, Type, GraduationCap, ImageOff,
  Share2,
} from 'lucide-react';
import { shareArtifact, type ArtifactKind } from '@/lib/shareArtifact';
import MessageAttachmentChips, { type KnownArtifactIds } from './MessageAttachmentChips';
import { Button } from '@/components/ui/button';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Message, MessageProductCard } from '@/hooks/useChat';
import type { UserProfile } from '@/types';
import ComparisonTable from '@/components/ComparisonTable';
import { ImageCarousel } from '@/components/ImageCarousel';
import { AudioPlayer } from '@/components/AudioPlayer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import { modeConfig, markdownToHtml, type ModeOrAuto } from './constants';
import easebotAvatar from '@/assets/images/easebot.png';
import { track } from '@/lib/analytics';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface BranchInfo {
  anchorId: string;
  total: number;
  current: number;
}

export interface ChatMessagesProps {
  messages: Message[];
  isTyping: boolean;
  selectedMode: ModeOrAuto;
  user: { uid: string } | null;
  profile: UserProfile | null;
  activeThreadId: string | null;
  activeUserId: string;
  highlightedMessageId: string | null;
  hasMoreMessages: boolean;
  loadingMoreMessages: boolean;
  // Inline editing
  inlineEditId: string | null;
  inlineEditText: string;
  inlineEditImage: string | null;
  onStartInlineEdit: (m: Message) => void;
  onCancelInlineEdit: () => void;
  onSubmitInlineEdit: (m: Message) => void;
  onInlineEditTextChange: (text: string) => void;
  onInlineEditImageChange: (dataUri: string | null) => void;
  onInlineEditImageRemove: () => void;
  // Branch navigation
  getBranchInfo: (msgIndex: number) => BranchInfo | null;
  onSwitchBranch: (anchorId: string, newIndex: number) => void;
  // Actions
  onLoadMoreMessages: () => void;
  onCopyMessage: (text: string, msgId: string) => void;
  onDownloadMessage: (text: string, id: string) => void;
  onToggleLike: (messageId: string) => void;
  onRegenerateMessage: (m: Message) => void;
  onContinueGenerating: () => void;
  // WE-20260601-300/303: retry the last recoverable failed send (offline /
  // timeout / no-stream / rate-limited). Optional so existing callers compile.
  onRetryFailedSend?: () => void;
  onToneModifier: (modifier: string) => void;
  onConvertToTable: (message: Message) => void;
  onSaveProduct: (title: string, url: string, imageUrl: string) => void;
  likedProductIds?: Set<string>;
  onToggleProductLike?: (product: MessageProductCard) => void;
  onShareProduct?: (productTitle: string) => void;
  onRequestMoreProducts?: () => void;
  onOpenPlanner: (checklistId: string) => void;
  onShowSignIn: () => void;
  onDeleteImage?: (messageId: string, imageUrl: string) => void;
  // TTS
  ttsLoadingId: string | null;
  ttsActiveId: string | null;
  ttsAudioUrls: Record<string, string>;
  onTtsPlay: (message: { id: string; text: string; language?: string }) => void;
  onTtsClose: (msgId: string) => void;
  // State
  copiedMsgId: string | null;
  savedProductIds: Set<string>;
  // Scroll
  pendingScrollToId: string | null;
  // Setters for input (for table conversion flow)
  onSetInputText: (text: string) => void;
  onSetSelectedMode: (mode: ModeOrAuto) => void;
  // Known-artifact id sets used to render attached artifact chips as clickable
  // vs "Deleted artifact" in the user message trail. Defaults to empty sets
  // (all chips resolve as deleted) when the caller hasn't wired this yet.
  knownArtifactIds?: KnownArtifactIds;
}

// ─────────────────────────────────────────────────────────────────────────────
// Language helpers — WCAG 3.1.2 (Language of Parts, AA). The backend tags
// each AI message with a BCP-47 `language` (e.g. "hi", "ar", "gu", "es"),
// but the DOM wrapper used to ignore it, so screen readers kept reading
// Hindi/Arabic/etc. with English phonemes (garbled). We now propagate
// `lang=` onto the markdown wrapper div, and `dir="rtl"` for the small set
// of RTL languages we expect to see (`dir="ltr"` for everything else, so
// nested elements inherit a known direction rather than relying on UA
// defaults from the parent <html dir>).
// ─────────────────────────────────────────────────────────────────────────────
const RTL_LANGUAGE_CODES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'yi', 'dv']);

function isRtlLanguage(code?: string): boolean {
  if (!code) return false;
  // Accept full BCP-47 tags ("ar-EG", "he-IL") by checking only the primary subtag.
  const primary = code.toLowerCase().split('-')[0];
  return RTL_LANGUAGE_CODES.has(primary);
}

// ─────────────────────────────────────────────────────────────────────────────
// Typewriter markdown — reveals characters gradually during streaming,
// then renders full text with markdown once streaming finishes.
// ─────────────────────────────────────────────────────────────────────────────
const TypewriterMarkdown: React.FC<{
  text: string
  isStreaming: boolean
  remarkPlugins: any[]
  components: any
}> = ({ text, isStreaming, remarkPlugins, components }) => {
  const displayed = useTypewriter(text, isStreaming, 12, 2)
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
      {displayed}
    </ReactMarkdown>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages, isTyping, selectedMode, user, profile, activeThreadId, activeUserId,
  highlightedMessageId, hasMoreMessages, loadingMoreMessages,
  inlineEditId, inlineEditText, inlineEditImage, onStartInlineEdit, onCancelInlineEdit, onSubmitInlineEdit, onInlineEditTextChange, onInlineEditImageChange, onInlineEditImageRemove,
  getBranchInfo, onSwitchBranch,
  onLoadMoreMessages, onCopyMessage, onDownloadMessage, onToggleLike, onRegenerateMessage,
  onContinueGenerating, onRetryFailedSend, onToneModifier, onConvertToTable, onSaveProduct,
  likedProductIds, onToggleProductLike,
  onShareProduct, onRequestMoreProducts,
  onOpenPlanner, onShowSignIn, onDeleteImage,
  ttsLoadingId, ttsActiveId, ttsAudioUrls, onTtsPlay, onTtsClose,
  copiedMsgId, savedProductIds,
  pendingScrollToId,
  onSetInputText, onSetSelectedMode,
  knownArtifactIds,
}) => {
  // Fall back to empty sets when caller hasn't wired knownArtifactIds yet.
  // With empty sets every attachment resolves as deleted, which matches the
  // "artifact gone" display — safe default while Index.tsx is updated.
  const resolvedKnownIds: KnownArtifactIds = knownArtifactIds ?? {
    notes: new Set<string>(),
    checklists: new Set<string>(),
    timelines: new Set<string>(),
    images: new Set<string>(),
    reminders: new Set<string>(),
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Track pendingScrollToId via ref so clearing it doesn't re-trigger auto-scroll
  const pendingScrollRef = useRef(pendingScrollToId);
  useEffect(() => { pendingScrollRef.current = pendingScrollToId; }, [pendingScrollToId]);

  // Auto-scroll to bottom only when a message is added or the streaming text
  // actually grows — NOT on every `messages` identity change. Toggling a like
  // (message-level or per-product) produces a new array reference with no new
  // content; scrolling on those would yank the user away from what they're
  // reading. Skip when a targeted scroll (e.g. jump-to-liked) is pending.
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const autoScrollKey = lastMessage
    ? `${messages.length}:${lastMessage.id}:${lastMessage.text.length}`
    : '';
  useEffect(() => {
    if (pendingScrollRef.current) return;
    if (!autoScrollKey) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [autoScrollKey, isTyping]);

  const handleLoadMore = async () => {
    if (loadingMoreMessages || !hasMoreMessages) return;
    const container = scrollContainerRef.current;
    const prevHeight = container?.scrollHeight ?? 0;
    onLoadMoreMessages();
    requestAnimationFrame(() => {
      if (container) {
        const newHeight = container.scrollHeight;
        container.scrollTop += newHeight - prevHeight;
      }
    });
  };

  const copyMessage = async (text: string, msgId: string, imageUrl?: string | null, imageUrls?: string[]) => {
    const imgUrl = imageUrl || imageUrls?.[0];
    const hasImage = Boolean(imgUrl);
    if (imgUrl) {
      try {
        const res = await fetch(imgUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([blob], { type: 'image/png' }) })]);
        onCopyMessage(text, msgId);
        track('message_copied', { message_id: msgId, has_image: hasImage });
        return;
      } catch { /* fall through */ }
    }
    onCopyMessage(text, msgId);
    track('message_copied', { message_id: msgId, has_image: hasImage });
  };

  const downloadMessage = async (text: string, id: string, imageUrl?: string | null, imageUrls?: string[]) => {
    const imgUrl = imageUrl || imageUrls?.[0];
    if (imgUrl) {
      try {
        const res = await fetch(imgUrl);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wedding-ease-${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      } catch { /* fall through */ }
    }
    onDownloadMessage(text, id);
  };

  // Share an artifact — reuses the thread-level share flow. The shared page
  // renders the whole conversation, so the artifact is visible in context.
  const handleShareArtifact = (kind: ArtifactKind, titleHint?: string, artifactId?: string) => {
    if (kind === 'checklist' && artifactId) {
      track('checklist_shared', { checklist_id: artifactId, channel: 'link' });
    }
    void shareArtifact(activeThreadId, titleHint ?? 'Shared chat', kind);
  };

  // Keyboard activation (Enter / Space) for non-button share icons.
  const onShareKeyDown = (kind: ArtifactKind, titleHint?: string, artifactId?: string) =>
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleShareArtifact(kind, titleHint, artifactId);
      }
    };

  // Identify the message currently being streamed (last AI message while typing)
  const streamingMsgId = useMemo(() => {
    if (!isTyping) return null
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === 'ai') return messages[i].id
    }
    return null
  }, [isTyping, messages])

  return (
    <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 sm:px-6 py-6 space-y-6 noise-overlay relative">
      {/* Load earlier messages */}
      {hasMoreMessages && (
        <div className="flex justify-center">
          <button
            onClick={handleLoadMore}
            disabled={loadingMoreMessages}
            className="flex items-center gap-1.5 px-4 py-1.5 text-label font-medium text-primary bg-foreground/10 border border-primary/20 rounded-full hover:bg-foreground/15 transition-colors shadow-sm disabled:opacity-50"
          >
            {loadingMoreMessages ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
            Load earlier messages
          </button>
        </div>
      )}

      {messages.map((message, msgIndex) => (
        <div
          key={message.id}
          id={`msg-${message.id}`}
          className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'} transition-all duration-300 ${highlightedMessageId === message.id ? 'rounded-2xl ring-2 ring-primary/40 ring-offset-2 bg-primary/5' : ''}`}
        >
          {message.sender === 'user' ? (
            <div className="flex flex-col items-end w-full">
              {inlineEditId === message.id ? (
                <div className="w-full max-w-2xl flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-200">
                  {/* Edit mode container */}
                  <div className="rounded-2xl border border-primary/30 bg-foreground/[0.06] backdrop-blur-md shadow-xl overflow-hidden">
                    {/* Attached image preview with remove/replace */}
                    {inlineEditImage && (
                      <div className="px-4 pt-4 flex items-start gap-3">
                        <div className="relative group/img">
                          <img src={inlineEditImage} alt="Attached" className="rounded-xl w-[100px] h-[100px] object-cover border border-foreground/10" />
                          <button
                            onClick={onInlineEditImageRemove}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive/90 hover:bg-destructive text-destructive-foreground flex items-center justify-center shadow-md transition-all opacity-0 group-hover/img:opacity-100"
                            title="Remove image"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        <label className="flex flex-col items-center justify-center w-[100px] h-[100px] rounded-xl border-2 border-dashed border-foreground/15 hover:border-primary/40 cursor-pointer transition-colors group/upload">
                          <ImagePlus className="h-5 w-5 text-foreground/30 group-hover/upload:text-primary/60 transition-colors" />
                          <span className="text-3xs text-foreground/30 group-hover/upload:text-primary/60 mt-1 transition-colors">Replace</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              // WE-20260528-405: same 4MB cap as Index.tsx:368.
                              // Inline-edit's Replace input was missed when
                              // WE-20260527-220 landed; a 50MB pick balloons
                              // React state + the message-edit payload.
                              if (file.size > 4 * 1024 * 1024) {
                                alert('Image must be under 4MB');
                                e.target.value = '';
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = () => {
                                if (typeof reader.result === 'string') {
                                  onInlineEditImageChange(reader.result);
                                }
                              };
                              reader.readAsDataURL(file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    )}
                    {/* Add image button when no image */}
                    {!inlineEditImage && (
                      <div className="px-4 pt-3">
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-foreground/15 hover:border-primary/40 cursor-pointer transition-colors text-foreground/40 hover:text-primary/70 text-xs">
                          <ImagePlus className="h-3.5 w-3.5" />
                          <span>Attach image</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              // WE-20260528-405: same 4MB cap as Index.tsx:368.
                              // Inline-edit's Attach input was missed when
                              // WE-20260527-220 landed.
                              if (file.size > 4 * 1024 * 1024) {
                                alert('Image must be under 4MB');
                                e.target.value = '';
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = () => {
                                if (typeof reader.result === 'string') {
                                  onInlineEditImageChange(reader.result);
                                }
                              };
                              reader.readAsDataURL(file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    )}
                    {/* Textarea */}
                    <textarea
                      autoFocus
                      value={inlineEditText}
                      onChange={e => onInlineEditTextChange(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmitInlineEdit(message); }
                        if (e.key === 'Escape') onCancelInlineEdit();
                      }}
                      rows={Math.max(3, Math.min(12, inlineEditText.split('\n').length + 1))}
                      className="w-full px-4 py-4 bg-transparent text-foreground/90 text-sm leading-relaxed resize-none outline-none placeholder:text-foreground/30"
                      placeholder="Edit your message..."
                    />
                    {/* Action bar */}
                    <div className="flex items-center justify-between px-4 py-3 border-t border-foreground/[0.06] bg-foreground/[0.02]">
                      <span className="text-3xs text-foreground/30">Press Enter to send, Esc to cancel</span>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={onCancelInlineEdit} className="h-8 px-4 text-xs text-foreground/60 hover:text-foreground/90 hover:bg-foreground/10 rounded-xl font-medium">
                          Cancel
                        </Button>
                        <Button size="sm" onClick={() => onSubmitInlineEdit(message)} disabled={!inlineEditText.trim()} className="h-8 px-4 text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium shadow-sm gap-1.5">
                          <Send className="h-3 w-3" />Send
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="group flex flex-col items-end">
                  <div className="chat-msg-text max-w-[calc(100%-2rem)] sm:max-w-sm md:max-w-lg lg:max-w-xl px-4 py-3 rounded-2xl rounded-tr-sm bg-foreground/[0.08] backdrop-blur-sm text-foreground/90 shadow-sm border border-foreground/[0.08] msg-enter">
                    {message.attachedImage && (
                      <img src={message.attachedImage} alt="Attached" className="mb-2 rounded-lg max-w-[200px] max-h-[200px] object-cover" />
                    )}
                    {message.attachments && message.attachments.length > 0 && (
                      <MessageAttachmentChips
                        attachments={message.attachments}
                        knownIds={resolvedKnownIds}
                        userId={activeUserId}
                      />
                    )}
                    {/* dir="auto" lets the browser pick LTR/RTL from the first
                        strong character of the user's typed text — costs nothing
                        for English and fixes Arabic/Hebrew display without
                        needing a language detector on the user-typed path. */}
                    <p className="text-[13px] leading-relaxed" data-ph-mask dir="auto">{message.text}</p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 mr-1">
                    <span className="text-3xs text-foreground/40 uppercase tracking-wider">
                      {message.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </span>
                    {/* Branch navigation */}
                    {(() => {
                      const info = getBranchInfo(msgIndex);
                      if (!info || info.total <= 1) return null;
                      return (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => onSwitchBranch(info.anchorId, info.current - 1)}
                            disabled={info.current <= 0}
                            className="h-4 w-4 flex items-center justify-center rounded text-foreground/40 hover:text-primary disabled:opacity-30 transition-colors"
                          >
                            <ChevronLeft className="h-3 w-3" />
                          </button>
                          <span className="text-3xs text-foreground/50 font-medium tabular-nums">
                            {info.current + 1}/{info.total}
                          </span>
                          <button
                            onClick={() => onSwitchBranch(info.anchorId, info.current + 1)}
                            disabled={info.current >= info.total - 1}
                            className="h-4 w-4 flex items-center justify-center rounded text-foreground/40 hover:text-primary disabled:opacity-30 transition-colors"
                          >
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 mt-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={() => onStartInlineEdit(message)} className="h-9 w-9 sm:h-6 sm:w-6 p-0 text-foreground/40 hover:text-primary hover:bg-primary/10 rounded-lg">
                          <Edit3 className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>Edit & resend</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )}
            </div>
          ) : message.text ? (
            <div className="max-w-[calc(100%-2rem)] sm:max-w-sm md:max-w-lg lg:max-w-xl group msg-enter">
              {message.mode && (
                <div className="mb-1.5 flex items-center gap-1.5">
                  <div className="w-[31px] h-[31px] rounded-full bg-transparent border border-foreground/15 flex items-center justify-center overflow-hidden bot-avatar">
                    <img src={easebotAvatar} alt="" className="w-full h-full object-cover -scale-x-100" />
                  </div>
                  {(() => {
                    const cfg = modeConfig(message.mode);
                    const Icon = cfg.icon;
                    return (
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-3xs font-bold uppercase tracking-widest ${cfg.pill}`}>
                        <Icon className="h-2 w-2" />
                        {cfg.label}
                      </span>
                    );
                  })()}
                </div>
              )}
              <div
                className="chat-msg-text mb-1 w-full prose prose-sm prose-invert max-w-none text-[13px] leading-[1.7] bg-foreground/[0.03] backdrop-blur-md p-4 sm:p-5 rounded-2xl rounded-tl-sm shadow-glass border border-foreground/10 text-muted-foreground prose-headings:text-muted-foreground prose-strong:text-muted-foreground prose-em:text-muted-foreground prose-li:text-muted-foreground prose-p:text-muted-foreground prose-blockquote:text-muted-foreground prose-code:text-muted-foreground"
                data-ph-mask
                lang={message.language || 'en'}
                dir={isRtlLanguage(message.language) ? 'rtl' : 'ltr'}
              >
                <TypewriterMarkdown
                  text={message.text}
                  isStreaming={message.id === streamingMsgId}
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }: any) => {
                      // WE-20260601-201: internal app routes (e.g. /pricing,
                      // /signup emitted by the quota-error bubbles) must navigate
                      // in-place via the SPA router so session/chat state is
                      // preserved — NOT open in a cold new tab. Only true external
                      // links keep target="_blank".
                      const linkClass = 'text-mode-stylist-dark hover:text-mode-stylist underline underline-offset-2 font-medium transition-colors';
                      const isInternal = typeof href === 'string' && href.startsWith('/') && !href.startsWith('//');
                      if (isInternal) {
                        return (
                          <Link to={href} className={linkClass}>
                            {children}
                          </Link>
                        );
                      }
                      return (
                        <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                          {children}
                        </a>
                      );
                    },
                    img: ({ src, alt }: any) => {
                      // Skip known-bad / hallucinated image hosts. The LLM
                      // sometimes emits markdown pointing to cdn.openai.com
                      // or placeholder domains that 404. Generated images are
                      // surfaced by the carousel from the tool result, so we
                      // never need to render model-authored <img> tags from
                      // those hosts.
                      const BAD_HOSTS = ['cdn.openai.com', 'example.com', 'placeholder.com', 'placehold.it'];
                      if (typeof src === 'string' && BAD_HOSTS.some(h => src.includes(h))) {
                        return null;
                      }
                      // Dedupe: if the URL is already rendered by the carousel below, skip inline.
                      const carouselUrls = message.imageUrls ?? (message.imageUrl ? [message.imageUrl] : []);
                      if (typeof src === 'string' && carouselUrls.includes(src)) {
                        return null;
                      }
                      return (
                        <img
                          src={src}
                          alt={alt ?? ''}
                          className="max-w-full w-[120px] sm:w-[200px] h-auto sm:h-[200px] object-cover rounded-xl shadow-sm flex-shrink-0"
                          onError={(e) => {
                            // Hide broken images silently rather than leaving
                            // a broken-image icon in the chat bubble.
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      );
                    },
                    table: ({ children, ...props }: any) => {
                      const tableLines = message.text.split('\n').filter((l: string) => l.trim().startsWith('|'));
                      if (tableLines.length >= 3) {
                        const rawTable = tableLines.join('\n');
                        return (
                          <div className="not-prose my-3">
                            <ComparisonTable
                              markdownTable={rawTable}
                              onSaveToPlanner={() => {
                                const prompt = `Convert the following response into a Markdown table and save it as a page in my planner:\n\n${rawTable}`;
                                onSetSelectedMode('planner');
                                onSetInputText(prompt);
                              }}
                            />
                          </div>
                        );
                      }
                      return <table {...props}>{children}</table>;
                    },
                    li: ({ children }: any) => {
                      const flat = (nodes: React.ReactNode): React.ReactNode[] =>
                        React.Children.toArray(nodes).flatMap(n =>
                          React.isValidElement(n) && (n.type === 'p' || n.type === 'span')
                            ? flat((n.props as { children?: React.ReactNode }).children)
                            : [n]
                        );
                      const kids = flat(children);
                      const imgNode = kids.find(n => React.isValidElement(n) && 'src' in (n.props as object)) as React.ReactElement<{ src: string; alt?: string }> | undefined;
                      const anchorNode = kids.find(n => React.isValidElement(n) && 'href' in (n.props as object)) as React.ReactElement<{ href: string; children: React.ReactNode }> | undefined;

                      if (imgNode && anchorNode) {
                        const textNodes = kids.filter(n => typeof n === 'string') as string[];
                        const rawMeta = textNodes.join('').replace(/^\|/, '');
                        const description = rawMeta.split('|').slice(1).join('|').trim();

                        const href = anchorNode.props.href ?? '#';
                        const title = anchorNode.props.children;
                        const imageUrl = imgNode.props.src;
                        const productId = `${title}-${href}`.toLowerCase().replace(/\s+/g, '-');
                        const isSaved = savedProductIds.has(productId);

                        return (
                          <li className="list-none mb-3 not-prose">
                            <div className="flex flex-row gap-3 items-start p-3 rounded-2xl border border-foreground/10 bg-foreground/[0.04] backdrop-blur-md shadow-glass hover:bg-foreground/[0.06] hover:border-primary/40 transition-all duration-200">
                              <a href={href} target="_blank" rel="noopener noreferrer" className="block no-underline flex-1 flex flex-row gap-3 items-center">
                                <img src={imageUrl} alt={typeof title === 'string' ? title : ''} className="w-[80px] h-[80px] object-cover rounded-xl flex-shrink-0" />
                                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                  <span className="text-sm font-semibold text-primary leading-snug line-clamp-1">{title}</span>
                                  {description && <span className="text-xs text-mode-auto-active leading-relaxed line-clamp-2">{description}</span>}
                                </div>
                              </a>
                              {user && (
                                <button
                                  onClick={() => onSaveProduct(title as string, href, imageUrl)}
                                  disabled={isSaved}
                                  className={`flex-shrink-0 p-2 rounded-lg transition-all ${isSaved
                                    ? 'bg-primary/20 text-primary cursor-default'
                                    : 'text-foreground/40 hover:text-primary hover:bg-primary/10'
                                    }`}
                                  title={isSaved ? 'Already saved' : 'Save to saved items'}
                                >
                                  <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
                                </button>
                              )}
                              <button
                                onClick={() => handleShareArtifact('product', typeof title === 'string' ? title : undefined)}
                                onKeyDown={onShareKeyDown('product', typeof title === 'string' ? title : undefined)}
                                aria-label="Share this artifact"
                                tabIndex={0}
                                className="flex-shrink-0 h-10 w-10 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg transition-all text-foreground/40 hover:text-primary hover:bg-primary/10"
                              >
                                <Share2 className="h-4 w-4" />
                              </button>
                            </div>
                          </li>
                        );
                      }
                      return <li>{children}</li>;
                    },
                  }}
                />
              </div>
              {/* WE-20260601-300/303: recoverable send-failure retry affordance.
                  Shown on offline / timeout / no-stream / rate-limited bubbles. */}
              {message.retryKind && onRetryFailedSend && !isTyping && (
                <button
                  type="button"
                  onClick={onRetryFailedSend}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-foreground/15 bg-foreground/[0.04] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              )}
              {message.attachments && message.attachments.length > 0 && (
                <div className="mt-2">
                  <MessageAttachmentChips
                    attachments={message.attachments}
                    knownIds={resolvedKnownIds}
                    userId={activeUserId}
                  />
                </div>
              )}
              {message.audioUrl && (
                <audio controls src={message.audioUrl} className="mt-1 mb-2 w-full max-w-xs rounded-xl h-8" />
              )}
              {/* Image generation skeleton */}
              {message.imageGenerating && !message.imageUrl && !message.imageUrls?.length && (
                <div className="mt-3 mb-2 max-w-[calc(100%-1rem)] sm:max-w-sm md:max-w-md w-full motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
                  <div className="relative aspect-square rounded-xl overflow-hidden bg-foreground/[0.04] border border-foreground/[0.08]">
                    {(message as any).partialImageUrl ? (
                      <>
                        <img
                          src={(message as any).partialImageUrl}
                          alt="Generating..."
                          className="absolute inset-0 w-full h-full object-cover blur-sm transition-all duration-700"
                        />
                        <div className="absolute inset-0 bg-overlay-scrim/20 flex items-end justify-center pb-4">
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-overlay-scrim/40 backdrop-blur-sm">
                            <Sparkles className="h-3.5 w-3.5 text-primary motion-safe:animate-pulse" />
                            <p className="text-xs text-foreground/80 font-medium">refining image...</p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent motion-safe:animate-[shimmer_1.8s_ease-in-out_infinite]" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-foreground/[0.06] flex items-center justify-center">
                            <Sparkles className="h-5 w-5 text-primary/50 motion-safe:animate-pulse" />
                          </div>
                          <div className="space-y-1.5 text-center">
                            <p className="text-xs text-foreground/40 font-medium">generating image...</p>
                            <p className="text-3xs text-foreground/25">this may take a few seconds</p>
                          </div>
                          <div className="w-32 h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
                            <div className="h-full bg-primary/30 rounded-full motion-safe:animate-[progress_3s_ease-in-out_infinite]" />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
              {(message.imageUrls?.length || message.imageUrl) && (
                <ImageCarousel
                  imageUrls={message.imageUrls ?? (message.imageUrl ? [message.imageUrl] : [])}
                  onDelete={onDeleteImage ? (imageUrl) => onDeleteImage(message.id, imageUrl) : undefined}
                  isGuest={!user}
                />
              )}
              {message.products && message.products.length > 0 && (
                <div className="mt-3 not-prose">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-3xs uppercase tracking-wider text-foreground/40 font-semibold">
                      Recommended from WeddingEase
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {message.products.map((p) => {
                      const pid = p.uid || `${p.name}-${p.productUrl}`.toLowerCase().replace(/\s+/g, '-');
                      const isLiked = likedProductIds?.has(pid) ?? false;
                      return (
                        <div
                          key={pid}
                          className="flex flex-row gap-3 items-start p-3 rounded-2xl border border-foreground/10 bg-foreground/[0.04] backdrop-blur-md shadow-glass hover:bg-foreground/[0.06] hover:border-primary/40 transition-all duration-200"
                        >
                          <a
                            href={p.productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block no-underline flex-1 flex flex-row gap-3 items-center"
                          >
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="w-[80px] h-[80px] object-cover rounded-xl flex-shrink-0"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <span className="text-sm font-semibold text-primary leading-snug line-clamp-1">
                                {p.name}
                              </span>
                              {p.description && (
                                <span className="text-xs text-mode-auto-active leading-relaxed line-clamp-2">
                                  {p.description}
                                </span>
                              )}
                            </div>
                          </a>
                          {user && (
                            <button
                              onClick={() => onToggleProductLike?.(p)}
                              aria-label={isLiked ? 'Unlike' : 'Like'}
                              className={`flex-shrink-0 p-2 rounded-lg transition-all ${
                                isLiked
                                  ? 'text-primary'
                                  : 'text-foreground/40 hover:text-primary hover:bg-primary/10'
                              }`}
                              title={isLiked ? 'Unlike' : 'Like'}
                            >
                              <Heart className={`h-4 w-4 ${isLiked ? 'fill-current' : ''}`} />
                            </button>
                          )}
                          <button
                            onClick={() => onShareProduct?.(p.name)}
                            aria-label="Share this product"
                            tabIndex={0}
                            className="flex-shrink-0 h-10 w-10 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg transition-all text-foreground/40 hover:text-primary hover:bg-primary/10"
                          >
                            <Share2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {message.productsHasMore && onRequestMoreProducts && (
                    <button
                      onClick={onRequestMoreProducts}
                      className="mt-2 text-xs text-primary font-semibold hover:underline"
                    >
                      See more options
                    </button>
                  )}
                </div>
              )}
              {message.imageDeleted && !message.imageUrls?.length && !message.imageUrl && (
                <div className="mt-2 mb-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-foreground/[0.04] border border-foreground/[0.06] max-w-xs">
                  <ImageOff className="h-4 w-4 text-foreground/30 flex-shrink-0" />
                  <span className="text-xs text-foreground/40 italic">Image was deleted</span>
                </div>
              )}
              {message.checklistData && (
                <div className="mt-2 mb-1 bg-foreground/[0.08] backdrop-blur-sm rounded-2xl rounded-tl-sm shadow-md shadow-black/20 border overflow-hidden max-w-xs w-full">
                  <div className="px-4 py-2.5 bg-primary/5 border-b border-primary/10 flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-headline text-sm font-semibold text-foreground/85 truncate">{message.checklistData.title}</span>
                    <span className="ml-auto text-3xs text-foreground/40 font-medium">{message.checklistData.items.length} items</span>
                  </div>
                  <ul className="px-4 py-2 space-y-1.5">
                    {message.checklistData.items.slice(0, 8).map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-foreground/60">
                        <span className="mt-0.5 h-3.5 w-3.5 rounded border border-foreground/20 flex-shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                    {message.checklistData.items.length > 8 && (
                      <li className="text-3xs text-foreground/40 pl-5">+{message.checklistData.items.length - 8} more items</li>
                    )}
                  </ul>
                  <div className="px-4 py-2 border-t border-foreground/[0.06] flex items-center gap-3">
                    {user && (
                      <button
                        className="text-xs text-primary font-semibold hover:underline"
                        onClick={() => onOpenPlanner(message.checklistData!.id)}
                      >
                        Open in Planner
                      </button>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => handleShareArtifact('checklist', message.checklistData?.title, message.checklistData?.id)}
                          onKeyDown={onShareKeyDown('checklist', message.checklistData?.title, message.checklistData?.id)}
                          aria-label="Share this artifact"
                          tabIndex={0}
                          className="ml-auto inline-flex items-center justify-center h-10 w-10 sm:h-8 sm:w-8 rounded-md text-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top"><p>Share checklist</p></TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )}
              {message.calendarEvent && message.calendarAdded && (
                <div className="mt-2 mb-1 flex items-center gap-1.5 text-label px-3 py-2 rounded-xl w-fit bg-primary/5 text-primary border border-primary/10">
                  <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="font-semibold">Added to Google Calendar</span>
                  <span className="font-medium text-foreground/50">. {message.calendarEvent.date}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleShareArtifact('calendar', message.calendarEvent?.title)}
                        onKeyDown={onShareKeyDown('calendar', message.calendarEvent?.title)}
                        aria-label="Share this artifact"
                        tabIndex={0}
                        className="ml-1 inline-flex items-center justify-center h-10 w-10 sm:h-6 sm:w-6 rounded-md text-primary/70 hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Share2 className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top"><p>Share event</p></TooltipContent>
                  </Tooltip>
                </div>
              )}
              {message.calendarEvent && !message.calendarAdded && !user && (
                <div className="mt-2 mb-1 bg-foreground/[0.08] backdrop-blur-sm p-4 rounded-2xl rounded-tl-sm shadow-md shadow-black/20 border relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12"></div>
                  <div className="relative z-10">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-3xs text-primary font-bold uppercase tracking-widest mb-0.5">Upcoming Event</p>
                        <h4 className="font-headline text-base text-foreground/85">{message.calendarEvent.title}</h4>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => handleShareArtifact('calendar', message.calendarEvent?.title)}
                            onKeyDown={onShareKeyDown('calendar', message.calendarEvent?.title)}
                            aria-label="Share this artifact"
                            tabIndex={0}
                            className="inline-flex items-center justify-center h-10 w-10 sm:h-8 sm:w-8 rounded-md text-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top"><p>Share event</p></TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-foreground/50 text-xs">
                      <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {message.calendarEvent.date}</span>
                      {message.calendarEvent.time && <span className="flex items-center gap-1">{message.calendarEvent.time}</span>}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" className="bg-secondary text-secondary-foreground rounded-lg text-label font-semibold hover:bg-secondary/90 shadow-sm gap-1.5 h-7" onClick={onShowSignIn}>
                        <Calendar className="h-3 w-3" /> Sign in to add to Calendar
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {message.convertToTable && user && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 mb-1 h-7 text-xs gap-1.5 border-foreground/15 text-secondary hover:bg-foreground/[0.06]"
                  onClick={() => onConvertToTable(message)}
                >
                  <CheckSquare className="h-3 w-3" />
                  Save as Table in Planner
                </Button>
              )}
              <div className="flex items-center flex-wrap opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => copyMessage(message.text, message.id, message.imageUrl, message.imageUrls)} className="h-9 w-9 sm:h-6 sm:w-6 p-0 hover:bg-foreground/15 rounded-md">
                      {copiedMsgId === message.id ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3 text-foreground/50" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{copiedMsgId === message.id ? 'Copied!' : (message.imageUrl || message.imageUrls?.[0]) ? 'Copy image' : 'Copy message'}</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => downloadMessage(message.text, message.id, message.imageUrl, message.imageUrls)} className="h-9 w-9 sm:h-6 sm:w-6 p-0 hover:bg-foreground/15 rounded-md">
                      <Download className="h-3 w-3 text-foreground/50" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{(message.imageUrl || message.imageUrls?.[0]) ? 'Download image' : 'Download as text'}</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => onToggleLike(message.id)} className="h-9 w-9 sm:h-6 sm:w-6 p-0 hover:bg-foreground/15 rounded-md">
                      <ThumbsUp className={`h-3.5 w-3.5 sm:h-3 sm:w-3 ${message.liked ? 'text-primary fill-current' : 'text-foreground/50'}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{message.liked ? 'Unlike' : 'Like message'}</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => onRegenerateMessage(message)} className="h-9 w-9 sm:h-6 sm:w-6 p-0 hover:bg-foreground/15 rounded-md">
                      <RefreshCw className="h-3 w-3 text-foreground/50" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Regenerate response</p>
                  </TooltipContent>
                </Tooltip>

                {/* TTS listen button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => onTtsPlay(message)}
                      disabled={ttsLoadingId === message.id}
                      className={`h-9 w-9 sm:h-6 sm:w-6 p-0 hover:bg-foreground/15 rounded-md ${ttsActiveId === message.id ? 'text-primary' : ''}`}
                    >
                      {ttsLoadingId === message.id
                        ? <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        : <Volume2 className="h-3 w-3 text-foreground/50" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{ttsActiveId === message.id ? 'Close player' : 'Listen'}</p>
                  </TooltipContent>
                </Tooltip>

                {/* Share artifact — copies thread share link to clipboard */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => handleShareArtifact(
                        (message.imageUrl || message.imageUrls?.length) ? 'image'
                          : message.checklistData ? 'checklist'
                          : message.calendarEvent ? 'calendar'
                          : 'message'
                      )}
                      aria-label="Share this artifact"
                      tabIndex={0}
                      className="h-10 w-10 sm:h-6 sm:w-6 p-0 hover:bg-foreground/15 rounded-md"
                    >
                      <Share2 className="h-3 w-3 text-foreground/50" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Share</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* TTS AudioPlayer */}
              {ttsActiveId === message.id && ttsAudioUrls[message.id] && (
                <div className="mt-2">
                  <AudioPlayer
                    audioUrl={ttsAudioUrls[message.id]}
                    onEnded={() => onTtsClose(message.id)}
                    onClose={() => onTtsClose(message.id)}
                    messageId={message.id}
                  />
                </div>
              )}

              {/* Continue Generating */}
              {message.truncated && !isTyping && (
                <button
                  onClick={onContinueGenerating}
                  className="flex items-center gap-1.5 text-label text-primary font-medium hover:underline underline-offset-2 mt-1 transition-colors"
                >
                  <Maximize2 className="h-3 w-3" />
                  Continue generating...
                </button>
              )}

              {/* Tone Modifiers */}
              {!isTyping && (
                <div className="flex flex-wrap gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  {[
                    { label: 'Shorter', icon: Minimize2 },
                    { label: 'Longer', icon: Maximize2 },
                    { label: 'Simpler', icon: Type },
                    { label: 'More formal', icon: GraduationCap },
                  ].map(({ label, icon: Icon }) => (
                    <button
                      key={label}
                      onClick={() => onToneModifier(label.toLowerCase())}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-foreground/20 text-2xs text-foreground/50 hover:border-primary/40 hover:text-primary hover:bg-primary/10 transition-all"
                    >
                      <Icon className="h-2.5 w-2.5" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ))}

      {/* Typing indicator */}
      {isTyping && !(messages.length > 0 && messages[messages.length - 1].sender === 'ai' && messages[messages.length - 1].text !== '') && (() => {
        const cfg = modeConfig(selectedMode);
        const lastMsg = messages[messages.length - 1];
        const isGeneratingImage = lastMsg?.imageGenerating;
        return (
          <div className="flex justify-start">
            {isGeneratingImage ? (
              <div className="max-w-[calc(100%-1rem)] sm:max-w-sm md:max-w-md w-full msg-enter">
                <div className="relative aspect-square rounded-xl overflow-hidden bg-foreground/[0.04] border border-foreground/[0.08]">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent motion-safe:animate-[shimmer_1.8s_ease-in-out_infinite]" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-foreground/[0.06] flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-primary/50 motion-safe:animate-pulse" />
                    </div>
                    <div className="space-y-1.5 text-center">
                      <p className="text-xs text-foreground/40 font-medium">generating...</p>
                      <p className="text-3xs text-foreground/25">creating your image</p>
                    </div>
                    <div className="w-32 h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
                      <div className="h-full bg-primary/30 rounded-full motion-safe:animate-[progress_3s_ease-in-out_infinite]" />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`${cfg.pill} bg-foreground/[0.03] backdrop-blur-md rounded-2xl rounded-tl-sm px-5 py-3 border border-foreground/10 shadow-glass text-foreground/90 msg-enter`}>
                <div className={`flex items-center gap-2 `}>
                  <span className="text-caption italic">thinking</span>
                  {[0, 0.15, 0.3].map((d, i) => <div key={i} className="w-1.5 h-1.5 bg-current rounded-full animate-bounce opacity-60" style={{ animationDelay: `${d}s` }} />)}
                </div>
              </div>
            )}
          </div>
        );
      })()}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatMessages;
