import { useState, useEffect, useRef } from 'react';
import {
  Send, Sparkles, Heart, MessageSquare, Calendar, Lightbulb,
  User, LogIn, UserPlus, Smartphone, LogOut, PanelLeft, Plus,
  Search, ChevronDown, ChevronRight, Bookmark, Image, CheckSquare,
  ShoppingCart, DollarSign, Copy, Download, ThumbsUp, Edit3, Lock,
  MoreHorizontal, Pencil, Trash2, StopCircle, RefreshCw, ArrowLeft,
  Mic, MicOff, Globe,
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
import { useAuth } from '@/contexts/AuthContext';
import SignUpModal from '@/components/auth/SignUpModal';
import SignInModal from '@/components/auth/SignInModal';
import { useChat, type Message } from '@/hooks/useChat';
import { useVoice } from '@/hooks/useVoice';
import { updatePreferredLanguage } from '@/services/authService';
import type { ChatThread, Mode } from '@/types';
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
    pill: 'bg-gray-100 text-gray-500',
    active: 'bg-gray-800 text-white shadow-sm',
    inactive: 'bg-white/70 text-gray-500 hover:bg-white hover:text-gray-700 border border-gray-200',
  },
  {
    key: 'planner',
    label: 'Planner',
    icon: Calendar,
    pill: 'bg-blue-50 text-blue-600',
    active: 'bg-blue-600 text-white shadow-sm',
    inactive: 'bg-white/70 text-blue-500 hover:bg-blue-50 hover:text-blue-600 border border-blue-100',
  },
  {
    key: 'stylist',
    label: 'Stylist',
    icon: Heart,
    pill: 'bg-[#a2b29d]/20 text-[#c4866e]',
    active: 'bg-[#a2b29d] text-white shadow-sm',
    inactive: 'bg-white/70 text-[#c4866e] hover:bg-[#a2b29d]/20 hover:text-[#c4866e] border border-[#a2b29d]/40',
  },
  {
    key: 'therapist',
    label: 'Therapist',
    icon: MessageSquare,
    pill: 'bg-purple-50 text-purple-600',
    active: 'bg-purple-600 text-white shadow-sm',
    inactive: 'bg-white/70 text-purple-400 hover:bg-purple-50 hover:text-purple-600 border border-purple-100',
  },
  {
    key: 'knowledge',
    label: 'Knowledge',
    icon: Lightbulb,
    pill: 'bg-amber-50 text-amber-600',
    active: 'bg-amber-500 text-white shadow-sm',
    inactive: 'bg-white/70 text-amber-400 hover:bg-amber-50 hover:text-amber-600 border border-amber-100',
  },
  {
    key: 'consultant',
    label: 'Consultant',
    icon: DollarSign,
    pill: 'bg-emerald-50 text-emerald-600',
    active: 'bg-emerald-600 text-white shadow-sm',
    inactive: 'bg-white/70 text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600 border border-emerald-100',
  },
]

const modeConfig = (key: ModeOrAuto): ModeConfig =>
  MODE_CONFIG.find((m) => m.key === key) ?? MODE_CONFIG[0]

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
  selectedMode: ModeOrAuto;
  onModeChange: (mode: ModeOrAuto) => void;
  isRecording: boolean;
  onMicClick: () => void;
}

