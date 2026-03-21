import React, { useState, useEffect, useRef } from 'react';
import {
  Send, Sparkles, Heart, MessageSquare, Calendar, Lightbulb,
  User, LogIn, UserPlus, Smartphone, LogOut, PanelLeft, Plus,
  Search, ChevronDown, ChevronRight, Bookmark, Image, CheckSquare,
  ShoppingCart, DollarSign, Copy, Download, ThumbsUp, Edit3, Lock,
  MoreHorizontal, Pencil, Trash2, StopCircle, RefreshCw, ArrowLeft,
  Mic, Globe, Check, Loader2, Settings, HelpCircle, Bell, Menu, SquarePen, Pin, PinOff,
  Keyboard, Minimize2, Maximize2, Type, GraduationCap, Volume2, Square, Pause, Play,
  Share2, ChevronUp, ChevronLeft, FileText, CalendarIcon, Archive, ArchiveRestore, Tag, X,
  TrendingUp, Users, BarChart3, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import SignUpModal from '@/components/auth/SignUpModal';
import SignInModal from '@/components/auth/SignInModal';
import { useChat, type Message } from '@/hooks/useChat';
import type { ToolAction } from '@/types';
import { useVoice } from '@/hooks/useVoice';
import { updatePreferredLanguage } from '@/services/authService';
import { searchAllMessages, createSharedChat, type SearchResult } from '@/services/chatService';
import PlannerView from '@/components/PlannerView';
import ChecklistDetail from '@/components/ChecklistDetail';
import BudgetDashboard from '@/components/BudgetDashboard';
import ShoppingListView from '@/components/ShoppingListView';
import SavedItemsView from '@/components/SavedItemsView';
import ComparisonTable, { isMarkdownTable } from '@/components/ComparisonTable';
import TimelineView from '@/components/TimelineView';
import ProgressDashboard from '@/components/ProgressDashboard';
import NotificationPanel from '@/components/NotificationPanel';
import InvitePartner from '@/components/InvitePartner';
import { subscribeToChecklists, computeStats } from '@/services/checklistService';
import { subscribeToBudget, type BudgetData } from '@/services/budgetService';
import { addSavedItem } from '@/services/savedItemsService';
import type { ChatThread, Mode, Checklist } from '@/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '@fontsource/lato';

// ─────────────────────────────────────────────────────────────────────────────
// Supported languages for the language selector
// ─────────────────────────────────────────────────────────────────────────────
const SUPPORTED_LANGUAGES = [
  { code: 'auto', label: '🌐 Auto-detect' },
  { code: 'en', label: '🇬🇧 English' },
  { code: 'hi', label: '🇮🇳 Hindi' },
  { code: 'gu', label: '🇮🇳 Gujarati' },
  { code: 'es', label: '🇪🇸 Spanish' },
  { code: 'fr', label: '🇫🇷 French' },
  { code: 'ar', label: '🇸🇦 Arabic' },
  { code: 'pt', label: '🇧🇷 Portuguese' },
  { code: 'de', label: '🇩🇪 German' },
  { code: 'zh', label: '🇨🇳 Chinese' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Mode configuration — single source of truth for labels, icons, colours
// ─────────────────────────────────────────────────────────────────────────────
type ModeOrAuto = Mode | 'auto'

interface ModeConfig {
  key: ModeOrAuto
  label: string
  icon: React.ElementType
  pill: string       // pill badge on AI messages
  active: string     // selector button when selected
  inactive: string   // selector button when not selected
}

const MODE_CONFIG: ModeConfig[] = [
  {
    key: 'auto',
    label: 'Auto',
    icon: Sparkles,
    pill: 'bg-[#71717A]/10 text-[#71717A]',
    active: 'bg-mode-auto text-white shadow-sm',
    inactive: 'text-stone-600 hover:bg-white/50',
  },
  {
    key: 'planner',
    label: 'Planner',
    icon: Calendar,
    pill: 'bg-[#8A9A5B]/10 text-[#8A9A5B]',
    active: 'bg-mode-planner text-white shadow-sm',
    inactive: 'text-stone-600 hover:bg-white/50',
  },
  {
    key: 'stylist',
    label: 'Stylist',
    icon: Heart,
    pill: 'bg-[#D4AF37]/10 text-[#D4AF37]',
    active: 'bg-mode-stylist text-white shadow-sm',
    inactive: 'text-stone-600 hover:bg-white/50',
  },
  {
    key: 'therapist',
    label: 'Therapist',
    icon: MessageSquare,
    pill: 'bg-[#64748B]/10 text-[#64748B]',
    active: 'bg-mode-therapist text-white shadow-sm',
    inactive: 'text-stone-600 hover:bg-white/50',
  },
  {
    key: 'knowledge',
    label: 'Knowledge',
    icon: Lightbulb,
    pill: 'bg-[#334155]/10 text-[#334155]',
    active: 'bg-mode-knowledge text-white shadow-sm',
    inactive: 'text-stone-600 hover:bg-white/50',
  },
  {
    key: 'consultant',
    label: 'Consultant',
    icon: DollarSign,
    pill: 'bg-[#A87C33]/10 text-[#A87C33]',
    active: 'bg-mode-consultant text-white shadow-sm',
    inactive: 'text-stone-600 hover:bg-white/50',
  },
]

const modeConfig = (key: ModeOrAuto): ModeConfig =>
  MODE_CONFIG.find((m) => m.key === key) ?? MODE_CONFIG[0]

// ─────────────────────────────────────────────────────────────────────────────
// Markdown to HTML converter for rich text copying
// ─────────────────────────────────────────────────────────────────────────────
const markdownToHtml = (markdown: string): string => {
  let html = markdown
    // Line breaks
    .split('\n\n')
    .map(block => {
      block = block
        // Bold: **text** or __text__
        .replace(/\*\*(.*?)\*\*|__(.*?)__/g, '<strong>$1$2</strong>')
        // Italic: *text* or _text_
        .replace(/(?<!\*)\*(.*?)(?<!\*)\*|(?<!_)_(.*?)(?<!_)_/g, '<em>$1$2</em>')
        // Code: `text`
        .replace(/`([^`]+)`/g, '<code style="background-color: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-family: monospace;">$1</code>')
        // Links: [text](url)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #B8860B; text-decoration: underline;">$1</a>')
        // Headers: # text, ## text, etc.
        .replace(/^### (.*?)$/gm, '<h3 style="font-weight: bold; font-size: 1.1em; margin: 0.5em 0;">$1</h3>')
        .replace(/^## (.*?)$/gm, '<h2 style="font-weight: bold; font-size: 1.3em; margin: 0.5em 0;">$1</h2>')
        .replace(/^# (.*?)$/gm, '<h1 style="font-weight: bold; font-size: 1.5em; margin: 0.5em 0;">$1</h1>')
        // Unordered lists
        .replace(/^\* (.*?)$/gm, '<li>$1</li>')
        .replace(/^\- (.*?)$/gm, '<li>$1</li>')
        // Blockquotes
        .replace(/^> (.*?)$/gm, '<blockquote style="border-left: 3px solid #ccc; padding-left: 10px; margin: 10px 0; color: #666;">$1</blockquote>')
      
      // Wrap list items in ul tags
      if (block.includes('<li>')) {
        block = '<ul style="margin: 10px 0; padding-left: 20px;">' + block + '</ul>'
      }
      
      // Wrap non-wrapped blocks in paragraphs
      if (block && !block.match(/^<[hp]/)) {
        block = '<p style="margin: 10px 0; line-height: 1.5;">' + block + '</p>'
      }
      
      return block
    })
    .join('')
  
  return `<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6;">${html}</body></html>`
}
// Tag presets for conversation organization
// ─────────────────────────────────────────────────────────────────────────────
const TAG_PRESETS = [
  { name: 'Venue',      color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { name: 'Catering',   color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { name: 'Budget',     color: 'bg-green-100 text-green-700 border-green-200' },
  { name: 'Style',      color: 'bg-pink-100 text-pink-700 border-pink-200' },
  { name: 'Attire',     color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { name: 'Music',      color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { name: 'Flowers',    color: 'bg-rose-100 text-rose-700 border-rose-200' },
  { name: 'Photo',      color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { name: 'Guest List', color: 'bg-teal-100 text-teal-700 border-teal-200' },
  { name: 'Other',      color: 'bg-stone-100 text-stone-700 border-stone-200' },
]

const getTagStyle = (tagName: string) =>
  TAG_PRESETS.find(t => t.name === tagName)?.color ?? 'bg-stone-100 text-stone-700 border-stone-200'

// ─────────────────────────────────────────────────────────────────────────────
// InputBar — defined OUTSIDE Index so its identity stays stable across renders.
// Contains the mode dropdown alongside the send button.
// ─────────────────────────────────────────────────────────────────────────────
interface InputBarProps {
  inputText: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isTyping: boolean;
  placeholder: string;
  isRecording: boolean;
  voiceState: 'idle' | 'recording' | 'transcribing';
  onMicClick: () => void;
}

const InputBar = ({
  inputText, onInputChange, onSend, onStop, isTyping, placeholder,
  isRecording, voiceState, onMicClick,
}: InputBarProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize: reset to auto then set to scrollHeight (capped at 200px)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [inputText]);

  return (
    <div className="bg-white rounded-2xl p-1.5 shadow-md shadow-stone-200/30 border border-[#EBE4D9] max-w-3xl mx-auto w-full">
      <div className="flex items-end gap-1">
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
          className="flex-1 bg-transparent border-none text-stone-800 py-2 px-3 custom-scrollbar resize-none text-sm max-h-32 placeholder-stone-400 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
          style={{ minHeight: '36px', maxHeight: '160px' }}
        />

        {/* Right side: mic + send/stop */}
        <div className="flex items-center gap-0.5 pr-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={onMicClick}
            disabled={voiceState === 'transcribing'}
            title={voiceState === 'recording' ? 'Stop recording' : voiceState === 'transcribing' ? 'Transcribing…' : 'Record voice message'}
            className={`p-2 transition-colors rounded-lg ${voiceState === 'recording'
              ? 'text-red-500'
              : voiceState === 'transcribing'
                ? 'text-amber-500'
                : 'text-stone-400 hover:text-primary'
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
            <button onClick={onStop} className="p-2 bg-red-500 text-white rounded-xl hover:bg-red-600 active:scale-95 transition-all">
              <StopCircle className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={onSend} disabled={!inputText.trim()} className="p-2 bg-primary text-white rounded-xl hover:opacity-90 active:scale-95 transition-all disabled:opacity-40">
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {voiceState === 'recording' && (
        <p className="text-[9px] font-semibold text-red-500 animate-pulse tracking-wide pl-3 pb-0.5">Listening…</p>
      )}
      {voiceState === 'transcribing' && (
        <p className="text-[9px] font-semibold text-amber-500 tracking-wide pl-3 pb-0.5">Processing…</p>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Index
// ─────────────────────────────────────────────────────────────────────────────
const Index = () => {
  const navigate = useNavigate();
  const { threadId: urlThreadId } = useParams<{ threadId: string }>();
  const { user, profile, signOut } = useAuth();
  const {
    messages,
    threads,
    activeThreadId,
    isTyping,
    allLikedMessages,
    calendarEvents,
    lastToolActions,
    sendMessage,
    stopGeneration,
    loadChat,
    startNewChat,
    deleteThread,
    renameThread,
    truncateMessages,
    restoreMessages,
    toggleLike,
    pinThread,
    archiveThread,
    updateThreadTags,
    hasMoreMessages,
    loadMoreMessages,
  } = useChat();

  // When AI marks an item as done, flash the checkbox for 2s
  useEffect(() => {
    const doneActions = lastToolActions.filter(a => a.tool === 'mark_as_done' && a.itemId)
    if (doneActions.length > 0) {
      const ids = doneActions.map(a => a.itemId!)
      setRecentlyToggledItemIds(ids)
      const t = setTimeout(() => setRecentlyToggledItemIds([]), 2000)
      return () => clearTimeout(t)
    }
    // Auto-open newly created checklist in the detail panel
    const created = lastToolActions.find(a => a.tool === 'create_checklist' && a.checklistId)
    if (created?.checklistId) {
      setSidebarView('planner')
      setSelectedChecklistId(created.checklistId)
    }
  }, [lastToolActions]);

  const isExpanded = messages.length > 0;

  // ── URL ↔ thread sync ──────────────────────────────────────────────────────
  // When URL has a threadId that doesn't match the active thread, load it
  useEffect(() => {
    if (urlThreadId && urlThreadId !== activeThreadId) {
      loadChat(urlThreadId);
    } else if (!urlThreadId && activeThreadId) {
      // URL is "/" but we have an active thread — clear it (user navigated home)
      startNewChat();
    }
  }, [urlThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When a new thread is created (activeThreadId goes from null → value), update URL
  useEffect(() => {
    if (activeThreadId && activeThreadId !== urlThreadId) {
      navigate(`/chat/${activeThreadId}`, { replace: true });
    }
  }, [activeThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── UI-only state ──────────────────────────────────────────────────────────
  const [inputText, setInputText] = useState('');
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [showSignUpModal, setShowSignUpModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAssetsOpen, setIsAssetsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMode, setSelectedMode] = useState<ModeOrAuto>('auto');
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditText, setInlineEditText] = useState('');
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [sidebarView, setSidebarView] = useState<'history' | 'liked' | 'reminders' | 'planner' | 'saved-items' | 'moodboard' | 'shopping' | 'budget' | 'timeline' | 'progress' | 'notifications' | 'collaborate'>('history');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [ttsState, setTtsState] = useState<{ msgId: string; status: 'speaking' | 'paused' } | null>(null);
  const [savedProductIds, setSavedProductIds] = useState<Set<string>>(new Set());
  const [signUpPrefillEmail, setSignUpPrefillEmail] = useState<string | undefined>(undefined);
  const [recentlyToggledItemIds, setRecentlyToggledItemIds] = useState<string[]>([]);
  const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(null);
  const [pendingScrollToId, setPendingScrollToId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [preferredLang, setPreferredLang] = useState<string>(() => profile?.preferredLanguage ?? 'auto');

  const { voiceState, isRecording, interimText, startRecording, stopRecording, cancelRecording } = useVoice()
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [tagPickerThreadId, setTagPickerThreadId] = useState<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Message branching (edit history) ──────────────────────────────────────
  // Key = anchorId (ID of last common message before edit, or "__root__" if edit is at idx 0)
  // Value = saved branch tails and the active branch index
  const [branchMap, setBranchMap] = useState<Record<string, { tails: Message[][]; active: number }>>({});

  // ── Overdue badge for Planner sidebar item ───────────────────────────────
  const [overdueCount, setOverdueCount] = useState(0);
  const [checklistsData, setChecklistsData] = useState<Checklist[]>([]);
  useEffect(() => {
    if (!user) { setOverdueCount(0); setChecklistsData([]); return; }
    return subscribeToChecklists(user.uid, (cls: Checklist[]) => {
      setChecklistsData(cls);
      setOverdueCount(computeStats(cls).overdue);
    });
  }, [user?.uid]);

  // ── Budget data for sidebar badge + progress dashboard ─────────────────
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  useEffect(() => {
    if (!user) { setBudgetData(null); return; }
    return subscribeToBudget(user.uid, setBudgetData);
  }, [user?.uid]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (pendingScrollToId) return; // don't fight the liked-message scroll
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Scroll to + highlight a specific message after thread loads
  useEffect(() => {
    if (!pendingScrollToId || messages.length === 0) return;
    const el = document.getElementById(`msg-${pendingScrollToId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(pendingScrollToId);
    setPendingScrollToId(null);
    const timer = setTimeout(() => setHighlightedMessageId(null), 2000);
    return () => clearTimeout(timer);
  }, [messages, pendingScrollToId]);

  // ── Full-text search (debounced) ─────────────────────────────────────────
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!searchQuery || searchQuery.length < 2 || !user) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchAllMessages(user.uid, searchQuery, threads);
        setSearchResults(results);
      } catch (err) {
        console.error('[search] error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, user, threads]);

  // ── Share conversation handler ──────────────────────────────────────────
  const handleShareThread = async (threadId: string) => {
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return;
    try {
      const shareId = await createSharedChat(threadId, thread.title);
      const shareUrl = `${window.location.origin}/share/${shareId}`;
      await navigator.clipboard.writeText(shareUrl);
      // Simple feedback via a brief toast-style alert
      const toast = document.createElement('div');
      toast.textContent = 'Share link copied to clipboard!';
      toast.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-xs px-4 py-2 rounded-full shadow-lg z-50 animate-in fade-in';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
    } catch (err) {
      console.error('[share] error:', err);
    }
  };

  // ── Load more messages handler ──────────────────────────────────────────
  const handleLoadMoreMessages = async () => {
    if (loadingMoreMessages || !hasMoreMessages) return;
    setLoadingMoreMessages(true);
    const container = scrollContainerRef.current;
    const prevHeight = container?.scrollHeight ?? 0;
    await loadMoreMessages();
    // Preserve scroll position after prepending older messages
    requestAnimationFrame(() => {
      if (container) {
        const newHeight = container.scrollHeight;
        container.scrollTop += newHeight - prevHeight;
      }
      setLoadingMoreMessages(false);
    });
  };

  // ── Global keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Shift+N → New chat
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        handleNewChat();
      }
      // Ctrl+Shift+S → Toggle sidebar
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        setIsSidebarOpen(v => !v);
      }
      // Ctrl+/ → Toggle shortcuts overlay
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        setShowShortcuts(v => !v);
      }
      // Escape → stop generation / close shortcuts
      if (e.key === 'Escape') {
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (isTyping) { stopGeneration(); return; }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isTyping, showShortcuts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleLikedMessageClick = async (msg: Message) => {
    setSidebarView('history');
    if (msg.threadId && msg.threadId !== activeThreadId) {
      navigate(`/chat/${msg.threadId}`);
    }
    setPendingScrollToId(msg.id);
  };

  const langHint = preferredLang === 'auto' ? undefined : preferredLang;

  const handleSendMessage = () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    const mode = selectedMode === 'auto' ? undefined : selectedMode;
    // Use detected voice language if available, otherwise fall back to preferred lang
    const lang = voiceLanguage ?? langHint;
    setVoiceLanguage(null);
    sendMessage(text, undefined, mode, lang);
  };

  const handleMicClick = async () => {
    if (voiceState === 'recording') {
      // Stop and transcribe — result arrives async, UI shows spinner
      stopRecording().then(result => {
        if (result?.text) {
          setInputText(result.text);
          setVoiceLanguage(result.detectedLanguage);
        }
      });
    } else if (voiceState === 'idle') {
      const err = await startRecording();
      if (err) alert(`Microphone error: ${err}`);
    }
  };

  const handleLanguageChange = async (code: string) => {
    setPreferredLang(code);
    if (user) {
      await updatePreferredLanguage(user.uid, code);
    }
  };

  const startInlineEdit = (m: Message) => {
    setInlineEditId(m.id);
    setInlineEditText(m.text);
  };

  const cancelInlineEdit = () => {
    setInlineEditId(null);
    setInlineEditText('');
  };

  const submitInlineEdit = (m: Message) => {
    const text = inlineEditText.trim();
    if (!text) return;
    const idx = messages.findIndex(msg => msg.id === m.id);
    if (idx !== -1) {
      // Save old branch before truncating
      const anchorId = idx > 0 ? messages[idx - 1].id : '__root__';
      const oldTail = messages.slice(idx);
      setBranchMap(prev => {
        const existing = prev[anchorId];
        if (existing) {
          // Save current active tail, add to branches
          const newTails = [...existing.tails];
          newTails[existing.active] = oldTail;
          return { ...prev, [anchorId]: { tails: newTails, active: newTails.length } };
        }
        // First edit at this point: save old tail as branch 0, new messages will be branch 1
        return { ...prev, [anchorId]: { tails: [oldTail], active: 1 } };
      });
      truncateMessages(idx);
    }
    setInlineEditId(null);
    setInlineEditText('');
    const mode = selectedMode === 'auto' ? undefined : selectedMode;
    sendMessage(text, undefined, mode, langHint);
  };

  // ── Branch navigation ─────────────────────────────────────────────────────
  const switchBranch = (anchorId: string, newIndex: number) => {
    const bp = branchMap[anchorId];
    if (!bp) return;

    // Find anchor position
    const anchorIdx = anchorId === '__root__' ? -1 : messages.findIndex(m => m.id === anchorId);
    const currentTail = messages.slice(anchorIdx + 1);

    // Save current tail into the active branch slot
    const newTails = [...bp.tails];
    if (bp.active < newTails.length) {
      newTails[bp.active] = currentTail;
    } else {
      // Active branch was the "live" one (not yet saved)
      newTails.push(currentTail);
    }

    // Load the selected branch
    const selectedTail = newTails[newIndex] ?? [];
    const prefix = messages.slice(0, anchorIdx + 1);
    restoreMessages([...prefix, ...selectedTail]);

    setBranchMap(prev => ({
      ...prev,
      [anchorId]: { tails: newTails, active: newIndex },
    }));
  };

  // Helper: get branch info for a message (returns null if no branches at this point)
  const getBranchInfo = (msgIndex: number): { anchorId: string; total: number; current: number } | null => {
    if (messages[msgIndex]?.sender !== 'user') return null;
    const anchorId = msgIndex > 0 ? messages[msgIndex - 1].id : '__root__';
    const bp = branchMap[anchorId];
    if (!bp) return null;
    const total = Math.max(bp.tails.length, bp.active + 1);
    return { anchorId, total, current: bp.active };
  };

  const handleRegenerateMessage = (m: Message) => {
    const idx = messages.findIndex(msg => msg.id === m.id);
    let userMsgIdx = idx - 1;
    while (userMsgIdx >= 0 && messages[userMsgIdx].sender !== 'user') userMsgIdx--;
    if (userMsgIdx >= 0) {
      const userMsg = messages[userMsgIdx];
      truncateMessages(userMsgIdx);
      sendMessage(userMsg.text);
    }
  };

  const handleDeleteThread = (threadId: string) => {
    deleteThread(threadId);
    if (threadId === activeThreadId) navigate('/');
  };

  const handleArchiveThread = (threadId: string, archived: boolean) => {
    archiveThread(threadId, archived);
    if (archived && threadId === activeThreadId) navigate('/');
  };

  const handleToggleTag = (threadId: string, tagName: string) => {
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return;
    const currentTags = thread.tags ?? [];
    const newTags = currentTags.includes(tagName)
      ? currentTags.filter(t => t !== tagName)
      : [...currentTags, tagName];
    updateThreadTags(threadId, newTags);
  };

  const submitRename = async (threadId: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) await renameThread(threadId, trimmed);
    setRenamingThreadId(null);
  };

  const handleNewChat = () => { startNewChat(); setInputText(''); setSidebarView('history'); setSelectedChecklistId(null); setBranchMap({}); navigate('/'); };

  const handleLoadChat = (threadId: string) => { setBranchMap({}); navigate(`/chat/${threadId}`); };

  const copyMessage = async (text: string, msgId: string) => {
    try {
      const html = markdownToHtml(text);
      
      // Create blob for HTML format
      const htmlBlob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([text], { type: 'text/plain' });
      
      // Write both formats to clipboard
      const items: Record<string, Blob> = {
        'text/html': htmlBlob,
        'text/plain': textBlob,
      };
      
      const clipboardItem = new ClipboardItem(items);
      await navigator.clipboard.write([clipboardItem]);
      
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 1500);
    } catch (err) {
      // Fallback: just copy plain text
      try {
        await navigator.clipboard.writeText(text);
        setCopiedMsgId(msgId);
        setTimeout(() => setCopiedMsgId(null), 1500);
      } catch (e) {
        console.error('Failed to copy:', e);
      }
    }
  };

  const handleConvertToTable = async (message: Message) => {
    if (!user) return;
    // Ask the AI to convert in-context by triggering a planner mode message
    const prompt = `Convert the following response into a Markdown table and save it as a page in my planner:\n\n${message.text}`;
    setSelectedMode('planner');
    setInputText(prompt);
    // Switch to planner tab so user sees the result
    setSidebarView('planner');
  };

  const downloadMessage = (text: string, id: string) => {
    const el = document.createElement('a');
    el.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    el.download = `message-${id}.txt`;
    document.body.appendChild(el); el.click(); document.body.removeChild(el);
  };

  const handleContinueGenerating = () => {
    const mode = selectedMode === 'auto' ? undefined : selectedMode;
    sendMessage('Please continue from where you stopped.', undefined, mode, langHint);
  };

  const handleToneModifier = (modifier: string) => {
    const mode = selectedMode === 'auto' ? undefined : selectedMode;
    sendMessage(`Rewrite your last response but make it ${modifier}.`, undefined, mode, langHint);
  };

  const handleSaveProduct = async (productTitle: string, productUrl: string, imageUrl: string) => {
    if (!user) return;
    
    // Create unique product ID
    const productId = `${productTitle}-${productUrl}`.toLowerCase().replace(/\s+/g, '-');
    
    if (savedProductIds.has(productId)) return; // Already saved
    
    try {
      // Store product metadata as JSON for clean display
      const productData = {
        type: 'product',
        url: productUrl,
        image: imageUrl,
      };
      
      await addSavedItem(user.uid, {
        text: productTitle,
        category: 'Vendor',
        sourceThreadId: activeThreadId,
        sourceThreadTitle: threads.find(t => t.id === activeThreadId)?.title ?? null,
        note: JSON.stringify(productData),
      });
      setSavedProductIds(prev => new Set([...prev, productId]));
    } catch (err) {
      console.error('Failed to save product:', err);
    }
  };

  // ── Language code mapping for SpeechSynthesis ─────────────────────────────
  const langToVoiceLocale: Record<string, string> = {
    en: 'en-US', hi: 'hi-IN', gu: 'gu-IN', es: 'es-ES', fr: 'fr-FR',
    ar: 'ar-SA', pt: 'pt-BR', de: 'de-DE', zh: 'zh-CN', ja: 'ja-JP',
    ko: 'ko-KR', ru: 'ru-RU', it: 'it-IT',
  };

  const handleTtsPlay = (message: { id: string; text: string; language?: string }) => {
    window.speechSynthesis.cancel();

    // Strip markdown symbols for cleaner speech
    let plainText = message.text
      .replace(/```[\s\S]*?```/g, ' ... code block ... ')   // replace code blocks
      .replace(/`([^`]+)`/g, '$1')                           // inline code → just text
      .replace(/#{1,6}\s*/g, '')                              // headings
      .replace(/\*\*([^*]+)\*\*/g, '$1')                     // bold
      .replace(/\*([^*]+)\*/g, '$1')                          // italic
      .replace(/[_~`>|[\]()]/g, '')                           // remaining markdown chars
      .replace(/^\s*[-•]\s+/gm, ', ')                         // bullet points → comma pause
      .replace(/^\s*\d+\.\s+/gm, ', ')                        // numbered lists → comma pause
      .replace(/([.!?])\s*\n/g, '$1 ... ')                    // paragraph breaks → long pause
      .replace(/\n{2,}/g, ' ... ')                             // double newlines → pause
      .replace(/\n/g, ', ')                                    // single newlines → short pause
      .replace(/\s{2,}/g, ' ')                                 // collapse whitespace
      .trim();

    if (!plainText) return;

    const lang = message.language || 'en';
    const locale = langToVoiceLocale[lang] || lang;

    // Pick the best female voice — strongly prefer soft, natural-sounding women's voices
    const voices = window.speechSynthesis.getVoices();
    const langVoices = voices.filter(v => v.lang.startsWith(lang));
    const enVoices = voices.filter(v => v.lang.startsWith('en'));
    const candidates = langVoices.length ? langVoices : enVoices;

    // Known soft female voice names across platforms (Windows, macOS, Chrome, Edge)
    const softFemaleNames = [
      'jenny', 'aria', 'sonia', 'zira', 'hazel', 'susan', 'linda',   // Microsoft
      'samantha', 'karen', 'moira', 'tessa', 'fiona', 'victoria',     // macOS
      'google us english', 'google uk english female',                  // Chrome
    ];

    const isFemaleVoice = (v: SpeechSynthesisVoice) =>
      softFemaleNames.some(n => v.name.toLowerCase().includes(n)) ||
      /female/i.test(v.name);

    // Priority: natural/neural female > any female > neural any > Google > cloud > first
    const preferredVoice =
      candidates.find(v => /natural|neural|online/i.test(v.name) && isFemaleVoice(v)) ||
      candidates.find(v => isFemaleVoice(v)) ||
      candidates.find(v => /natural|neural|online/i.test(v.name)) ||
      candidates.find(v => /google/i.test(v.name)) ||
      candidates.find(v => !v.localService) ||
      candidates[0] ||
      null;

    const utterance = new SpeechSynthesisUtterance(plainText);
    utterance.lang = locale;
    utterance.rate = 0.88;    // slower, gentler pace
    utterance.pitch = 1.15;   // higher pitch for soft feminine tone
    utterance.volume = 0.75;  // softer volume

    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onend = () => setTtsState(null);
    utterance.onerror = () => setTtsState(null);

    setTtsState({ msgId: message.id, status: 'speaking' });
    window.speechSynthesis.speak(utterance);
  };

  const handleTtsPause = () => {
    window.speechSynthesis.pause();
    setTtsState(prev => prev ? { ...prev, status: 'paused' } : null);
  };

  const handleTtsResume = () => {
    window.speechSynthesis.resume();
    setTtsState(prev => prev ? { ...prev, status: 'speaking' } : null);
  };

  const handleTtsStop = (msgId: string) => {
    window.speechSynthesis.cancel();
    setTtsState(null);
  };

  // Cleanup speech on unmount
  useEffect(() => {
    return () => { window.speechSynthesis.cancel(); };
  }, []);

  const actionButtons = [
    { icon: Calendar, text: 'Plan my timeline', action: 'Help me create a wedding planning timeline' },
    { icon: Heart, text: 'Find my style', action: 'Help me discover my wedding style' },
    { icon: Lightbulb, text: 'Get inspiration', action: 'Show me trending wedding ideas for 2024' },
    { icon: MessageSquare, text: 'Budget planning', action: 'Help me set a realistic wedding budget' },
  ];

  const formatDateGroup = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    const diff = Math.floor((today.getTime() - date.getTime()) / 86400000);
    if (diff <= 7) return 'Previous 7 Days';
    if (diff <= 30) return 'Previous 30 Days';
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
  };

  
  const filteredThreads = threads
    .filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(t => !t.archived)
    .filter(t => !selectedTagFilter || (t.tags ?? []).includes(selectedTagFilter));
  const archivedThreads = threads.filter(t => t.archived && t.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const pinnedThreads = filteredThreads.filter(t => t.pinned);
  const unpinnedThreads = filteredThreads.filter(t => !t.pinned);
  // Collect all tags in use across threads for the filter bar
  const allUsedTags = Array.from(new Set(threads.flatMap(t => t.tags ?? [])));
  const groupedThreads = unpinnedThreads.reduce((acc, t) => {
    const key = formatDateGroup((t.updatedAt as any)?.toDate?.() ?? new Date());
    (acc[key] ??= []).push(t);
    return acc;
  }, {} as Record<string, ChatThread[]>);
  const dateGroupOrder = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days'];
  const sortedGroupKeys = Object.keys(groupedThreads).sort((a, b) => {
    const ai = dateGroupOrder.indexOf(a), bi = dateGroupOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    return ai !== -1 ? -1 : bi !== -1 ? 1 : 0;
  });

  // ── Shared JSX fragments (inlined, not inner components) ──────────────────
  // ── Stitch-style Quick Actions (flat nav, not collapsible) ────────────────
  const quickActions = [
    { view: 'liked' as const, icon: ThumbsUp, label: 'Liked', badge: allLikedMessages.length },
    { view: 'reminders' as const, icon: Calendar, label: 'Reminders', badge: calendarEvents.length },
    { view: 'planner' as const, icon: CheckSquare, label: 'Planner', badge: overdueCount, authOnly: true },
    // { view: 'budget' as const, icon: DollarSign, label: 'Budget', badge: 0, authOnly: true },
    // { view: 'shopping' as const, icon: ShoppingCart, label: 'Shopping', badge: 0, authOnly: true },
    { view: 'saved-items' as const, icon: Bookmark, label: 'Saved', badge: 0, authOnly: true },
    { view: 'timeline' as const, icon: Clock, label: 'Timeline', badge: 0, authOnly: true },
    // { view: 'progress' as const, icon: BarChart3, label: 'Progress', badge: 0, authOnly: true },
    // { view: 'notifications' as const, icon: Bell, label: 'Alerts', badge: 0, authOnly: true },
    // { view: 'collaborate' as const, icon: Users, label: 'Collaborate', badge: 0, authOnly: true },
    // { view: 'moodboard' as const, icon: Image, label: 'Moodboard', badge: 0 },
  ];

  const sidebarJSX = (
    <aside className={`fixed left-0 top-0 h-full flex flex-col bg-[#f4f4ed] border-r border-[#EBE4D9] shadow-[4px_0_12px_rgba(0,0,0,0.08)] transition-all duration-200 ease-in-out z-30 font-body ${isSidebarOpen ? 'w-[280px]' : 'w-0'} overflow-hidden`}>
      <div className="flex flex-col h-full">
        {/* Compact Header */}
        <div className="px-3 pt-4 pb-2 flex-shrink-0 flex items-center justify-between gap-2">
          <h1 className="font-headline text-lg font-bold text-stone-800">Viva</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsSearchVisible(!isSearchVisible)}
              className={`p-1.5 rounded-lg transition-all ${isSearchVisible ? 'text-[#A2B29D] bg-white' : 'text-stone-400 hover:text-[#A2B29D] hover:bg-white/50'}`}
              title="Search"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-1.5 text-stone-400 hover:text-[#A2B29D] rounded-lg transition-all"
              title="Collapse"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* New Chat Button - Compact */}
        <div className="px-3 pb-2 flex-shrink-0">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-white border border-[#A2B29D]/20 hover:border-[#A2B29D]/50 hover:bg-white shadow-sm transition-all"
          >
            <SquarePen className="h-4 w-4 text-[#A2B29D]" />
            <span className="text-sm font-semibold text-stone-700">New chat</span>
          </button>
        </div>

        {/* Search Bar */}
        {isSearchVisible && (
          <div className="px-3 pb-2 flex-shrink-0 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
              <Input
                autoFocus
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 bg-white border-[#A2B29D]/10 text-stone-700 rounded-lg text-xs focus:ring-[#A2B29D]/30 h-9 w-full shadow-sm"
              />
            </div>
            {/* Search results */}
            {searchQuery.length >= 2 && (
              <div className="mt-2 space-y-0.5 max-h-40 overflow-y-auto text-xs">
                {isSearching && <div className="text-stone-400 px-3 py-1">Searching...</div>}
                {!isSearching && searchResults.length > 0 && (
                  searchResults.slice(0, 5).map((r, i) => (
                    <button
                      key={`${r.threadId}-${r.messageId}-${i}`}
                      onClick={() => {
                        handleLoadChat(r.threadId);
                        setPendingScrollToId(r.messageId);
                        setSidebarView('history');
                      }}
                      className="w-full text-left px-2 py-1 rounded hover:bg-white/60 transition-colors"
                    >
                      <p className="text-[10px] font-medium text-stone-700 truncate">{r.threadTitle}</p>
                      <p className="text-[9px] text-stone-400 truncate">{r.snippet}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Main Navigation */}
        <nav className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2 space-y-1 min-h-0">
          {/* Quick Actions */}
          <Collapsible open={isQuickActionsOpen} onOpenChange={setIsQuickActionsOpen}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-3 mb-2 hover:bg-white/80 rounded-lg py-2 transition-all group/title shadow-sm border border-transparent hover:border-white/40">
                <h3 className="uppercase font-label tracking-widest text-[11px] text-stone-600 font-extrabold group-hover/title:text-[#A2B29D] transition-colors">Quick Actions</h3>
                <div className="p-0.5 rounded-md transition-all text-stone-400 group-hover/title:text-[#A2B29D]">
                  {isQuickActionsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 px-1 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
              {quickActions.map(({ view, icon: Icon, label, badge, authOnly }) => {
                if (authOnly && !user) return null;
                const isActive = sidebarView === view;
                return (
                  <button
                    key={view}
                    onClick={() => setSidebarView(view as any)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all text-sm ${isActive ? 'bg-white text-[#A2B29D] font-bold shadow-lg border border-[#A2B29D]/10 scale-[1.02]' : 'text-stone-600 hover:text-[#A2B29D] hover:bg-white/90 hover:shadow-md'}`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span>{label}</span>
                    {badge > 0 && (
                      <span className={`ml-auto text-[10px] rounded-full px-2 py-0.5 font-bold ${
                        view === 'planner' ? (isActive ? 'bg-red-400/30 text-white' : 'bg-red-100 text-red-600') : (isActive ? 'bg-white/20 text-white' : 'bg-primary/20 text-primary')
                      }`}>{badge}</span>
                    )}
                  </button>
                );
              })}
            </CollapsibleContent>
          </Collapsible>

          {/* Threads */}
          {user && sidebarView !== 'planner' && (
            <div>
              {/* Pinned Threads */}
              {pinnedThreads.length > 0 && (
                <div className="mb-4">
                  <h3 className="uppercase font-label tracking-widest text-[10px] text-stone-500 mb-3 px-3 font-semibold flex items-center gap-1.5">
                    <Pin className="h-3 w-3" />Pinned
                  </h3>
                  <div className="space-y-0.5 px-1">
                    {pinnedThreads.map(thread => (
                      <div key={thread.id} className="group relative flex items-start gap-1 rounded-xl overflow-hidden py-1 px-2">
                        {renamingThreadId === thread.id ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') submitRename(thread.id);
                              if (e.key === 'Escape') setRenamingThreadId(null);
                            }}
                            onBlur={() => submitRename(thread.id)}
                            className="flex-1 text-sm px-3 py-2 rounded-lg bg-white border border-primary/30 outline-none focus:ring-1 focus:ring-primary/40 text-stone-900"
                          />
                        ) : (
                          <>
                            <button
                              onClick={() => { handleLoadChat(thread.id); setSidebarView('history'); }}
                              className={`flex-1 text-left text-sm  rounded-lg transition-all min-w-0 ${activeThreadId === thread.id ? 'bg-white text-[#A2B29D] font-bold shadow-md border border-[#A2B29D]/10' : 'text-stone-600 hover:text-[#A2B29D] hover:bg-white/60 hover:shadow-sm'}`}
                            >
                              <div className="flex items-center gap-1.5">
                                <Pin className="h-3 w-3 text-primary/50 flex-shrink-0" />
                                <span className="truncate">{thread.title}</span>
                              </div>
                              {(thread.tags ?? []).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {thread.tags.map(tag => (
                                    <span key={tag} className={`text-[8px] px-1 py-0.5 rounded-full border font-medium ${getTagStyle(tag)}`}>{tag}</span>
                                  ))}
                                </div>
                              )}
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 rounded hover:bg-white/80 transition-opacity" onClick={e => e.stopPropagation()}>
                                  <MoreHorizontal className="h-3.5 w-3.5 text-stone-500" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="w-44 bg-white/95 backdrop-blur-sm" align="end">
                                <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => pinThread(thread.id, false)}>
                                  <PinOff className="mr-2 h-3.5 w-3.5" />Unpin
                                </DropdownMenuItem>
                                <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => handleArchiveThread(thread.id, true)}>
                                  <Archive className="mr-2 h-3.5 w-3.5" />Archive
                                </DropdownMenuItem>
                                <DropdownMenuItem className="cursor-pointer text-xs" onClick={(e) => { e.preventDefault(); setTagPickerThreadId(tagPickerThreadId === thread.id ? null : thread.id); }}>
                                  <Tag className="mr-2 h-3.5 w-3.5" />Tags
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => handleShareThread(thread.id)}>
                                  <Share2 className="mr-2 h-3.5 w-3.5" />Share
                                </DropdownMenuItem>
                                <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => { setRenamingThreadId(thread.id); setRenameValue(thread.title); }}>
                                  <Pencil className="mr-2 h-3.5 w-3.5" />Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem className="cursor-pointer text-xs text-red-500 focus:text-red-500" onClick={() => handleDeleteThread(thread.id)}>
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Threads */}
              <h3 className="uppercase font-label tracking-widest text-[10px] text-stone-500 mb-3 px-3 font-semibold">Recent Threads</h3>

              <div className="space-y-4 px-1">
                {sortedGroupKeys.length === 0 && pinnedThreads.length === 0 && !searchQuery && <p className="text-[11px] text-stone-400 text-center py-6 px-4 bg-white/40 rounded-2xl border border-[#EBE4D9] italic">Your conversations will appear here.</p>}
                {sortedGroupKeys.length === 0 && searchQuery && <p className="text-xs text-stone-500 text-center py-4">No chats found for "{searchQuery}"</p>}
                {sortedGroupKeys.map(dateKey => (
                  <div key={dateKey}>
                    <h4 className="mb-2.5 px-3 uppercase tracking-[0.15em] text-[10px] text-stone-600 font-bold">{dateKey}</h4>
                    <div className="space-y-0.5">
                      {groupedThreads[dateKey].map(thread => (
                        <div key={thread.id} className="group relative flex items-start gap-1 rounded-xl overflow-hidden py-1 px-2">
                          {renamingThreadId === thread.id ? (
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') submitRename(thread.id);
                                if (e.key === 'Escape') setRenamingThreadId(null);
                              }}
                              onBlur={() => submitRename(thread.id)}
                              className="flex-1 text-sm px-3 py-2 rounded-lg bg-white border border-primary/30 outline-none focus:ring-1 focus:ring-primary/40 text-stone-900"
                            />
                          ) : (
                            <>
                              <button
                                onClick={() => { handleLoadChat(thread.id); setSidebarView('history'); }}
                                className={`flex-1 text-left text-sm rounded-lg transition-all min-w-0 ${activeThreadId === thread.id ? 'bg-white text-[#A2B29D] font-bold shadow-md border border-[#A2B29D]/10' : 'text-stone-600 hover:text-[#A2B29D] hover:bg-white/60 hover:shadow-sm'}`}
                              >
                                <span className="truncate block">{thread.title}</span>
                                {(thread.tags ?? []).length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {thread.tags.map(tag => (
                                      <span key={tag} className={`text-[8px] px-1 py-0.5 rounded-full border font-medium ${getTagStyle(tag)}`}>{tag}</span>
                                    ))}
                                  </div>
                                )}
                              </button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 rounded hover:bg-white/80 transition-opacity" onClick={e => e.stopPropagation()}>
                                    <MoreHorizontal className="h-3.5 w-3.5 text-stone-500" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-44 bg-white/95 backdrop-blur-sm" align="end">
                                  <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => pinThread(thread.id, !thread.pinned)}>
                                    {thread.pinned ? <PinOff className="mr-2 h-3.5 w-3.5" /> : <Pin className="mr-2 h-3.5 w-3.5" />}
                                    {thread.pinned ? 'Unpin' : 'Pin'}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => handleArchiveThread(thread.id, true)}>
                                    <Archive className="mr-2 h-3.5 w-3.5" />Archive
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="cursor-pointer text-xs" onClick={(e) => { e.preventDefault(); setTagPickerThreadId(tagPickerThreadId === thread.id ? null : thread.id); }}>
                                    <Tag className="mr-2 h-3.5 w-3.5" />Tags
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => handleShareThread(thread.id)}>
                                    <Share2 className="mr-2 h-3.5 w-3.5" />Share
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => { setRenamingThreadId(thread.id); setRenameValue(thread.title); }}>
                                    <Pencil className="mr-2 h-3.5 w-3.5" />Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="cursor-pointer text-xs text-red-500 focus:text-red-500" onClick={() => handleDeleteThread(thread.id)}>
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

            {/* Tag filter bar */}
            {allUsedTags.length > 0 && (
              <div className="mt-4 px-2">
                <h3 className="uppercase font-label tracking-widest text-[10px] text-stone-500 mb-2 px-1 font-semibold flex items-center gap-1.5">
                  <Tag className="h-3 w-3" />Filter by Tag
                </h3>
                <div className="flex flex-wrap gap-1">
                  {allUsedTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTagFilter(selectedTagFilter === tag ? null : tag)}
                      className={`text-[9px] px-2 py-0.5 rounded-full border font-medium transition-all ${
                        selectedTagFilter === tag
                          ? getTagStyle(tag) + ' ring-1 ring-offset-1'
                          : 'bg-white/60 text-stone-400 border-stone-200 hover:bg-white'
                      }`}
                    >{tag}</button>
                  ))}
                  {selectedTagFilter && (
                    <button
                      onClick={() => setSelectedTagFilter(null)}
                      className="text-[9px] px-2 py-0.5 rounded-full border border-stone-300 bg-white text-stone-500 hover:bg-stone-50 flex items-center gap-0.5"
                    ><X className="h-2.5 w-2.5" />Clear</button>
                  )}
                </div>
              </div>
            )}

            {/* Archived Threads */}
            {archivedThreads.length > 0 && (
              <Collapsible open={showArchived} onOpenChange={setShowArchived} className="mt-2">
                <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-stone-500 hover:text-stone-700">
                  {showArchived ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <Archive className="h-3 w-3" />
                  Archived
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-0.5 animate-in fade-in duration-200 mt-1">
                  {archivedThreads.map(thread => (
                    <div key={thread.id} className="px-3">
                      <button
                        onClick={() => handleLoadChat(thread.id)}
                        className="w-full text-left text-xs px-2 py-1 rounded text-stone-500 hover:text-stone-700 hover:bg-white/50 truncate opacity-70 hover:opacity-100 transition-all"
                        title={thread.title}
                      >
                        {thread.title}
                      </button>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
            </div>
          )}
        </nav>

        {/* User Profile Footer */}
        <div className="flex-shrink-0 border-t border-[#EBE4D9] px-2 py-2">
          {user && profile ? (
            <div className="flex items-center justify-between gap-1">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-stone-700 truncate">{profile.name || 'User'}</p>
                <p className="text-[10px] text-stone-400 truncate">{profile.email}</p>
              </div>
              <div className="flex gap-0.5 flex-shrink-0">
                <button className="p-1.5 text-stone-400 hover:text-primary hover:bg-white/50 rounded transition-all" title="Settings">
                  <Settings className="h-3.5 w-3.5" />
                </button>
                <button className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50/50 rounded transition-all" title="Sign out" onClick={() => signOut()}>
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <button className="w-full text-left px-3 py-2 rounded-lg bg-white border border-[#A2B29D]/20 hover:border-[#A2B29D]/50 hover:bg-white transition-all text-xs font-semibold text-stone-700 flex items-center gap-2" onClick={() => setShowSignInModal(true)}>
              <LogIn className="h-3.5 w-3.5 text-[#A2B29D]" />
              Sign in
            </button>
          )}
        </div>
      </div>
    </aside>
  );

  const sidebarToggleJSX = !isSidebarOpen && (
    <Button
      onClick={() => setIsSidebarOpen(true)}
      variant="ghost"
      className="fixed top-4 left-4 z-40 h-10 w-10 rounded-xl bg-white/80 backdrop-blur-md hover:bg-white border border-stone-200 shadow-xl transition-all duration-300 animate-in fade-in zoom-in-95"
    >
      <Menu className="h-6 w-6 text-stone-600" />
    </Button>
  );

  const shortcutsOverlayJSX = showShortcuts && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
      <div className="bg-white rounded-2xl shadow-2xl border border-[#EBE4D9] p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-headline text-lg text-stone-800 flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-primary" />Keyboard Shortcuts
          </h3>
          <button onClick={() => setShowShortcuts(false)} className="text-stone-400 hover:text-stone-600 text-sm">Esc</button>
        </div>
        <div className="space-y-2.5">
          {[
            { keys: 'Ctrl + /', desc: 'Show this help' },
            { keys: 'Escape', desc: 'Stop generating / close' },
            { keys: 'Enter', desc: 'Send message' },
            { keys: 'Shift + Enter', desc: 'New line in message' },
          ].map(({ keys, desc }) => (
            <div key={keys} className="flex items-center justify-between">
              <span className="text-xs text-stone-600">{desc}</span>
              <kbd className="text-[10px] font-mono bg-stone-100 text-stone-600 px-2 py-0.5 rounded border border-stone-200">{keys}</kbd>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-stone-400 mt-4 text-center">Press <kbd className="font-mono bg-stone-100 px-1 rounded text-[9px]">Ctrl + /</kbd> anytime to toggle</p>
      </div>
    </div>
  );

  // Tag picker modal
  const tagPickerModalJSX = (
    <Dialog open={!!tagPickerThreadId} onOpenChange={(open) => !open && setTagPickerThreadId(null)}>
      <DialogContent className="w-[95vw] sm:max-w-[500px] glass-panel rounded-2xl p-6 border border-white/60 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl text-stone-800">Organize with Tags</DialogTitle>
          <DialogDescription>Select tags to organize this conversation</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto custom-scrollbar py-4">
          {TAG_PRESETS.map(tag => {
            const thread = threads.find(t => t.id === tagPickerThreadId);
            const isActive = (thread?.tags ?? []).includes(tag.name);
            return (
              <button
                key={tag.name}
                onClick={() => handleToggleTag(tagPickerThreadId!, tag.name)}
                className={`py-3 px-4 rounded-xl border-2 font-medium transition-all text-sm ${
                  isActive
                    ? tag.color + ' border-opacity-80 ring-2 ring-offset-2'
                    : 'bg-white/60 text-stone-400 border-stone-200 hover:bg-white hover:border-stone-300'
                }`}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 justify-end pt-4 border-t border-stone-200">
          <Button
            variant="ghost"
            onClick={() => setTagPickerThreadId(null)}
            className="px-6 text-stone-600 hover:text-stone-800"
          >
            Cancel
          </Button>
          <Button
            onClick={() => setTagPickerThreadId(null)}
            className="px-6 bg-primary hover:bg-primary/90 text-white"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const profileIconJSX = (
    <>
      <div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-8 w-8 rounded-full border border-[#EBE4D9] bg-white/80 hover:bg-white flex items-center justify-center transition-colors">
              <Avatar className="h-6 w-6">
                <AvatarImage src="" alt="Profile" />
                <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                  {profile?.name ? profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : <User className="h-3 w-3" />}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 bg-white/95 backdrop-blur-sm border border-[#EBE4D9]" align="end" forceMount>
            {profile ? (
              <>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{profile.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">{profile.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="font-normal text-xs text-gray-400 flex items-center gap-1.5 pb-1">
                  <Globe className="h-3 w-3" />Response language
                </DropdownMenuLabel>
                {SUPPORTED_LANGUAGES.map(({ code, label }) => (
                  <DropdownMenuItem
                    key={code}
                    className="cursor-pointer text-xs py-1.5"
                    onClick={() => handleLanguageChange(code)}
                  >
                    <span className="flex-1">{label}</span>
                    {preferredLang === code && <span className="text-primary font-bold">✓</span>}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer text-red-500 focus:text-red-500" onClick={() => signOut()}>
                  <LogOut className="mr-2 h-4 w-4" /><span>Sign Out</span>
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">Account</p>
                    <p className="text-xs leading-none text-muted-foreground">Sign in to save your wedding plans</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer" onClick={() => setShowSignInModal(true)}><LogIn className="mr-2 h-4 w-4" /><span>Sign In</span></DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" onClick={() => setShowSignUpModal(true)}><UserPlus className="mr-2 h-4 w-4" /><span>Create Account</span></DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" onClick={() => setShowSignInModal(true)}><Smartphone className="mr-2 h-4 w-4" /><span>Phone Sign In</span></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer"><User className="mr-2 h-4 w-4" /><span>Continue as Guest</span></DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <SignInModal open={showSignInModal} onOpenChange={setShowSignInModal} onSwitchToSignUp={(email) => { setSignUpPrefillEmail(email); setShowSignUpModal(true); }} />
      <SignUpModal open={showSignUpModal} onOpenChange={setShowSignUpModal} onSwitchToSignIn={() => setShowSignInModal(true)} initialEmail={signUpPrefillEmail} />
    </>
  );

  // ── Planner detail view (full right panel) ────────────────────────────────
  if (sidebarView === 'planner' && selectedChecklistId && user) {
    return (
      <div className={`flex h-screen overflow-hidden bg-background transition-all duration-300 ${isSidebarOpen ? 'pl-[280px]' : 'pl-0'}`}>
        {shortcutsOverlayJSX}
        {tagPickerModalJSX}
        {sidebarJSX}
        {sidebarToggleJSX}
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="flex items-center gap-2 px-5 h-12 bg-white/70 backdrop-blur-md border-b border-[#EBE4D9] flex-shrink-0">
            <h2 className="font-headline text-lg text-stone-800">Planner</h2>
            <div className="ml-auto">{profileIconJSX}</div>
          </header>
          <div className="flex-1 overflow-hidden p-4">
            <ChecklistDetail
              userId={user.uid}
              checklistId={selectedChecklistId}
              favourites={profile?.favourites ?? []}
              recentlyToggledItemIds={recentlyToggledItemIds}
              onClose={() => setSelectedChecklistId(null)}
            />
          </div>
        </main>
      </div>
    )
  }

  // ── Helper: main-area shell (sidebar + toggle + profile + content) ──────────
  const mainAreaShell = (title: string, icon: React.ReactNode, children: React.ReactNode) => (
    <div className={`flex h-screen overflow-hidden bg-background transition-all duration-300 ${isSidebarOpen ? 'pl-[280px]' : 'pl-0'}`}>
      {shortcutsOverlayJSX}
      {tagPickerModalJSX}
      {sidebarJSX}
      {sidebarToggleJSX}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-2 px-5 h-12 bg-white/70 backdrop-blur-md border-b border-[#EBE4D9] flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setSidebarView('history')} className="h-7 w-7 p-0 rounded-lg">
            <ArrowLeft className="h-3.5 w-3.5 text-stone-500" />
          </Button>
          <h2 className="font-headline text-lg text-stone-800 flex items-center gap-2">{icon}{title}</h2>
          <div className="ml-auto">{profileIconJSX}</div>
        </header>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          <div className="max-w-4xl mx-auto w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  )

  // ── Planner listing view (right panel) ────────────────────────────────────
  if (sidebarView === 'planner' && user && !selectedChecklistId) {
    return mainAreaShell('Planner', <CheckSquare className="h-5 w-5 text-primary" />,
      <PlannerView
        userId={user.uid}
        isPremium={profile?.isPremium ?? false}
        onBack={() => { setSidebarView('history'); setSelectedChecklistId(null) }}
        selectedChecklistId={selectedChecklistId}
        onSelectChecklist={setSelectedChecklistId}
      />
    )
  }

  // ── Liked messages main-area view ─────────────────────────────────────────
  if (sidebarView === 'liked') {
    return mainAreaShell('Liked Messages', <ThumbsUp className="h-5 w-5 text-primary" />,
      allLikedMessages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <ThumbsUp className="h-10 w-10 mb-3 opacity-20" />
          <p className="text-sm">No liked messages yet.</p>
          <p className="text-xs mt-1">Click the <ThumbsUp className="inline h-3 w-3 mx-0.5" /> on any AI response.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {allLikedMessages.slice().sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).map((msg) => (
            <button key={msg.id} onClick={() => handleLikedMessageClick(msg)}
              className="text-left rounded-2xl bg-white/70 border border-[#a2b29d]/40 px-4 py-3.5 space-y-2 hover:bg-white/90 hover:border-primary/30 hover:shadow-sm transition-all duration-150">
              {msg.mode && <span className="inline-block text-[9px] uppercase tracking-wider font-semibold text-primary/70 bg-primary/10 rounded-full px-1.5 py-0.5">{msg.mode}</span>}
              <p className="text-sm text-gray-700 leading-relaxed line-clamp-5">{msg.text}</p>
              <p className="text-[10px] text-gray-400">{msg.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            </button>
          ))}
        </div>
      )
    )
  }

  // ── Reminders main-area view ──────────────────────────────────────────────
  if (sidebarView === 'reminders') {
    return mainAreaShell('Upcoming & Reminders', <Calendar className="h-5 w-5 text-primary" />,
      calendarEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Calendar className="h-10 w-10 mb-3 opacity-20" />
          <p className="text-sm">No reminders yet.</p>
          <p className="text-xs mt-1">Ask Viva in <span className="font-semibold text-primary">Planner mode</span> to save a date.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {calendarEvents.map((ev) => {
            const isPast = new Date(ev.date) < new Date(new Date().toDateString())
            return (
              <a key={ev.id} href={ev.htmlLink || '#'} target="_blank" rel="noopener noreferrer"
                className={`block rounded-2xl border px-4 py-3.5 space-y-1.5 hover:shadow-sm transition-all duration-150 ${isPast ? 'bg-gray-50/60 border-gray-200 opacity-60' : 'bg-white/70 border-[#a2b29d]/40 hover:bg-white/90 hover:border-primary/30'}`}>
                <p className="text-sm font-semibold text-gray-800">{ev.title}</p>
                <p className="text-xs text-primary font-medium">{ev.date}{ev.time ? ` · ${ev.time}` : ''}</p>
                {ev.description && <p className="text-xs text-gray-400 line-clamp-2">{ev.description}</p>}
                {isPast && <p className="text-[10px] text-gray-400 italic">Past event</p>}
              </a>
            )
          })}
        </div>
      )
    )
  }

  // ── Budget view ──────────────────────────────────────────────────────────
  if (sidebarView === 'budget' && user) {
    return mainAreaShell('Budget Tracker', <DollarSign className="h-5 w-5 text-primary" />,
      <BudgetDashboard userId={user.uid} />
    )
  }

  // ── Shopping Lists view ────────────────────────────────────────────────
  if (sidebarView === 'shopping' && user) {
    return mainAreaShell('Shopping Lists', <ShoppingCart className="h-5 w-5 text-primary" />,
      <ShoppingListView userId={user.uid} />
    )
  }

  // ── Saved Items view ───────────────────────────────────────────────────
  if (sidebarView === 'saved-items' && user) {
    return mainAreaShell('Saved Items', <Bookmark className="h-5 w-5 text-primary" />,
      <SavedItemsView userId={user.uid} />
    )
  }

  // ── Timeline view ───────────────────────────────────────────────────────
  if (sidebarView === 'timeline' && user) {
    return mainAreaShell('Timeline', <Clock className="h-5 w-5 text-primary" />,
      <TimelineView
        userId={user.uid}
        checklists={checklistsData}
        calendarEvents={calendarEvents}
        weddingDate={profile?.weddingDate ? (profile.weddingDate as any).toDate?.() ?? null : null}
      />
    )
  }

  // ── Progress Dashboard view ────────────────────────────────────────────
  if (sidebarView === 'progress' && user) {
    const budgetStats = budgetData ? {
      totalBudget: budgetData.totalBudget,
      totalSpent: budgetData.categories.reduce((sum, c) => sum + c.spent, 0),
    } : null;
    return mainAreaShell('Progress', <BarChart3 className="h-5 w-5 text-primary" />,
      <ProgressDashboard
        weddingDate={profile?.weddingDate ? (profile.weddingDate as any).toDate?.() ?? null : null}
        checklistStats={computeStats(checklistsData)}
        budgetStats={budgetStats}
        calendarEventCount={calendarEvents.length}
        threadCount={threads.length}
      />
    )
  }

  // ── Notifications view ─────────────────────────────────────────────────
  if (sidebarView === 'notifications' && user) {
    return mainAreaShell('Notifications', <Bell className="h-5 w-5 text-primary" />,
      <NotificationPanel userId={user.uid} checklists={checklistsData} />
    )
  }

  // ── Collaborate / Invite Partner view ──────────────────────────────────
  if (sidebarView === 'collaborate' && user && profile) {
    return mainAreaShell('Collaborate', <Users className="h-5 w-5 text-primary" />,
      <InvitePartner userId={user.uid} userEmail={profile.email} userName={profile.name} />
    )
  }

  // ── Coming soon views ─────────────────────────────────────────────────────
  const comingSoonViews: Record<string, { title: string; icon: React.ReactNode; desc: string }> = {
    'moodboard': { title: 'Moodboard', icon: <Image className="h-5 w-5 text-primary" />, desc: 'Collect inspiration images for your wedding aesthetic.' },
  }
  if (sidebarView in comingSoonViews) {
    const cs = comingSoonViews[sidebarView]
    return mainAreaShell(cs.title, cs.icon,
      <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400 space-y-2">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-1">{cs.icon}</div>
        <p className="text-sm font-semibold text-gray-600">Coming Soon</p>
        <p className="text-xs max-w-xs leading-relaxed">{cs.desc}</p>
      </div>
    )
  }

  // ── Expanded chat view ─────────────────────────────────────────────────────
  if (isExpanded) {
    const activeCfg = modeConfig(selectedMode);
    return (
      <div className={`flex h-screen overflow-hidden bg-background transition-all duration-300 ${isSidebarOpen ? 'pl-[280px]' : 'pl-0'}`}>
        {shortcutsOverlayJSX}
        {tagPickerModalJSX}
        {sidebarJSX}
        {sidebarToggleJSX}

        {/* ── Center Chat Area ── */}
        <main className="flex-1 flex flex-col relative overflow-hidden">
          {/* TopAppBar — Stitch style */}
          <header className="flex justify-between items-center w-full px-5 h-12 bg-white/70 backdrop-blur-md border-b border-[#EBE4D9] z-10 flex-shrink-0">
            <div className="flex bg-[#EBE4D9] p-0.5 rounded-full gap-0.5">
              {MODE_CONFIG.map(m => (
                <button
                  key={m.key}
                  onClick={() => setSelectedMode(m.key)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${selectedMode === m.key ? `${m.active}` : 'text-stone-500 hover:bg-white/50'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1 text-stone-500 text-xs font-medium px-2 py-1 rounded-full hover:bg-stone-100 transition-colors">
                    <Globe className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Lang</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 bg-white/95 backdrop-blur-sm border border-[#EBE4D9] shadow-lg">
                  <DropdownMenuLabel className="text-[9px] text-stone-400 uppercase tracking-widest">Response Language</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {SUPPORTED_LANGUAGES.map(({ code, label }) => (
                    <DropdownMenuItem key={code} className="cursor-pointer text-[11px] py-1" onClick={() => handleLanguageChange(code)}>
                      <span className="flex-1">{label}</span>
                      {preferredLang === code && <span className="text-primary font-bold text-[10px]">✓</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <button className="p-1.5 text-stone-500 hover:text-primary transition-colors" onClick={() => setSidebarView('reminders')}>
                <Bell className="h-4 w-4" />
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="p-1.5 text-stone-500 hover:text-primary transition-colors" onClick={() => setShowShortcuts(true)}>
                    <Keyboard className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom"><p>Shortcuts (Ctrl+/)</p></TooltipContent>
              </Tooltip>
              {profileIconJSX}
            </div>
          </header>


          {/* Guest banner */}
          {!user && (
            <div className="flex-shrink-0 mx-auto w-full max-w-4xl px-5 pt-3">
              <div className="flex items-center bg-white/50 backdrop-blur-sm rounded-xl px-3 py-2 border border-primary/20 text-xs text-stone-600 gap-1.5">
                <Lock className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                This chat won't be saved.{' '}
                <button className="font-semibold text-primary underline underline-offset-2" onClick={() => setShowSignInModal(true)}>
                  Sign in to save your conversations.
                </button>
              </div>
            </div>
          )}

          {/* Chat Messages */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5 space-y-5">
            {/* Load earlier messages */}
            {hasMoreMessages && (
              <div className="flex justify-center">
                <button
                  onClick={handleLoadMoreMessages}
                  disabled={loadingMoreMessages}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-medium text-primary bg-white border border-primary/20 rounded-full hover:bg-primary/5 transition-colors shadow-sm disabled:opacity-50"
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
                  <div className="flex flex-col items-end">
                    {inlineEditId === message.id ? (
                      <div className="w-screen max-w-4xl md:max-w-5xl lg:max-w-6xl -mx-5 px-5 flex flex-col gap-2">
                        <textarea
                          autoFocus
                          value={inlineEditText}
                          onChange={e => setInlineEditText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitInlineEdit(message); }
                            if (e.key === 'Escape') cancelInlineEdit();
                          }}
                          rows={Math.max(2, inlineEditText.split('\n').length)}
                          className="w-full px-4 py-3 rounded-xl border border-primary/40 bg-white/90 text-gray-800 text-[13px] leading-relaxed resize-none outline-none focus:ring-2 focus:ring-primary/30 shadow-md"
                        />
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="sm" onClick={cancelInlineEdit} className="h-7 px-3 text-xs text-gray-500 hover:text-gray-700 rounded-xl">
                            Cancel
                          </Button>
                          <Button size="sm" onClick={() => submitInlineEdit(message)} disabled={!inlineEditText.trim()} className="h-7 px-3 text-xs bg-primary hover:bg-primary/90 text-white rounded-xl">
                            <Send className="h-3 w-3 mr-1" />Send
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="group flex flex-col items-end">
                        <div className="max-w-xs md:max-w-md lg:max-w-lg px-4 py-2.5 rounded-2xl rounded-tr-sm bg-secondary text-white shadow-sm">
                          <p className="text-[13px] leading-relaxed">{message.text}</p>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 mr-1">
                          <span className="text-[9px] text-stone-400 uppercase tracking-wider">
                            {message.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                          </span>
                          {/* Branch navigation */}
                          {(() => {
                            const info = getBranchInfo(msgIndex);
                            if (!info || info.total <= 1) return null;
                            return (
                              <div className="flex items-center gap-0.5">
                                <button
                                  onClick={() => switchBranch(info.anchorId, info.current - 1)}
                                  disabled={info.current <= 0}
                                  className="h-4 w-4 flex items-center justify-center rounded text-stone-400 hover:text-primary disabled:opacity-30 transition-colors"
                                >
                                  <ChevronLeft className="h-3 w-3" />
                                </button>
                                <span className="text-[9px] text-stone-500 font-medium tabular-nums">
                                  {info.current + 1}/{info.total}
                                </span>
                                <button
                                  onClick={() => switchBranch(info.anchorId, info.current + 1)}
                                  disabled={info.current >= info.total - 1}
                                  className="h-4 w-4 flex items-center justify-center rounded text-stone-400 hover:text-primary disabled:opacity-30 transition-colors"
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
                              <Button variant="ghost" size="sm" onClick={() => startInlineEdit(message)} className="h-6 w-6 p-0 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg">
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
                  <div className="max-w-xs md:max-w-md lg:max-w-lg group">
                    {message.mode && (
                      <div className="mb-1 flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white text-[10px] italic font-headline">V</div>
                        {(() => {
                          const cfg = modeConfig(message.mode);
                          const Icon = cfg.icon;
                          return (
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${cfg.pill}`}>
                              <Icon className="h-2 w-2" />
                              {cfg.label}
                            </span>
                          );
                        })()}
                      </div>
                    )}
                    <div className="mb-1 w-full prose prose-sm max-w-none text-[13px] leading-relaxed bg-white p-4 rounded-2xl rounded-tl-sm shadow-md shadow-stone-200/30 border border-[#EBE4D9] text-stone-700">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#B8860B] hover:text-[#DAA520] underline underline-offset-2 font-medium transition-colors">
                              {children}
                            </a>
                          ),
                          img: ({ src, alt }) => (
                            <img
                              src={src}
                              alt={alt ?? ''}
                              className="w-[200px] h-[200px] object-cover rounded-xl shadow-sm flex-shrink-0"
                            />
                          ),
                          table: ({ children, ...props }) => {
                            // Extract the raw markdown table from the message text for our ComparisonTable
                            const tableLines = message.text.split('\n').filter(l => l.trim().startsWith('|'));
                            if (tableLines.length >= 3) {
                              const rawTable = tableLines.join('\n');
                              return (
                                <div className="not-prose my-3">
                                  <ComparisonTable
                                    markdownTable={rawTable}
                                    onSaveToPlanner={() => {
                                      const prompt = `Convert the following response into a Markdown table and save it as a page in my planner:\n\n${rawTable}`;
                                      setSelectedMode('planner');
                                      setInputText(prompt);
                                      setSidebarView('planner');
                                    }}
                                  />
                                </div>
                              );
                            }
                            return <table {...props}>{children}</table>;
                          },
                          li: ({ children }) => {
                            const flat = (nodes: React.ReactNode): React.ReactNode[] =>
                              React.Children.toArray(nodes).flatMap(n =>
                                React.isValidElement(n) && (n.type === 'p' || n.type === 'span')
                                  ? flat((n.props as { children?: React.ReactNode }).children)
                                  : [n]
                              )
                            const kids = flat(children)

                            // Detect by props (n.type is our custom component fn, not 'img'/'a' string)
                            const imgNode = kids.find(n => React.isValidElement(n) && 'src' in (n.props as object)) as React.ReactElement<{ src: string; alt?: string }> | undefined
                            const anchorNode = kids.find(n => React.isValidElement(n) && 'href' in (n.props as object)) as React.ReactElement<{ href: string; children: React.ReactNode }> | undefined

                            if (imgNode && anchorNode) {
                              const textNodes = kids.filter(n => typeof n === 'string') as string[]
                              const rawMeta = textNodes.join('').replace(/^\|/, '')
                              const description = rawMeta.split('|').slice(1).join('|').trim()

                              const href = anchorNode.props.href ?? '#'
                              const title = anchorNode.props.children
                              const imageUrl = imgNode.props.src
                              const productId = `${title}-${href}`.toLowerCase().replace(/\s+/g, '-')
                              const isSaved = savedProductIds.has(productId)

                              return (
                                <li className="list-none mb-3 not-prose">
                                  <div className="flex flex-row gap-3 items-start p-3 rounded-2xl border border-[#a2b29d]/30 bg-white/60 shadow-sm hover:shadow-md hover:border-[#B8860B]/40 transition-all duration-200">
                                    <a href={href} target="_blank" rel="noopener noreferrer" className="block no-underline flex-1 flex flex-row gap-3 items-center">
                                      <img
                                        src={imageUrl}
                                        alt={title ?? ''}
                                        className="w-[80px] h-[80px] object-cover rounded-xl flex-shrink-0"
                                      />
                                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                        <span className="text-sm font-semibold text-gray-800 leading-snug line-clamp-1">{title}</span>
                                        {description && <span className="text-xs text-gray-500 leading-relaxed line-clamp-2">{description}</span>}
                                      </div>
                                    </a>
                                    {user && (
                                      <button
                                        onClick={() => handleSaveProduct(title as string, href, imageUrl)}
                                        disabled={isSaved}
                                        className={`flex-shrink-0 p-2 rounded-lg transition-all ${
                                          isSaved
                                            ? 'bg-primary/20 text-primary cursor-default'
                                            : 'text-stone-400 hover:text-primary hover:bg-primary/10'
                                        }`}
                                        title={isSaved ? 'Already saved' : 'Save to saved items'}
                                      >
                                        <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
                                      </button>
                                    )}
                                  </div>
                                </li>
                              )
                            }
                            return <li>{children}</li>
                          },
                        }}
                      >
                        {message.text}
                      </ReactMarkdown>
                    </div>
                    {message.audioUrl && (
                      <audio
                        controls
                        src={message.audioUrl}
                        className="mt-1 mb-2 w-full max-w-xs rounded-xl h-8"
                      />
                    )}
                    {message.imageUrl && (
                      <img
                        src={message.imageUrl}
                        alt="Generated"
                        className="mt-2 mb-2 rounded-xl max-w-xs w-full object-cover shadow-md"
                      />
                    )}
                    {message.calendarEvent && message.calendarAdded && (
                      <div className="mt-2 mb-1 flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-xl w-fit bg-primary/5 text-primary border border-primary/10">
                        <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="font-semibold">Added to Google Calendar</span>
                        <span className="font-medium text-stone-500">· {message.calendarEvent.date}</span>
                      </div>
                    )}
                    {message.calendarEvent && !message.calendarAdded && !user && (
                      <div className="mt-2 mb-1 bg-white p-4 rounded-2xl rounded-tl-sm shadow-md shadow-stone-200/30 border border-[#EBE4D9] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12"></div>
                        <div className="relative z-10">
                          <p className="text-[9px] text-primary font-bold uppercase tracking-widest mb-0.5">Upcoming Event</p>
                          <h4 className="font-headline text-base text-stone-800">{message.calendarEvent.title}</h4>
                          <div className="flex items-center gap-3 mt-2 text-stone-500 text-xs">
                            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {message.calendarEvent.date}</span>
                            {message.calendarEvent.time && <span className="flex items-center gap-1">{message.calendarEvent.time}</span>}
                          </div>
                          <div className="flex gap-2 mt-3">
                            <Button size="sm" className="bg-secondary text-white rounded-lg text-[11px] font-semibold hover:bg-secondary/90 shadow-sm gap-1.5 h-7" onClick={() => setShowSignInModal(true)}>
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
                        className="mt-2 mb-1 h-7 text-xs gap-1.5 border-blue-200 text-blue-600 hover:bg-blue-50"
                        onClick={() => handleConvertToTable(message)}
                      >
                        <CheckSquare className="h-3 w-3" />
                        Save as Table in Planner
                      </Button>
                    )}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={() => copyMessage(message.text, message.id)} className="h-6 w-6 p-0 hover:bg-gray-100/30 rounded-md">
                            {copiedMsgId === message.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-gray-500" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>{copiedMsgId === message.id ? 'Copied!' : 'Copy message'}</p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={() => downloadMessage(message.text, message.id)} className="h-6 w-6 p-0 hover:bg-gray-100/30 rounded-md">
                            <Download className="h-3 w-3 text-gray-500" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>Download as text</p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={() => toggleLike(message.id)} className="h-6 w-6 p-0 hover:bg-gray-100/30 rounded-md">
                            <ThumbsUp className={`h-3 w-3 ${message.liked ? 'text-primary fill-current' : 'text-gray-500'}`} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>{message.liked ? 'Unlike' : 'Like message'}</p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={() => handleRegenerateMessage(message)} className="h-6 w-6 p-0 hover:bg-gray-100/30 rounded-md">
                            <RefreshCw className="h-3 w-3 text-gray-500" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>Regenerate response</p>
                        </TooltipContent>
                      </Tooltip>

                      {/* TTS: Play / Pause / Resume / Stop */}
                      {ttsState?.msgId === message.id ? (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => ttsState.status === 'speaking' ? handleTtsPause() : handleTtsResume()} className="h-6 w-6 p-0 hover:bg-gray-100/30 rounded-md text-primary">
                                {ttsState.status === 'speaking' ? <Pause className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              <p>{ttsState.status === 'speaking' ? 'Pause' : 'Resume'}</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => handleTtsStop(message.id)} className="h-6 w-6 p-0 hover:bg-gray-100/30 rounded-md text-red-400">
                                <Square className="h-2.5 w-2.5 fill-current" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              <p>Stop listening</p>
                            </TooltipContent>
                          </Tooltip>
                        </>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={() => handleTtsPlay(message)} className="h-6 w-6 p-0 hover:bg-gray-100/30 rounded-md">
                              <Volume2 className="h-3 w-3 text-gray-500" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>Listen</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {/* Continue Generating — shown when response appears truncated */}
                    {message.truncated && !isTyping && (
                      <button
                        onClick={handleContinueGenerating}
                        className="flex items-center gap-1.5 text-[11px] text-primary font-medium hover:underline underline-offset-2 mt-1 transition-colors"
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
                            onClick={() => handleToneModifier(label.toLowerCase())}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-stone-200 text-[10px] text-stone-500 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
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

            {isTyping && !(messages.length > 0 && messages[messages.length - 1].sender === 'ai' && messages[messages.length - 1].text !== '') && (() => {
              const cfg = modeConfig(selectedMode);
              const modeLabel = selectedMode === 'auto' ? '' : ` (${cfg.label})`;
              return (
                <div className="flex justify-start">
                  <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-2.5 border border-[#EBE4D9] shadow-sm">
                    <div className={`flex items-center gap-1.5 ${cfg.pill}`}>
                      <span className="text-[11px] italic">Viva{modeLabel} is thinking</span>
                      {[0, 0.1, 0.2].map((d, i) => <div key={i} className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: `${d}s` }} />)}
                    </div>
                  </div>
                </div>
              );
            })()}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar Area */}
          <div className="px-5 pb-4 pt-1 bg-gradient-to-t from-background via-background/90 to-transparent flex-shrink-0">
            <InputBar
              inputText={voiceState === 'recording' ? interimText : inputText}
              onInputChange={setInputText}
              onSend={handleSendMessage}
              onStop={stopGeneration}
              isTyping={isTyping}
              placeholder="Ask Viva anything..."
              isRecording={isRecording}
              voiceState={voiceState}
              onMicClick={handleMicClick}
            />
            <p className="text-center text-[9px] text-stone-400 mt-2 uppercase tracking-[0.2em] font-medium">Viva concierge is here to make your day perfect</p>
          </div>
        </main>
      </div>
    );
  }

  // ── Landing page ───────────────────────────────────────────────────────────
  return (
    <div className={`flex h-screen overflow-hidden bg-background transition-all duration-300 ${isSidebarOpen ? 'pl-[280px]' : 'pl-0'}`}>
      {shortcutsOverlayJSX}
      {tagPickerModalJSX}
      {sidebarJSX}
      {sidebarToggleJSX}

      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* TopAppBar — same as chat view */}
        <header className="flex justify-between items-center w-full px-5 h-12 bg-white/70 backdrop-blur-md border-b border-[#EBE4D9] z-10 flex-shrink-0">
          <div className="flex bg-[#EBE4D9] p-0.5 rounded-full gap-0.5">
            {MODE_CONFIG.map(m => (
              <button
                key={m.key}
                onClick={() => setSelectedMode(m.key)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${selectedMode === m.key ? `${m.active}` : 'text-stone-500 hover:bg-white/50'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 text-stone-500 text-xs font-medium px-2 py-1 rounded-full hover:bg-stone-100 transition-colors">
                  <Globe className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Lang</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 bg-white/95 backdrop-blur-sm border border-[#EBE4D9] shadow-lg">
                <DropdownMenuLabel className="text-[9px] text-stone-400 uppercase tracking-widest">Response Language</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SUPPORTED_LANGUAGES.map(({ code, label }) => (
                  <DropdownMenuItem key={code} className="cursor-pointer text-[11px] py-1" onClick={() => handleLanguageChange(code)}>
                    <span className="flex-1">{label}</span>
                    {preferredLang === code && <span className="text-primary font-bold text-[10px]">✓</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <button className="p-1.5 text-stone-500 hover:text-primary transition-colors" onClick={() => setSidebarView('reminders')}>
              <Bell className="h-4 w-4" />
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="p-1.5 text-stone-500 hover:text-primary transition-colors" onClick={() => setShowShortcuts(true)}>
                  <Keyboard className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>Shortcuts (Ctrl+/)</p></TooltipContent>
            </Tooltip>
            {profileIconJSX}
          </div>
        </header>

        {/* Landing content */}
        <div className="flex-1 flex items-center justify-center p-6 gradient-bg">
          <div className="text-center max-w-2xl mx-auto w-full">
            <div className="relative z-10">
              <h1 className="font-headline italic text-2xl text-primary tracking-tight text-center mb-0.5">
                Viva
              </h1>
              <p className="text-[9px] uppercase tracking-[0.2em] text-stone-400 font-label mb-3 text-center">Universal Concierge</p>
              <h2 className="font-headline text-lg md:text-xl text-stone-800 mb-1 tracking-tight text-center">
                {profile ? `Welcome back, ${profile.name.split(' ')[0]}` : 'Your AI Wedding Planner'}
              </h2>
              <p className="text-xs text-stone-500 mb-5 leading-relaxed max-w-md mx-auto text-center font-body">
                {profile ? 'Ready to continue planning your perfect wedding?' : "Ask me anything about your wedding — planning, styling, budgets, or just need someone to talk to."}
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
                {actionButtons.map((btn, i) => (
                  <Button key={i} onClick={() => setInputText(btn.action)} variant="outline"
                    className="flex flex-row items-center gap-2 h-auto py-2.5 px-3 bg-white border border-surface-container-high rounded-xl group transition-all duration-200 hover:-translate-y-0.5 shadow-sm hover:shadow-md hover:border-primary/30">
                    <btn.icon className="w-3.5 h-3.5 text-primary flex-shrink-0 group-hover:scale-110 transition-transform duration-200" />
                    <span className="text-[11px] font-medium text-stone-600 whitespace-nowrap">{btn.text}</span>
                  </Button>
                ))}
              </div>

              <InputBar
                inputText={voiceState === 'recording' ? interimText : inputText}
                onInputChange={setInputText}
                onSend={handleSendMessage}
                onStop={stopGeneration}
                isTyping={isTyping}
                placeholder="Ask me anything about wedding planning..."
                isRecording={isRecording}
                voiceState={voiceState}
                onMicClick={handleMicClick}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
