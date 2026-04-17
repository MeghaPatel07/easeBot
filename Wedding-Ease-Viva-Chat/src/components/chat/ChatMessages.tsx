import React, { useEffect, useRef, useMemo } from 'react';
import { useTypewriter } from '@/hooks/useTypewriter';
import {
  Send, Sparkles, Calendar, CheckSquare,
  Copy, Download, ThumbsUp, Edit3, Lock,
  RefreshCw, Loader2, Bookmark,
  Check, Volume2, X, ImagePlus,
  ChevronUp, ChevronLeft, ChevronRight,
  Minimize2, Maximize2, Type, GraduationCap, ImageOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Message } from '@/hooks/useChat';
import type { UserProfile } from '@/types';
import ComparisonTable from '@/components/ComparisonTable';
import { ImageCarousel } from '@/components/ImageCarousel';
import { AudioPlayer } from '@/components/AudioPlayer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { modeConfig, markdownToHtml, type ModeOrAuto } from './constants';

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
  onToneModifier: (modifier: string) => void;
  onConvertToTable: (message: Message) => void;
  onSaveProduct: (title: string, url: string, imageUrl: string) => void;
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
  onContinueGenerating, onToneModifier, onConvertToTable, onSaveProduct,
  onOpenPlanner, onShowSignIn, onDeleteImage,
  ttsLoadingId, ttsActiveId, ttsAudioUrls, onTtsPlay, onTtsClose,
  copiedMsgId, savedProductIds,
  pendingScrollToId,
  onSetInputText, onSetSelectedMode,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Track pendingScrollToId via ref so clearing it doesn't re-trigger auto-scroll
  const pendingScrollRef = useRef(pendingScrollToId);
  useEffect(() => { pendingScrollRef.current = pendingScrollToId; }, [pendingScrollToId]);

  // Auto-scroll to bottom on new messages (skip when a targeted scroll is pending)
  useEffect(() => {
    if (pendingScrollRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

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
    if (imgUrl) {
      try {
        const res = await fetch(imgUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([blob], { type: 'image/png' }) })]);
        onCopyMessage(text, msgId);
        return;
      } catch { /* fall through */ }
    }
    onCopyMessage(text, msgId);
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
            className="flex items-center gap-1.5 px-4 py-1.5 text-label font-medium text-primary bg-white/10 border border-primary/20 rounded-full hover:bg-white/15 transition-colors shadow-sm disabled:opacity-50"
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
                <div className="w-full max-w-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* Edit mode container */}
                  <div className="rounded-2xl border border-primary/30 bg-white/[0.06] backdrop-blur-md shadow-xl overflow-hidden">
                    {/* Attached image preview with remove/replace */}
                    {inlineEditImage && (
                      <div className="px-4 pt-4 flex items-start gap-3">
                        <div className="relative group/img">
                          <img src={inlineEditImage} alt="Attached" className="rounded-xl w-[100px] h-[100px] object-cover border border-white/10" />
                          <button
                            onClick={onInlineEditImageRemove}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/90 hover:bg-red-500 text-white flex items-center justify-center shadow-md transition-all opacity-0 group-hover/img:opacity-100"
                            title="Remove image"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        <label className="flex flex-col items-center justify-center w-[100px] h-[100px] rounded-xl border-2 border-dashed border-white/15 hover:border-primary/40 cursor-pointer transition-colors group/upload">
                          <ImagePlus className="h-5 w-5 text-white/30 group-hover/upload:text-primary/60 transition-colors" />
                          <span className="text-3xs text-white/30 group-hover/upload:text-primary/60 mt-1 transition-colors">Replace</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
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
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-white/15 hover:border-primary/40 cursor-pointer transition-colors text-white/40 hover:text-primary/70 text-xs">
                          <ImagePlus className="h-3.5 w-3.5" />
                          <span>Attach image</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
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
                      className="w-full px-4 py-4 bg-transparent text-white/90 text-sm leading-relaxed resize-none outline-none placeholder:text-white/30"
                      placeholder="Edit your message..."
                    />
                    {/* Action bar */}
                    <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06] bg-white/[0.02]">
                      <span className="text-3xs text-white/30">Press Enter to send, Esc to cancel</span>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={onCancelInlineEdit} className="h-8 px-4 text-xs text-white/60 hover:text-white/90 hover:bg-white/10 rounded-xl font-medium">
                          Cancel
                        </Button>
                        <Button size="sm" onClick={() => onSubmitInlineEdit(message)} disabled={!inlineEditText.trim()} className="h-8 px-4 text-xs bg-primary hover:bg-primary/90 text-white rounded-xl font-medium shadow-sm gap-1.5">
                          <Send className="h-3 w-3" />Send
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="group flex flex-col items-end">
                  <div className="max-w-[calc(100%-2rem)] sm:max-w-sm md:max-w-lg lg:max-w-xl px-4 py-3 rounded-2xl rounded-tr-sm bg-white/[0.08] backdrop-blur-sm text-white/90 shadow-sm border border-white/[0.08] msg-enter">
                    {message.attachedImage && (
                      <img src={message.attachedImage} alt="Attached" className="mb-2 rounded-lg max-w-[200px] max-h-[200px] object-cover" />
                    )}
                    <p className="text-[15px] sm:text-caption leading-relaxed">{message.text}</p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 mr-1">
                    <span className="text-3xs text-white/40 uppercase tracking-wider">
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
                            className="h-4 w-4 flex items-center justify-center rounded text-white/40 hover:text-primary disabled:opacity-30 transition-colors"
                          >
                            <ChevronLeft className="h-3 w-3" />
                          </button>
                          <span className="text-3xs text-white/50 font-medium tabular-nums">
                            {info.current + 1}/{info.total}
                          </span>
                          <button
                            onClick={() => onSwitchBranch(info.anchorId, info.current + 1)}
                            disabled={info.current >= info.total - 1}
                            className="h-4 w-4 flex items-center justify-center rounded text-white/40 hover:text-primary disabled:opacity-30 transition-colors"
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
                        <Button variant="ghost" size="sm" onClick={() => onStartInlineEdit(message)} className="h-9 w-9 sm:h-6 sm:w-6 p-0 text-white/40 hover:text-primary hover:bg-primary/10 rounded-lg">
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
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#B89382] to-[#8A6651] flex items-center justify-center text-white text-2xs italic font-headline shadow-sm bot-avatar">E</div>
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
              <div className="mb-1 w-full prose prose-sm prose-invert max-w-none text-[17px] sm:text-[13px] leading-[1.7] bg-white/[0.03] backdrop-blur-md p-4 sm:p-5 rounded-2xl rounded-tl-sm shadow-[0_8px_32px_rgba(0,0,0,0.37)] border border-white/10 text-[#cfcecc] prose-headings:text-[#cfcecc] prose-strong:text-[#cfcecc] prose-em:text-[#cfcecc] prose-li:text-[#cfcecc] prose-p:text-[#cfcecc] prose-blockquote:text-[#cfcecc] prose-code:text-[#cfcecc]">
                <TypewriterMarkdown
                  text={message.text}
                  isStreaming={message.id === streamingMsgId}
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }: any) => (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-mode-stylist-dark hover:text-mode-stylist underline underline-offset-2 font-medium transition-colors">
                        {children}
                      </a>
                    ),
                    img: ({ src, alt }: any) => (
                      <img
                        src={src}
                        alt={alt ?? ''}
                        className="max-w-full w-[120px] sm:w-[200px] h-auto sm:h-[200px] object-cover rounded-xl shadow-sm flex-shrink-0"
                      />
                    ),
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
                            <div className="flex flex-row gap-3 items-start p-3 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.37)] hover:bg-white/[0.06] hover:border-[#A17A63]/40 transition-all duration-200">
                              <a href={href} target="_blank" rel="noopener noreferrer" className="block no-underline flex-1 flex flex-row gap-3 items-center">
                                <img src={imageUrl} alt={typeof title === 'string' ? title : ''} className="w-[80px] h-[80px] object-cover rounded-xl flex-shrink-0" />
                                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                  <span className="text-sm font-semibold text-[#A17A63] leading-snug line-clamp-1">{title}</span>
                                  {description && <span className="text-xs text-[#8A7E72] leading-relaxed line-clamp-2">{description}</span>}
                                </div>
                              </a>
                              {user && (
                                <button
                                  onClick={() => onSaveProduct(title as string, href, imageUrl)}
                                  disabled={isSaved}
                                  className={`flex-shrink-0 p-2 rounded-lg transition-all ${isSaved
                                    ? 'bg-primary/20 text-primary cursor-default'
                                    : 'text-white/40 hover:text-primary hover:bg-primary/10'
                                    }`}
                                  title={isSaved ? 'Already saved' : 'Save to saved items'}
                                >
                                  <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      }
                      return <li>{children}</li>;
                    },
                  }}
                />
              </div>
              {message.audioUrl && (
                <audio controls src={message.audioUrl} className="mt-1 mb-2 w-full max-w-xs rounded-xl h-8" />
              )}
              {/* Image generation skeleton */}
              {message.imageGenerating && !message.imageUrl && !message.imageUrls?.length && (
                <div className="mt-3 mb-2 max-w-[calc(100%-1rem)] sm:max-w-sm md:max-w-md w-full animate-in fade-in duration-300">
                  <div className="relative aspect-square rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.08]">
                    {(message as any).partialImageUrl ? (
                      <>
                        <img
                          src={(message as any).partialImageUrl}
                          alt="Generating..."
                          className="absolute inset-0 w-full h-full object-cover blur-sm transition-all duration-700"
                        />
                        <div className="absolute inset-0 bg-black/20 flex items-end justify-center pb-4">
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm">
                            <Sparkles className="h-3.5 w-3.5 text-[#A17A63] animate-pulse" />
                            <p className="text-xs text-white/80 font-medium">refining image...</p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent animate-[shimmer_1.8s_ease-in-out_infinite]" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center">
                            <Sparkles className="h-5 w-5 text-[#A17A63]/50 animate-pulse" />
                          </div>
                          <div className="space-y-1.5 text-center">
                            <p className="text-xs text-white/40 font-medium">generating image...</p>
                            <p className="text-3xs text-white/25">this may take a few seconds</p>
                          </div>
                          <div className="w-32 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                            <div className="h-full bg-[#A17A63]/30 rounded-full animate-[progress_3s_ease-in-out_infinite]" />
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
              {message.imageDeleted && !message.imageUrls?.length && !message.imageUrl && (
                <div className="mt-2 mb-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] max-w-xs">
                  <ImageOff className="h-4 w-4 text-white/30 flex-shrink-0" />
                  <span className="text-xs text-white/40 italic">Image was deleted</span>
                </div>
              )}
              {message.checklistData && (
                <div className="mt-2 mb-1 bg-white/[0.08] backdrop-blur-sm rounded-2xl rounded-tl-sm shadow-md shadow-black/20 border overflow-hidden max-w-xs w-full">
                  <div className="px-4 py-2.5 bg-primary/5 border-b border-primary/10 flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-headline text-sm font-semibold text-white/85 truncate">{message.checklistData.title}</span>
                    <span className="ml-auto text-3xs text-white/40 font-medium">{message.checklistData.items.length} items</span>
                  </div>
                  <ul className="px-4 py-2 space-y-1.5">
                    {message.checklistData.items.slice(0, 8).map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-white/60">
                        <span className="mt-0.5 h-3.5 w-3.5 rounded border border-white/20 flex-shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                    {message.checklistData.items.length > 8 && (
                      <li className="text-3xs text-white/40 pl-5">+{message.checklistData.items.length - 8} more items</li>
                    )}
                  </ul>
                  {user && (
                    <div className="px-4 py-2 border-t border-white/[0.06]">
                      <button
                        className="text-xs text-primary font-semibold hover:underline"
                        onClick={() => onOpenPlanner(message.checklistData!.id)}
                      >
                        Open in Planner
                      </button>
                    </div>
                  )}
                </div>
              )}
              {message.calendarEvent && message.calendarAdded && (
                <div className="mt-2 mb-1 flex items-center gap-1.5 text-label px-3 py-2 rounded-xl w-fit bg-primary/5 text-primary border border-primary/10">
                  <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="font-semibold">Added to Google Calendar</span>
                  <span className="font-medium text-white/50">. {message.calendarEvent.date}</span>
                </div>
              )}
              {message.calendarEvent && !message.calendarAdded && !user && (
                <div className="mt-2 mb-1 bg-white/[0.08] backdrop-blur-sm p-4 rounded-2xl rounded-tl-sm shadow-md shadow-black/20 border relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12"></div>
                  <div className="relative z-10">
                    <p className="text-3xs text-primary font-bold uppercase tracking-widest mb-0.5">Upcoming Event</p>
                    <h4 className="font-headline text-base text-white/85">{message.calendarEvent.title}</h4>
                    <div className="flex items-center gap-3 mt-2 text-white/50 text-xs">
                      <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {message.calendarEvent.date}</span>
                      {message.calendarEvent.time && <span className="flex items-center gap-1">{message.calendarEvent.time}</span>}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" className="bg-secondary text-white rounded-lg text-label font-semibold hover:bg-secondary/90 shadow-sm gap-1.5 h-7" onClick={onShowSignIn}>
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
                  className="mt-2 mb-1 h-7 text-xs gap-1.5 border-white/15 text-[#D6C1C7] hover:bg-white/[0.06]"
                  onClick={() => onConvertToTable(message)}
                >
                  <CheckSquare className="h-3 w-3" />
                  Save as Table in Planner
                </Button>
              )}
              <div className="flex items-center gap-1 flex-wrap opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => copyMessage(message.text, message.id, message.imageUrl, message.imageUrls)} className="h-9 w-9 sm:h-6 sm:w-6 p-0 hover:bg-white/15 rounded-md">
                      {copiedMsgId === message.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-white/50" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{copiedMsgId === message.id ? 'Copied!' : (message.imageUrl || message.imageUrls?.[0]) ? 'Copy image' : 'Copy message'}</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => downloadMessage(message.text, message.id, message.imageUrl, message.imageUrls)} className="h-9 w-9 sm:h-6 sm:w-6 p-0 hover:bg-white/15 rounded-md">
                      <Download className="h-3 w-3 text-white/50" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{(message.imageUrl || message.imageUrls?.[0]) ? 'Download image' : 'Download as text'}</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => onToggleLike(message.id)} className="h-9 w-9 sm:h-6 sm:w-6 p-0 hover:bg-white/15 rounded-md">
                      <ThumbsUp className={`h-3.5 w-3.5 sm:h-3 sm:w-3 ${message.liked ? 'text-primary fill-current' : 'text-white/50'}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{message.liked ? 'Unlike' : 'Like message'}</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => onRegenerateMessage(message)} className="h-9 w-9 sm:h-6 sm:w-6 p-0 hover:bg-white/15 rounded-md">
                      <RefreshCw className="h-3 w-3 text-white/50" />
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
                      className={`h-9 w-9 sm:h-6 sm:w-6 p-0 hover:bg-white/15 rounded-md ${ttsActiveId === message.id ? 'text-primary' : ''}`}
                    >
                      {ttsLoadingId === message.id
                        ? <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        : <Volume2 className="h-3 w-3 text-white/50" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{ttsActiveId === message.id ? 'Close player' : 'Listen'}</p>
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
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/20 text-2xs text-white/50 hover:border-primary/40 hover:text-primary hover:bg-primary/10 transition-all"
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
                <div className="relative aspect-square rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.08]">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent animate-[shimmer_1.8s_ease-in-out_infinite]" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-[#A17A63]/50 animate-pulse" />
                    </div>
                    <div className="space-y-1.5 text-center">
                      <p className="text-xs text-white/40 font-medium">generating...</p>
                      <p className="text-3xs text-white/25">creating your image</p>
                    </div>
                    <div className="w-32 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full bg-[#A17A63]/30 rounded-full animate-[progress_3s_ease-in-out_infinite]" />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`${cfg.pill} bg-white/[0.03] backdrop-blur-md rounded-2xl rounded-tl-sm px-5 py-3 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.37)] text-white/90 msg-enter`}>
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