const InputBar = ({
  inputText, onInputChange, onSend, onStop, isTyping, placeholder,
  selectedMode, onModeChange, isRecording, onMicClick,
}: InputBarProps) => {
  const cfg = modeConfig(selectedMode);
  const ModeIcon = cfg.icon;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize: reset to auto then set to scrollHeight (capped at 200px)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [inputText]);

  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-3xl p-4 shadow-xl border border-white/20 max-w-4xl mx-auto w-full">
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
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
            className="w-full pr-10 bg-white/70 border border-primary/20 rounded-2xl focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-base py-3 px-4 resize-none overflow-hidden leading-relaxed"
            style={{ minHeight: '48px', maxHeight: '200px' }}
          />
          <Sparkles className="absolute right-3 top-3 w-4 h-4 text-primary/40 pointer-events-none" />
        </div>

        {/* Mic button */}
        <Button
          type="button"
          variant="ghost"
          onClick={onMicClick}
          title={isRecording ? 'Stop recording' : 'Record voice message'}
          className={`h-11 w-11 rounded-2xl flex-shrink-0 flex items-center justify-center transition-all duration-200 ${isRecording
            ? 'bg-red-50 text-red-500 hover:bg-red-100 animate-pulse'
            : 'bg-white/70 text-gray-400 hover:text-primary hover:bg-white border border-gray-200'
            }`}
        >
          {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>

        {/* Mode dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className={`flex items-center gap-1.5 rounded-2xl h-11 px-3 text-xs font-medium border transition-all duration-150 ${selectedMode === 'auto'
                ? 'bg-white/70 border-gray-200 text-gray-600 hover:bg-white hover:border-gray-300'
                : `${cfg.active} border-transparent`
                }`}
            >
              <ModeIcon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="hidden sm:inline max-w-[72px] truncate">{cfg.label}</span>
              <ChevronDown className="h-3 w-3 opacity-50 flex-shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-white/95 backdrop-blur-sm border border-white/30 shadow-xl">
            <DropdownMenuLabel className="text-[11px] text-gray-400 uppercase tracking-wider">Response mode</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {MODE_CONFIG.map(({ key, label, icon: ItemIcon, pill }) => (
              <DropdownMenuItem
                key={key}
                onClick={() => onModeChange(key)}
                className="cursor-pointer flex items-center gap-2.5 py-2 text-sm"
              >
                <span className={`flex items-center justify-center h-6 w-6 rounded-full flex-shrink-0 ${pill}`}>
                  <ItemIcon className="h-3 w-3" />
                </span>
                <span className={selectedMode === key ? 'font-semibold text-gray-900' : 'text-gray-700'}>
                  {label}
                </span>
                {selectedMode === key && (
                  <span className="ml-auto text-primary font-bold text-xs">✓</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Send / Stop */}
        {isTyping && onStop ? (
          <Button
            onClick={onStop}
            className="bg-red-500 hover:bg-red-600 text-white rounded-2xl px-5 py-3 h-11 shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <StopCircle className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            onClick={onSend}
            disabled={!inputText.trim()}
            className="bg-primary hover:bg-primary/90 text-white rounded-2xl px-5 py-3 h-11 shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
          >
            <Send className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Index
// ─────────────────────────────────────────────────────────────────────────────
const Index = () => {
  const { user, profile, signOut } = useAuth();
  const {
    messages,
    threads,
    activeThreadId,
    isTyping,
    allLikedMessages,
    sendMessage,
    stopGeneration,
    loadChat,
    startNewChat,
    deleteThread,
    renameThread,
    truncateMessages,
    toggleLike,
  } = useChat();

  const isExpanded = messages.length > 0;

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
  const [sidebarView, setSidebarView] = useState<'history' | 'liked'>('history');
  const [pendingScrollToId, setPendingScrollToId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [preferredLang, setPreferredLang] = useState<string>(() => profile?.preferredLanguage ?? 'auto');

  const { isRecording, startRecording, stopRecording } = useVoice()
  const [voiceLanguage, setVoiceLanguage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleLikedMessageClick = async (msg: Message) => {
    setSidebarView('history');
    if (msg.threadId && msg.threadId !== activeThreadId) {
      await loadChat(msg.threadId);
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
    if (isRecording) {
      const result = await stopRecording();
      if (result) {
        setVoiceLanguage(result.detectedLanguage);
        // inputText already has final text from live updates
      }
    } else {
      const err = await startRecording((interim) => setInputText(interim));
      if (err) {
        alert(`Microphone error: ${err}`);
      }
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
    if (idx !== -1) truncateMessages(idx);
    setInlineEditId(null);
    setInlineEditText('');
    const mode = selectedMode === 'auto' ? undefined : selectedMode;
    sendMessage(text, undefined, mode, langHint);
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

  const handleDeleteThread = (threadId: string) => deleteThread(threadId);

  const submitRename = async (threadId: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) await renameThread(threadId, trimmed);
    setRenamingThreadId(null);
  };

  const handleNewChat = () => { startNewChat(); setInputText(''); };

  const handleLoadChat = (threadId: string) => loadChat(threadId);

  const copyMessage = async (text: string) => { try { await navigator.clipboard.writeText(text); } catch { } };
  const downloadMessage = (text: string, id: string) => {
    const el = document.createElement('a');
    el.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    el.download = `message-${id}.txt`;
    document.body.appendChild(el); el.click(); document.body.removeChild(el);
  };

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

  const filteredThreads = threads.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const groupedThreads = filteredThreads.reduce((acc, t) => {
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
  const sidebarJSX = (
    <div className={`fixed left-0 top-0 h-full bg-white/45 backdrop-blur-sm border-r border-white/20 shadow-lg transition-all duration-300 z-30 font-['Lato',sans-serif] ${isSidebarOpen ? 'w-72' : 'w-0'} overflow-hidden`}>
      <div className="p-3 h-full flex flex-col mt-14">
        <Button onClick={handleNewChat} className="w-full mb-3 text-gray-800 rounded-xl border border-[#a2b29d]/50 shadow-sm hover:shadow-md transition-all duration-200 text-sm font-medium" style={{ background: '#a2b29d' }}>
          <Plus className="mr-2 h-3 w-3" />New Chat
        </Button>

        {user && (
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
            <Input placeholder="Search chats..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 bg-white/70 border-gray-200 rounded-xl text-sm" />
          </div>
        )}

        <Collapsible open={isAssetsOpen} onOpenChange={setIsAssetsOpen} className="mb-5">
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between bg-white/70 border-gray-200 rounded-xl text-sm font-medium">
              <span className="flex items-center"><Bookmark className="mr-2 h-3 w-3" />Assets</span>
              {isAssetsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1">
            <Button
              variant="ghost"
              onClick={() => setSidebarView('liked')}
              className="w-full justify-start text-xs py-1.5 h-auto font-medium"
            >
              <ThumbsUp className="mr-2 h-3 w-3 text-primary" />
              Liked Messages
              {allLikedMessages.length > 0 && (
                <span className="ml-auto text-[10px] bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-semibold">
                  {allLikedMessages.length}
                </span>
              )}
            </Button>
            {([{ icon: Bookmark, label: 'Saved Items' }, { icon: Image, label: 'Moodboard' }, { icon: CheckSquare, label: 'Checklist' }, { icon: ShoppingCart, label: 'Shopping Lists' }, { icon: DollarSign, label: 'Budgets' }] as const).map(({ icon: Icon, label }) => (
              <Button key={label} variant="ghost" className="w-full justify-start text-xs py-1.5 h-auto font-medium"><Icon className="mr-2 h-3 w-3" />{label}</Button>
            ))}
          </CollapsibleContent>
        </Collapsible>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {sidebarView === 'liked' ? (
            <>
              <div className="flex items-center gap-2 mb-3 px-1 flex-shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setSidebarView('history')} className="h-6 w-6 p-0 rounded-lg">
                  <ArrowLeft className="h-3.5 w-3.5 text-gray-500" />
                </Button>
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                  <ThumbsUp className="h-3.5 w-3.5 text-primary" />Liked Messages
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto -mr-3 pr-3 space-y-2">
                {allLikedMessages.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6 px-2">No liked messages yet.<br />Click the <ThumbsUp className="inline h-3 w-3 mx-0.5" /> on any AI response.</p>
                ) : (
                  allLikedMessages
                    .slice()
                    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                    .map((msg) => (
                      <button
                        key={msg.id}
                        onClick={() => handleLikedMessageClick(msg)}
                        className="w-full text-left rounded-xl bg-white/60 border border-[#a2b29d]/40 px-3 py-2.5 space-y-1 hover:bg-white/80 hover:border-primary/30 hover:shadow-sm transition-all duration-150"
                      >
                        {msg.mode && (
                          <span className="inline-block text-[9px] uppercase tracking-wider font-semibold text-primary/70 bg-primary/8 rounded-full px-1.5 py-0.5">
                            {msg.mode}
                          </span>
                        )}
                        <p className="text-xs text-gray-700 leading-relaxed line-clamp-4">{msg.text}</p>
                        <p className="text-[9px] text-gray-400">
                          {msg.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      </button>
                    ))
                )}
              </div>
            </>
          ) : user ? (
            <>
              <h3 className="text-base font-semibold text-gray-800 mb-3 px-2 flex-shrink-0">Chat History</h3>
              <div className="flex-1 overflow-y-auto -mr-3 pr-3 space-y-3">
                {sortedGroupKeys.length === 0 && !searchQuery && <p className="text-xs text-gray-400 text-center py-4 px-2">Your conversations will appear here.</p>}
                {sortedGroupKeys.length === 0 && searchQuery && <p className="text-xs text-gray-500 text-center py-4">No chats found for "{searchQuery}"</p>}
                {sortedGroupKeys.map(dateKey => (
                  <div key={dateKey}>
                    <h4 className="mb-2 px-2 uppercase tracking-wider text-gray-500/80 font-semibold" style={{ fontSize: '9px' }}>{dateKey}</h4>
                    <div className="space-y-0.5">
                      {groupedThreads[dateKey].map(thread => (
                        <div key={thread.id} className="group relative flex items-center rounded-lg">
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
                              className="flex-1 text-sm px-2 py-1.5 rounded-lg bg-white border border-primary/30 outline-none focus:ring-1 focus:ring-primary/40 text-gray-900"
                            />
                          ) : (
                            <>
                              <button
                                onClick={() => handleLoadChat(thread.id)}
                                className={`flex-1 text-left text-sm font-normal px-2 py-1.5 rounded-lg truncate transition-colors ${activeThreadId === thread.id ? 'bg-white/70 text-gray-900 font-medium' : 'bg-transparent hover:bg-white/60 text-gray-700 hover:text-gray-900'}`}
                              >
                                {thread.title}
                              </button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 rounded hover:bg-white/80 transition-opacity" onClick={e => e.stopPropagation()}>
                                    <MoreHorizontal className="h-3.5 w-3.5 text-gray-500" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-36 bg-white/95 backdrop-blur-sm" align="end">
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
            </>
          ) : (
            <div className="flex-1 flex flex-col justify-end pb-2">
              <div className="rounded-2xl bg-white/60 border border-[#a2b29d]/40 p-4 space-y-3">
                <div className="flex items-center gap-2 text-gray-700">
                  <Lock className="h-4 w-4 text-primary flex-shrink-0" />
                  <p className="text-sm font-medium">Save your conversations</p>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">Sign in to save your wedding planning chats and access them from any device.</p>
                <div className="flex flex-col gap-2">
                  <Button size="sm" className="w-full bg-primary hover:bg-primary/90 text-white text-xs rounded-xl" onClick={() => setShowSignInModal(true)}>
                    <LogIn className="mr-1.5 h-3 w-3" />Sign In
                  </Button>
                  <Button size="sm" variant="outline" className="w-full text-xs rounded-xl border-primary/30 text-primary hover:bg-primary/5" onClick={() => setShowSignUpModal(true)}>
                    <UserPlus className="mr-1.5 h-3 w-3" />Create Account
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const sidebarToggleJSX = (
    <Button onClick={() => setIsSidebarOpen(v => !v)} variant="ghost" className="fixed top-4 left-4 z-40 h-10 w-10 rounded-full bg-white/80 backdrop-blur-sm hover:bg-white/90 border border-white/20 shadow-lg">
      <PanelLeft className="h-4 w-4" />
    </Button>
  );

  const profileIconJSX = (
    <>
      <div className="absolute top-4 right-4 z-20">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full bg-white/80 backdrop-blur-sm hover:bg-white/90 border border-white/20 shadow-lg">
              <Avatar className="h-8 w-8">
                <AvatarImage src="" alt="Profile" />
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {profile?.name ? profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : <User className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 bg-white/95 backdrop-blur-sm border border-white/20" align="end" forceMount>
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
      <SignInModal open={showSignInModal} onOpenChange={setShowSignInModal} onSwitchToSignUp={() => setShowSignUpModal(true)} />
      <SignUpModal open={showSignUpModal} onOpenChange={setShowSignUpModal} onSwitchToSignIn={() => setShowSignInModal(true)} />
    </>
  );

  // ── Expanded chat view ─────────────────────────────────────────────────────
  if (isExpanded) {
    return (
      <div className={`gradient-bg-expanded flex flex-col h-screen transition-all duration-300 ${isSidebarOpen ? 'pl-72' : 'pl-0'}`}>
        {sidebarJSX}
        {sidebarToggleJSX}
        {profileIconJSX}

        <div className="py-6 flex-shrink-0" />

        {!user && (
          <div className="flex-shrink-0 mx-auto w-full max-w-4xl px-4 mb-2">
            <div className="flex items-center bg-white/50 backdrop-blur-sm rounded-2xl px-4 py-2.5 border border-[#a2b29d]/40 text-sm text-gray-600 gap-2">
              <Lock className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              This chat won't be saved.{' '}
              <button className="font-semibold text-primary underline underline-offset-2" onClick={() => setShowSignInModal(true)}>
                Sign in to save your conversations.
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-4xl mx-auto w-full relative z-10 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {messages.map(message => (
            <div
              key={message.id}
              id={`msg-${message.id}`}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'} transition-all duration-300 ${highlightedMessageId === message.id ? 'rounded-2xl ring-2 ring-primary/40 ring-offset-2 bg-primary/5' : ''}`}
            >
              {message.sender === 'user' ? (
                <div className="flex flex-col items-end">
                  {inlineEditId === message.id ? (
                    <div className="w-full max-w-xs md:max-w-md lg:max-w-lg flex flex-col gap-2">
                      <textarea
                        autoFocus
                        value={inlineEditText}
                        onChange={e => setInlineEditText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitInlineEdit(message); }
                          if (e.key === 'Escape') cancelInlineEdit();
                        }}
                        rows={Math.max(2, inlineEditText.split('\n').length)}
                        className="w-full px-4 py-3 rounded-2xl border border-primary/40 bg-white/80 text-gray-800 text-sm leading-relaxed resize-none outline-none focus:ring-2 focus:ring-primary/30 shadow"
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
                      <div className="max-w-xs md:max-w-md lg:max-w-lg px-4 py-3 rounded-2xl border bg-white/30 text-gray-800 border-[#a2b29d]/40 shadow" style={{ backdropFilter: 'blur(6px)' }}>
                        <p className="text-sm leading-relaxed">{message.text}</p>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 mt-1">
                        <Button variant="ghost" size="sm" onClick={() => startInlineEdit(message)} className="h-6 px-2 py-0 text-xs text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg flex items-center" title="Edit and Regenerate">
                          <Edit3 className="h-3 w-3 mr-1" />
                          Edit & Regenerate
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="max-w-xs md:max-w-md lg:max-w-lg text-gray-700 group">
                  {message.mode && (
                    <div className="mb-1.5 flex items-center gap-1">
                      {(() => {
                        const cfg = modeConfig(message.mode);
                        const Icon = cfg.icon;
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${cfg.pill}`}>
                            <Icon className="h-2.5 w-2.5" />
                            {cfg.label}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                  <div className="mb-2 w-full prose prose-sm max-w-none text-sm leading-relaxed">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer">
                            {children}
                          </a>
                        ),
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
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Button variant="ghost" size="sm" onClick={() => copyMessage(message.text)} className="h-8 w-8 p-0 hover:bg-gray-100/30 rounded-lg" title="Copy"><Copy className="h-4 w-4 text-gray-500" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => downloadMessage(message.text, message.id)} className="h-8 w-8 p-0 hover:bg-gray-100/30 rounded-lg" title="Download"><Download className="h-4 w-4 text-gray-500" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleLike(message.id)} className="h-8 w-8 p-0 hover:bg-gray-100/30 rounded-lg" title="Like"><ThumbsUp className={`h-4 w-4 ${message.liked ? 'text-primary fill-current' : 'text-gray-500'}`} /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleRegenerateMessage(message)} className="h-8 w-8 p-0 hover:bg-gray-100/30 rounded-lg" title="Regenerate"><RefreshCw className="h-4 w-4 text-gray-500" /></Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white/80 rounded-2xl rounded-bl-sm px-4 py-3 border border-[#a2b29d]/40" style={{ backdropFilter: 'blur(6px)' }}>
                <div className="flex items-center gap-1">
                  {[0, 0.1, 0.2].map((d, i) => <div key={i} className="w-2 h-2 bg-[#a2b29d] rounded-full animate-bounce" style={{ animationDelay: `${d}s` }} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="backdrop-blur-md p-4 flex-shrink-0">
          <InputBar
            inputText={inputText}
            onInputChange={setInputText}
            onSend={handleSendMessage}
            onStop={stopGeneration}
            isTyping={isTyping}
            placeholder="Type your message..."
            selectedMode={selectedMode}
            onModeChange={setSelectedMode}
            isRecording={isRecording}
            onMicClick={handleMicClick}
          />
        </div>
      </div>
    );
  }

  // ── Landing page ───────────────────────────────────────────────────────────
  return (
    <div className={`gradient-bg min-h-screen flex items-center justify-center p-6 transition-all duration-300 ${isSidebarOpen ? 'pl-72' : 'pl-0'}`}>
      {sidebarJSX}
      {sidebarToggleJSX}
      {profileIconJSX}

      <div className="text-center max-w-2xl mx-auto w-full">
        <div className="relative z-10">
          <h1 className="elegant-heading text-2xl md:text-3xl font-bold text-gray-800 mb-2 tracking-tight text-center">
            {profile ? `Welcome back, ${profile.name.split(' ')[0]}!` : 'Meet Viva! Your Personal Wedding Companion'}
          </h1>
          <p className="text-base text-gray-600 mb-8 leading-relaxed max-w-lg mx-auto text-center">
            {profile ? 'Ready to continue planning your perfect wedding?' : "Let's plan something beautiful. Ask me anything!"}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {actionButtons.map((btn, i) => (
              <Button key={i} onClick={() => setInputText(btn.action)} variant="outline"
                className="flex flex-row items-center gap-2 h-8 px-2 border border-primary/10 rounded-2xl group transition-all duration-300 hover:-translate-y-1 shadow hover:shadow-md"
                style={{ background: 'linear-gradient(to right, rgba(255,255,255,0.7), rgba(255,255,255,0.4))' }}>
                <btn.icon className="w-3 h-3 text-primary group-hover:scale-110 transition-transform duration-200" />
                <span className="text-[11px] font-medium text-gray-700 whitespace-nowrap">{btn.text}</span>
              </Button>
            ))}
          </div>

          <InputBar
            inputText={inputText}
            onInputChange={setInputText}
            onSend={handleSendMessage}
            onStop={stopGeneration}
            isTyping={isTyping}
            placeholder="Ask me anything about wedding planning..."
            selectedMode={selectedMode}
            onModeChange={setSelectedMode}
            isRecording={isRecording}
            onMicClick={handleMicClick}
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
