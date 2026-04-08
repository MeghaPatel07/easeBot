import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles, Heart, MessageSquare, Calendar, Lightbulb, Globe,
  Lock, ArrowLeft, CheckSquare,
  Bookmark, Image, ShoppingCart, DollarSign, ThumbsUp,
  Keyboard, BarChart3, Clock, Bell, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import SignUpModal from '@/components/auth/SignUpModal';
import SignInModal from '@/components/auth/SignInModal';
import { useChat, type Message } from '@/hooks/useChat';
import { useVoice } from '@/hooks/useVoice';
import { updatePreferredLanguage } from '@/services/authService';
import { searchAllMessages, createSharedChat, type SearchResult } from '@/services/chatService';
import PlannerView from '@/components/PlannerView';
import ChecklistDetail from '@/components/ChecklistDetail';
import BudgetDashboard from '@/components/BudgetDashboard';
import ShoppingListView from '@/components/ShoppingListView';
import SavedItemsView from '@/components/SavedItemsView';
import TimelineView from '@/components/TimelineView';
import GalleryView from '@/components/GalleryView';
import ProgressDashboard from '@/components/ProgressDashboard';
import NotificationPanel from '@/components/NotificationPanel';
import InvitePartner from '@/components/InvitePartner';
import { SettingsModal } from '@/components/SettingsModal';
import { requestTTS } from '@/services/ttsService';
import { subscribeToChecklists, computeStats } from '@/services/checklistService';
import { subscribeToBudget, type BudgetData } from '@/services/budgetService';
import { addSavedItem } from '@/services/savedItemsService';
import { getVoicePreset } from '@/services/voicePresets';
import type { ChatThread, Mode, Checklist } from '@/types';
import '@fontsource/lato';
import chatbotBg from '@/assets/images/chatbot background.avif';

// ── Extracted components ────────────────────────────────────────────────────
import ChatSidebar, { type SidebarView } from '@/components/chat/ChatSidebar';
import ChatHeader, { SidebarToggle, ProfileIcon } from '@/components/chat/ChatHeader';
import ChatMessages from '@/components/chat/ChatMessages';
import ChatInput from '@/components/chat/ChatInput';
import { MODE_CONFIG, SUPPORTED_LANGUAGES, modeConfig, markdownToHtml, type ModeOrAuto } from '@/components/chat/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Index — layout orchestrator
// ─────────────────────────────────────────────────────────────────────────────
const Index = () => {
  const navigate = useNavigate();
  const { threadId: urlThreadId, checklistId: urlChecklistId, userId: urlUserId } = useParams<{ threadId: string; checklistId: string; userId: string }>();
  const location = useLocation();
  const { user, profile, signOut } = useAuth();
  const {
    messages, threads, activeThreadId, isTyping, allLikedMessages, calendarEvents, lastToolActions,
    sendMessage, stopGeneration, loadChat, startNewChat, deleteThread, renameThread,
    truncateMessages, restoreMessages, toggleLike, pinThread, archiveThread, updateThreadTags,
    hasMoreMessages, loadMoreMessages,
  } = useChat();

  // ── Flash checkbox on AI mark_as_done ─────────────────────────────────────
  const [recentlyToggledItemIds, setRecentlyToggledItemIds] = useState<string[]>([]);
  useEffect(() => {
    const doneActions = lastToolActions.filter(a => a.tool === 'mark_as_done' && a.itemId);
    if (doneActions.length > 0) {
      const ids = doneActions.map(a => a.itemId!);
      setRecentlyToggledItemIds(ids);
      const t = setTimeout(() => setRecentlyToggledItemIds([]), 2000);
      return () => clearTimeout(t);
    }
  }, [lastToolActions]);

  const isExpanded = messages.length > 0;
  const bgStyle = { '--bg-image': `url(${chatbotBg})` } as React.CSSProperties;

  const galleryImageCount = messages.reduce((count, msg) => {
    if (msg.imageUrls?.length) return count + msg.imageUrls.length;
    if (msg.imageUrl) return count + 1;
    return count;
  }, 0);

  // ── URL <-> thread sync ───────────────────────────────────────────────────
  useEffect(() => {
    if (urlThreadId && urlThreadId !== activeThreadId) loadChat(urlThreadId);
    else if (!urlThreadId && activeThreadId) startNewChat();
  }, [urlThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeThreadId && activeThreadId !== urlThreadId) navigate(`/chat/${activeThreadId}`, { replace: true });
  }, [activeThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── UI-only state ─────────────────────────────────────────────────────────
  const [inputText, setInputText] = useState('');
  const [attachedImage, setAttachedImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [showSignUpModal, setShowSignUpModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ModeOrAuto>('auto');
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditText, setInlineEditText] = useState('');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  const [ttsActiveId, setTtsActiveId] = useState<string | null>(null);
  const [ttsAudioUrls, setTtsAudioUrls] = useState<Record<string, string>>({});
  const [savedProductIds, setSavedProductIds] = useState<Set<string>>(new Set());
  const [signUpPrefillEmail, setSignUpPrefillEmail] = useState<string | undefined>(undefined);
  const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(null);
  const [pendingScrollToId, setPendingScrollToId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [preferredLang, setPreferredLang] = useState<string>('auto');
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);

  // ── Sidebar view from URL ─────────────────────────────────────────────────
  const VALID_VIEWS = new Set<SidebarView>(['gallery', 'planner', 'liked', 'reminders', 'budget', 'shopping', 'saved-items', 'timeline', 'progress', 'notifications', 'collaborate', 'moodboard']);
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const viewSegment = pathSegments.length >= 2 && pathSegments[0] !== 'chat' && pathSegments[0] !== 'share' ? pathSegments[1] : null;
  const sidebarView: SidebarView = viewSegment && VALID_VIEWS.has(viewSegment as SidebarView) ? viewSegment as SidebarView : 'history';
  const activeUserId = user?.uid ?? urlUserId ?? '';
  const setSidebarView = (view: SidebarView) => {
    if (view === 'history') navigate('/');
    else if (activeUserId) navigate(`/${activeUserId}/${view}`);
  };

  // ── Sync language from profile ────────────────────────────────────────────
  useEffect(() => {
    if (profile?.preferredLanguage) setPreferredLang(profile.preferredLanguage);
  }, [profile?.preferredLanguage]);

  const { voiceState, isRecording, interimText, recordingDuration, error: voiceError, startRecording, stopRecording, cancelRecording, clearError: clearVoiceError } = useVoice();
  const [voiceLanguage, setVoiceLanguage] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Message branching (edit history) ──────────────────────────────────────
  const [branchMap, setBranchMap] = useState<Record<string, { tails: Message[][]; active: number }>>({});

  // ── Overdue badge for Planner ─────────────────────────────────────────────
  const [overdueCount, setOverdueCount] = useState(0);
  const [checklistsData, setChecklistsData] = useState<Checklist[]>([]);
  useEffect(() => {
    if (!user) { setOverdueCount(0); setChecklistsData([]); return; }
    return subscribeToChecklists(user.uid, (cls: Checklist[]) => {
      setChecklistsData(cls);
      setOverdueCount(computeStats(cls).overdue);
    });
  }, [user?.uid]);

  // ── Budget data ───────────────────────────────────────────────────────────
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  useEffect(() => {
    if (!user) { setBudgetData(null); return; }
    return subscribeToBudget(user.uid, setBudgetData);
  }, [user?.uid]);

  // ── Scroll to + highlight a specific message ─────────────────────────────
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

  // ── Full-text search (debounced) ──────────────────────────────────────────
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

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'N') { e.preventDefault(); handleNewChat(); }
      if (e.ctrlKey && e.shiftKey && e.key === 'S') { e.preventDefault(); setIsSidebarOpen(v => !v); }
      if (e.ctrlKey && e.key === '/') { e.preventDefault(); setShowShortcuts(v => !v); }
      if (e.key === 'Escape') {
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (isTyping) { stopGeneration(); return; }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isTyping, showShortcuts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync selectedChecklistId from URL param
  useEffect(() => {
    if (urlChecklistId && urlChecklistId !== selectedChecklistId) setSelectedChecklistId(urlChecklistId);
  }, [urlChecklistId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────
  const langHint = preferredLang === 'auto' ? undefined : preferredLang;

  const handleLikedMessageClick = (msg: Message) => {
    if (msg.threadId && msg.threadId !== activeThreadId) navigate(`/chat/${msg.threadId}`);
    else navigate('/');
    setPendingScrollToId(msg.id);
  };

  const handleAttachImage = () => fileInputRef.current?.click();

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 4 * 1024 * 1024) { alert('Image must be under 4MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      const base64 = dataUri.split(',')[1];
      setAttachedImage({ base64, mimeType: file.type, preview: dataUri });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveImage = () => setAttachedImage(null);

  const handleSendMessage = () => {
    const text = inputText.trim();
    if (!text && !attachedImage) return;
    setInputText('');
    const mode = selectedMode === 'auto' ? undefined : selectedMode;
    const lang = voiceLanguage ?? langHint;
    setVoiceLanguage(null);
    const imgBase64 = attachedImage?.base64;
    const imgMime = attachedImage?.mimeType;
    setAttachedImage(null);
    sendMessage(text || 'Describe this image', undefined, mode, lang, imgBase64, imgMime);
  };

  const handleMicClick = async () => {
    if (voiceError) clearVoiceError();
    if (voiceState === 'recording') {
      const result = await stopRecording();
      if (result?.text) {
        setInputText(result.text);
        setVoiceLanguage(result.detectedLanguage);
      }
    } else if (voiceState === 'idle') {
      const err = await startRecording();
      if (err) {
        const toast = document.createElement('div');
        toast.textContent = `Mic: ${err}`;
        toast.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 bg-red-500/90 text-white text-xs px-4 py-2 rounded-full shadow-lg z-50 animate-in fade-in';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      }
    }
  };

  const handleLanguageChange = async (code: string) => {
    setPreferredLang(code);
    if (user) await updatePreferredLanguage(user.uid, code);
  };

  const startInlineEdit = (m: Message) => { setInlineEditId(m.id); setInlineEditText(m.text); };
  const cancelInlineEdit = () => { setInlineEditId(null); setInlineEditText(''); };

  const submitInlineEdit = (m: Message) => {
    const text = inlineEditText.trim();
    if (!text) return;
    const idx = messages.findIndex(msg => msg.id === m.id);
    if (idx !== -1) {
      const anchorId = idx > 0 ? messages[idx - 1].id : '__root__';
      const oldTail = messages.slice(idx);
      setBranchMap(prev => {
        const existing = prev[anchorId];
        if (existing) {
          const newTails = [...existing.tails];
          newTails[existing.active] = oldTail;
          return { ...prev, [anchorId]: { tails: newTails, active: newTails.length } };
        }
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
    const anchorIdx = anchorId === '__root__' ? -1 : messages.findIndex(m => m.id === anchorId);
    const currentTail = messages.slice(anchorIdx + 1);
    const newTails = [...bp.tails];
    if (bp.active < newTails.length) newTails[bp.active] = currentTail;
    else newTails.push(currentTail);
    const selectedTail = newTails[newIndex] ?? [];
    const prefix = messages.slice(0, anchorIdx + 1);
    restoreMessages([...prefix, ...selectedTail]);
    setBranchMap(prev => ({ ...prev, [anchorId]: { tails: newTails, active: newIndex } }));
  };

  const getBranchInfo = (msgIndex: number) => {
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
      if (userMsg.attachedImage) {
        const match = userMsg.attachedImage.match(/^data:([^;]+);base64,(.+)$/);
        if (match) sendMessage(userMsg.text, undefined, undefined, undefined, match[2], match[1]);
        else sendMessage(userMsg.text);
      } else {
        sendMessage(userMsg.text);
      }
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

  const handleShareThread = async (threadId: string) => {
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return;
    try {
      const shareId = await createSharedChat(threadId, thread.title);
      const shareUrl = `${window.location.origin}/share/${shareId}`;
      await navigator.clipboard.writeText(shareUrl);
      const toast = document.createElement('div');
      toast.textContent = 'Share link copied to clipboard!';
      toast.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 bg-[#3A0E20] text-white border border-white/10 text-xs px-4 py-2 rounded-full shadow-lg z-50 animate-in fade-in';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
    } catch (err) {
      console.error('[share] error:', err);
    }
  };

  const handleLoadMoreMessages = async () => {
    if (loadingMoreMessages || !hasMoreMessages) return;
    setLoadingMoreMessages(true);
    await loadMoreMessages();
    setLoadingMoreMessages(false);
  };

  const handleNewChat = () => { startNewChat(); setInputText(''); setSelectedChecklistId(null); setBranchMap({}); navigate('/'); };
  const handleLoadChat = (threadId: string) => { setBranchMap({}); navigate(`/chat/${threadId}`); };

  const copyMessage = async (text: string, msgId: string) => {
    try {
      const html = markdownToHtml(text);
      const htmlBlob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([text], { type: 'text/plain' });
      const clipboardItem = new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob });
      await navigator.clipboard.write([clipboardItem]);
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 1500);
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedMsgId(msgId);
        setTimeout(() => setCopiedMsgId(null), 1500);
      } catch (e) { console.error('Failed to copy:', e); }
    }
  };

  const handleConvertToTable = (message: Message) => {
    if (!user) return;
    const prompt = `Convert the following response into a Markdown table and save it as a page in my planner:\n\n${message.text}`;
    setSelectedMode('planner');
    setInputText(prompt);
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
    const productId = `${productTitle}-${productUrl}`.toLowerCase().replace(/\s+/g, '-');
    if (savedProductIds.has(productId)) return;
    try {
      await addSavedItem(user.uid, {
        text: productTitle,
        category: 'Vendor',
        sourceThreadId: activeThreadId,
        sourceThreadTitle: threads.find(t => t.id === activeThreadId)?.title ?? null,
        note: JSON.stringify({ type: 'product', url: productUrl, image: imageUrl }),
      });
      setSavedProductIds(prev => new Set([...prev, productId]));
    } catch (err) { console.error('Failed to save product:', err); }
  };

  // ── TTS ───────────────────────────────────────────────────────────────────
  const handleTtsPlay = async (message: { id: string; text: string; language?: string }) => {
    if (ttsActiveId && ttsActiveId !== message.id) {
      const old = ttsAudioUrls[ttsActiveId];
      if (old) URL.revokeObjectURL(old);
      setTtsAudioUrls(prev => { const n = { ...prev }; delete n[ttsActiveId!]; return n; });
      setTtsActiveId(null);
    }
    if (ttsActiveId === message.id) {
      const old = ttsAudioUrls[message.id];
      if (old) URL.revokeObjectURL(old);
      setTtsAudioUrls(prev => { const n = { ...prev }; delete n[message.id]; return n; });
      setTtsActiveId(null);
      return;
    }
    if (ttsAudioUrls[message.id]) { setTtsActiveId(message.id); return; }
    setTtsLoadingId(message.id);
    try {
      const preset = profile?.voiceId ? getVoicePreset(profile.voiceId) : undefined;
      const voiceName = preset?.geminiVoiceName;
      const activeLang = (preferredLang && preferredLang !== 'auto') ? preferredLang : (message.language || 'en');
      const audioUrl = await requestTTS({ text: message.text, voiceName, language: activeLang });
      setTtsAudioUrls(prev => ({ ...prev, [message.id]: audioUrl }));
      setTtsActiveId(message.id);
    } catch (err) {
      console.error('[TTS]', err);
      // Show brief error toast
      const toast = document.createElement('div');
      toast.textContent = 'Voice synthesis failed. Please try again.';
      toast.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 bg-red-500/90 text-white text-xs px-4 py-2 rounded-full shadow-lg z-50 animate-in fade-in';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    } finally { setTtsLoadingId(null); }
  };

  const handleTtsClose = (msgId: string) => {
    const url = ttsAudioUrls[msgId];
    if (url) URL.revokeObjectURL(url);
    setTtsAudioUrls(prev => { const n = { ...prev }; delete n[msgId]; return n; });
    setTtsActiveId(null);
  };

  useEffect(() => {
    return () => { Object.values(ttsAudioUrls).forEach(u => URL.revokeObjectURL(u)); };
  }, []);

  // ── Occasion selection state ───────────────────────────────────────────────
  const [selectedOccasion, setSelectedOccasion] = useState<string | null>(null);

  const occasions = [
    'Engagement', 'Haldi', 'Mhendi', 'Sangeet', 'Cocktail', 'Wedding',
    'Reception', 'Baraat', 'Vidaai', 'Roka', 'Sagai', 'Ganesh Puja',
    'Bachelor Party', 'Bridal Shower', 'Destination', 'Festive',
  ];

  // Quick prompts change based on selected occasion
  const defaultActionButtons = [
    { icon: Calendar, text: 'Plan my timeline', action: 'Help me create a wedding planning timeline' },
    { icon: Heart, text: 'Find my style', action: 'Help me discover my wedding style' },
    { icon: Lightbulb, text: 'Get inspiration', action: 'Show me trending wedding ideas' },
    { icon: Sparkles, text: 'Create custom', action: 'Help me create a custom wedding plan' },
  ];

  const occasionActionButtons: Record<string, { icon: typeof Calendar; text: string; action: string }[]> = {
    Engagement: [
      { icon: Calendar, text: 'Plan my timeline', action: 'Help me plan my engagement ceremony timeline' },
      { icon: Heart, text: 'Find my style', action: 'Help me find the perfect outfit for my engagement' },
      { icon: Lightbulb, text: 'Get inspiration', action: 'Show me engagement decoration and theme ideas' },
      { icon: Sparkles, text: 'Create custom', action: 'Help me plan a custom engagement ceremony' },
    ],
    Haldi: [
      { icon: Calendar, text: 'Plan my timeline', action: 'Help me plan my haldi ceremony timeline' },
      { icon: Heart, text: 'Find my style', action: 'Help me find the perfect haldi outfit and look' },
      { icon: Lightbulb, text: 'Get inspiration', action: 'Show me haldi decoration and theme ideas' },
      { icon: Sparkles, text: 'Create custom', action: 'Help me plan a custom haldi ceremony' },
    ],
    Mhendi: [
      { icon: Calendar, text: 'Plan my timeline', action: 'Help me plan my mehndi ceremony timeline' },
      { icon: Heart, text: 'Find my style', action: 'Help me find the perfect mehndi outfit and style' },
      { icon: Lightbulb, text: 'Get inspiration', action: 'Show me mehndi decoration and design ideas' },
      { icon: Sparkles, text: 'Create custom', action: 'Help me plan a custom mehndi ceremony' },
    ],
    Cocktail: [
      { icon: Calendar, text: 'Plan my timeline', action: 'Help me plan my cocktail party timeline' },
      { icon: Heart, text: 'Find my style', action: 'Help me find the perfect cocktail party outfit' },
      { icon: Lightbulb, text: 'Get inspiration', action: 'Show me cocktail party theme and decor ideas' },
      { icon: Sparkles, text: 'Create custom', action: 'Help me plan a custom cocktail party' },
    ],
    Wedding: [
      { icon: Calendar, text: 'Plan my timeline', action: 'Help me plan my wedding day timeline' },
      { icon: Heart, text: 'Find my style', action: 'Help me find the perfect wedding outfit and style' },
      { icon: Lightbulb, text: 'Get inspiration', action: 'Show me wedding decoration and theme ideas' },
      { icon: Sparkles, text: 'Create custom', action: 'Help me plan my custom dream wedding' },
    ],
    Sangeet: [
      { icon: Calendar, text: 'Plan my timeline', action: 'Help me plan my sangeet night timeline' },
      { icon: Heart, text: 'Find my style', action: 'Help me find the perfect sangeet outfit and dance look' },
      { icon: Lightbulb, text: 'Get inspiration', action: 'Show me sangeet performance and decor ideas' },
      { icon: Sparkles, text: 'Create custom', action: 'Help me plan a custom sangeet night' },
    ],
    Reception: [
      { icon: Calendar, text: 'Plan my timeline', action: 'Help me plan my wedding reception timeline' },
      { icon: Heart, text: 'Find my style', action: 'Help me find the perfect reception outfit' },
      { icon: Lightbulb, text: 'Get inspiration', action: 'Show me reception decoration and theme ideas' },
      { icon: Sparkles, text: 'Create custom', action: 'Help me plan a custom wedding reception' },
    ],
    Baraat: [
      { icon: Calendar, text: 'Plan my timeline', action: 'Help me plan my baraat procession timeline' },
      { icon: Heart, text: 'Find my style', action: 'Help me find the perfect baraat outfit for the groom' },
      { icon: Lightbulb, text: 'Get inspiration', action: 'Show me baraat entry and decoration ideas' },
      { icon: Sparkles, text: 'Create custom', action: 'Help me plan a grand baraat procession' },
    ],
  };

  // Dynamic fallback for occasions not explicitly listed
  const getOccasionButtons = (occasion: string) => {
    if (occasionActionButtons[occasion]) return occasionActionButtons[occasion];
    return [
      { icon: Calendar, text: 'Plan my timeline', action: `Help me plan my ${occasion} ceremony timeline` },
      { icon: Heart, text: 'Find my style', action: `Help me find the perfect outfit for my ${occasion}` },
      { icon: Lightbulb, text: 'Get inspiration', action: `Show me ${occasion} decoration and theme ideas` },
      { icon: Sparkles, text: 'Create custom', action: `Help me plan a custom ${occasion} celebration` },
    ];
  };

  const actionButtons = selectedOccasion
    ? getOccasionButtons(selectedOccasion)
    : defaultActionButtons;

  const handleQuickPrompt = (action: string) => {
    const occasion = selectedOccasion;
    if (occasion) {
      // Combine quick prompt with occasion context
      const combinedPrompt = `${action} for my ${occasion} ceremony`;
      setInputText(combinedPrompt);
    } else {
      setInputText(action);
    }
  };

  // ── Shortcuts overlay ─────────────────────────────────────────────────────
  const shortcutsOverlayJSX = showShortcuts && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
      <div className="bg-[#3A0E20] rounded-2xl shadow-2xl border border-white/15 p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-headline text-lg text-white/90 flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-primary" />Keyboard Shortcuts
          </h3>
          <button onClick={() => setShowShortcuts(false)} className="text-white/40 hover:text-white/60 text-sm">Esc</button>
        </div>
        <div className="space-y-2.5">
          {[
            { keys: 'Ctrl + /', desc: 'Show this help' },
            { keys: 'Escape', desc: 'Stop generating / close' },
            { keys: 'Enter', desc: 'Send message' },
            { keys: 'Shift + Enter', desc: 'New line in message' },
          ].map(({ keys, desc }) => (
            <div key={keys} className="flex items-center justify-between">
              <span className="text-xs text-white/60">{desc}</span>
              <kbd className="text-2xs font-mono bg-white/10 text-white/60 px-2 py-0.5 rounded border border-white/15">{keys}</kbd>
            </div>
          ))}
        </div>
        <p className="text-2xs text-white/40 mt-4 text-center">Press <kbd className="font-mono bg-white/10 px-1 rounded text-3xs">Ctrl + /</kbd> anytime to toggle</p>
      </div>
    </div>
  );

  // ── Profile icon (reused across views) ────────────────────────────────────
  const profileIconJSX = (
    <>
      <ProfileIcon
        user={user}
        profile={profile}
        preferredLang={preferredLang}
        onLanguageChange={handleLanguageChange}
        onShowShortcuts={() => setShowShortcuts(true)}
        onShowSignIn={() => setShowSignInModal(true)}
        onShowSignUp={() => setShowSignUpModal(true)}
        onSignOut={signOut}
      />
      <SignInModal open={showSignInModal} onOpenChange={setShowSignInModal} onSwitchToSignUp={(email) => { setSignUpPrefillEmail(email); setShowSignUpModal(true); }} />
      <SignUpModal open={showSignUpModal} onOpenChange={setShowSignUpModal} onSwitchToSignIn={() => setShowSignInModal(true)} initialEmail={signUpPrefillEmail} />
      <SettingsModal open={showSettingsModal} onClose={() => setShowSettingsModal(false)} />
    </>
  );

  // ── Sidebar toggle (used in non-chat views) ──────────────────────────────
  const sidebarToggleJSX = <SidebarToggle isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen(v => !v)} onNewChat={handleNewChat} />;

  // ── Sidebar (shared across all views) ─────────────────────────────────────
  const sidebarJSX = (
    <ChatSidebar
      isOpen={isSidebarOpen}
      onToggle={() => setIsSidebarOpen(v => !v)}
      user={user}
      threads={threads}
      activeThreadId={activeThreadId}
      sidebarView={sidebarView}
      onSetSidebarView={setSidebarView}
      onNewChat={handleNewChat}
      onLoadChat={handleLoadChat}
      onDeleteThread={handleDeleteThread}
      onRenameThread={renameThread}
      onPinThread={pinThread}
      onArchiveThread={handleArchiveThread}
      onShareThread={handleShareThread}
      onUpdateThreadTags={(tid, tags) => updateThreadTags(tid, tags)}
      onShowShortcuts={() => setShowShortcuts(true)}
      onShowSettings={() => setShowSettingsModal(true)}
      onShowSignIn={() => setShowSignInModal(true)}
      allLikedMessagesCount={allLikedMessages.length}
      calendarEventsCount={calendarEvents.length}
      overdueCount={overdueCount}
      galleryImageCount={galleryImageCount}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
    />
  );

  // ── Planner detail view ───────────────────────────────────────────────────
  if (sidebarView === 'planner' && selectedChecklistId && user) {
    return (
      <div className={`gradient-bg flex h-screen overflow-hidden bg-background transition-all duration-300 ${isSidebarOpen ? 'md:pl-[256px]' : 'pl-0'}`} style={bgStyle}>
        {shortcutsOverlayJSX}
        {isSidebarOpen && <div className="fixed inset-0 bg-black/60 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
        {sidebarJSX}
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="flex items-center gap-2 px-2 sm:px-4 h-14  backdrop-blur-md border-b border-[#C6944A]/20 flex-shrink-0">
            {sidebarToggleJSX}
            <h2 className="font-headline text-lg text-white/90">Planner</h2>
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
    );
  }

  // ── Helper: main-area shell ───────────────────────────────────────────────
  const mainAreaShell = (title: string, icon: React.ReactNode, children: React.ReactNode) => (
    <div className={`gradient-bg flex h-screen overflow-hidden bg-background transition-all duration-300 ${isSidebarOpen ? 'md:pl-[256px]' : 'pl-0'}`} style={bgStyle}>
      {shortcutsOverlayJSX}
      {isSidebarOpen && <div className="fixed inset-0 bg-black/60 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
      {sidebarJSX}
      <main className="flex-1 flex flex-col overflow-x-hidden overflow-hidden">
        <header className="flex items-center gap-2 px-2 sm:px-4 h-14 flex-shrink-0">
          {sidebarToggleJSX}
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="h-7 w-7 p-0 rounded-lg">
            <ArrowLeft className="h-3.5 w-3.5 text-white/60" />
          </Button>
          <h2 className="font-headline text-lg text-white/90 flex items-center gap-2">{icon}{title}</h2>
          <div className="ml-auto">{profileIconJSX}</div>
        </header>
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-5">
          <div className="max-w-4xl mx-auto w-full">{children}</div>
        </div>
      </main>
    </div>
  );

  // ── Planner listing view ──────────────────────────────────────────────────
  if (sidebarView === 'planner' && user && !selectedChecklistId) {
    return mainAreaShell('Planner', <CheckSquare className="h-5 w-5 text-primary" />,
      <PlannerView userId={user.uid} isPremium={profile?.isPremium ?? false} onBack={() => { navigate('/'); setSelectedChecklistId(null); }} selectedChecklistId={selectedChecklistId} onSelectChecklist={(id) => { setSelectedChecklistId(id); if (id) navigate(`/${activeUserId}/planner/${id}`); }} />
    );
  }

  // ── Liked messages ────────────────────────────────────────────────────────
  if (sidebarView === 'liked') {
    return mainAreaShell('Liked Messages', <ThumbsUp className="h-5 w-5 text-primary" />,
      allLikedMessages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-white/40">
          <ThumbsUp className="h-10 w-10 mb-3 opacity-20" />
          <p className="text-sm">No liked messages yet.</p>
          <p className="text-xs mt-1">Click the <ThumbsUp className="inline h-3 w-3 mx-0.5" /> on any AI response.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {allLikedMessages.slice().sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).map((msg) => (
            <button key={msg.id} onClick={() => handleLikedMessageClick(msg)} className="text-left rounded-2xl bg-white/10 border border-primary/30 px-4 py-3.5 space-y-2 hover:bg-white/15 hover:border-primary/40 hover:shadow-sm transition-all duration-150">
              {msg.mode && <span className="inline-block text-3xs uppercase tracking-wider font-semibold text-primary/70 bg-primary/10 rounded-full px-1.5 py-0.5">{msg.mode}</span>}
              <p className="text-sm text-white/70 leading-relaxed line-clamp-5">{msg.text}</p>
              <p className="text-2xs text-white/40">{msg.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            </button>
          ))}
        </div>
      )
    );
  }

  // ── Reminders ─────────────────────────────────────────────────────────────
  if (sidebarView === 'reminders') {
    return mainAreaShell('Upcoming & Reminders', <Calendar className="h-5 w-5 text-primary" />,
      calendarEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-white/40">
          <Calendar className="h-10 w-10 mb-3 opacity-20" />
          <p className="text-sm">No reminders yet.</p>
          <p className="text-xs mt-1">Ask Easebot in <span className="font-semibold text-primary">Planner mode</span> to save a date.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {calendarEvents.map((ev) => {
            const isPast = new Date(ev.date) < new Date(new Date().toDateString());
            return (
              <a key={ev.id} href={ev.htmlLink || '#'} target="_blank" rel="noopener noreferrer" className={`block rounded-2xl border px-4 py-3.5 space-y-1.5 hover:shadow-sm transition-all duration-150 ${isPast ? 'bg-white/5 border-white/10 opacity-60' : 'bg-white/10 border-primary/30 hover:bg-white/15 hover:border-primary/40'}`}>
                <p className="text-sm font-semibold text-white/80">{ev.title}</p>
                <p className="text-xs text-primary font-medium">{ev.date}{ev.time ? ` · ${ev.time}` : ''}</p>
                {ev.description && <p className="text-xs text-white/40 line-clamp-2">{ev.description}</p>}
                {isPast && <p className="text-2xs text-white/30 italic">Past event</p>}
              </a>
            );
          })}
        </div>
      )
    );
  }

  // ── Budget ────────────────────────────────────────────────────────────────
  if (sidebarView === 'budget' && user) return mainAreaShell('Budget Tracker', <DollarSign className="h-5 w-5 text-primary" />, <BudgetDashboard userId={user.uid} />);
  if (sidebarView === 'shopping' && user) return mainAreaShell('Shopping Lists', <ShoppingCart className="h-5 w-5 text-primary" />, <ShoppingListView userId={user.uid} />);
  if (sidebarView === 'saved-items' && user) return mainAreaShell('Saved Items', <Bookmark className="h-5 w-5 text-primary" />, <SavedItemsView userId={user.uid} />);
  if (sidebarView === 'timeline' && user) return mainAreaShell('Timeline', <Clock className="h-5 w-5 text-primary" />, <TimelineView userId={user.uid} checklists={checklistsData} calendarEvents={calendarEvents} weddingDate={profile?.weddingDate ? (profile.weddingDate as any).toDate?.() ?? null : null} />);

  if (sidebarView === 'progress' && user) {
    const budgetStats = budgetData ? { totalBudget: budgetData.totalBudget, totalSpent: budgetData.categories.reduce((sum, c) => sum + c.spent, 0) } : null;
    return mainAreaShell('Progress', <BarChart3 className="h-5 w-5 text-primary" />, <ProgressDashboard weddingDate={profile?.weddingDate ? (profile.weddingDate as any).toDate?.() ?? null : null} checklistStats={computeStats(checklistsData)} budgetStats={budgetStats} calendarEventCount={calendarEvents.length} threadCount={threads.length} />);
  }

  if (sidebarView === 'notifications' && user) return mainAreaShell('Notifications', <Bell className="h-5 w-5 text-primary" />, <NotificationPanel userId={user.uid} checklists={checklistsData} />);
  if (sidebarView === 'collaborate' && user && profile) return mainAreaShell('Collaborate', <Users className="h-5 w-5 text-primary" />, <InvitePartner userId={user.uid} userEmail={profile.email} userName={profile.name} />);
  if (sidebarView === 'gallery') return mainAreaShell('Gallery', <Image className="h-5 w-5 text-primary" />, user ? <GalleryView userId={user.uid} /> : <div className="flex flex-col items-center justify-center py-20 text-center text-white/40 space-y-2"><Image className="h-10 w-10 opacity-20" /><p className="text-sm">Sign in to view your generated images.</p></div>);

  // ── Coming soon views ─────────────────────────────────────────────────────
  const comingSoonViews: Record<string, { title: string; icon: React.ReactNode; desc: string }> = {
    'moodboard': { title: 'Moodboard', icon: <Image className="h-5 w-5 text-primary" />, desc: 'Collect inspiration images for your wedding aesthetic.' },
  };
  if (sidebarView in comingSoonViews) {
    const cs = comingSoonViews[sidebarView];
    return mainAreaShell(cs.title, cs.icon,
      <div className="flex flex-col items-center justify-center py-20 text-center text-white/40 space-y-2">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-1">{cs.icon}</div>
        <p className="text-sm font-semibold text-white/60">Coming Soon</p>
        <p className="text-xs max-w-xs leading-relaxed">{cs.desc}</p>
      </div>
    );
  }

  // ── Shared input bar props ────────────────────────────────────────────────
  const inputBarProps = {
    inputText: voiceState === 'recording' ? interimText : inputText,
    onInputChange: setInputText,
    onSend: handleSendMessage,
    onStop: stopGeneration,
    isTyping,
    isRecording,
    voiceState,
    onMicClick: handleMicClick,
    attachedImage,
    onAttachImage: handleAttachImage,
    onRemoveImage: handleRemoveImage,
    selectedMode,
    onModeChange: setSelectedMode,
    recordingDuration,
    onCancelRecording: cancelRecording,
  };

  // ── Expanded chat view ────────────────────────────────────────────────────
  if (isExpanded) {
    return (
      <div className={`gradient-bg flex h-screen overflow-hidden bg-background transition-all duration-300 ${isSidebarOpen ? 'md:pl-[256px]' : 'pl-0'}`} style={bgStyle}>
        {shortcutsOverlayJSX}
        {isSidebarOpen && <div className="fixed inset-0 bg-black/60 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
        {sidebarJSX}

        <main className="flex-1 flex flex-col relative overflow-hidden">
          <ChatHeader
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen(v => !v)}
            onNewChat={handleNewChat}
            user={user}
            profile={profile}
            selectedMode={selectedMode}
            onModeChange={setSelectedMode}
            preferredLang={preferredLang}
            onLanguageChange={handleLanguageChange}
            onShowReminders={() => setSidebarView('reminders')}
            onShowShortcuts={() => setShowShortcuts(true)}
            onShowSignIn={() => setShowSignInModal(true)}
            onShowSignUp={() => setShowSignUpModal(true)}
            onSignOut={signOut}
            onShowSettings={() => setShowSettingsModal(true)}
            showSignInModal={showSignInModal}
            onShowSignInModalChange={setShowSignInModal}
            showSignUpModal={showSignUpModal}
            onShowSignUpModalChange={setShowSignUpModal}
            signUpPrefillEmail={signUpPrefillEmail}
            onSignUpPrefillEmailChange={setSignUpPrefillEmail}
          />
          {/* Guest banner */}
          {!user && (
            <div className="flex-shrink-0 mx-auto w-full max-w-4xl px-3 sm:px-5 pt-3">
              <div className="flex items-center bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2 border border-primary/20 text-xs text-white/70 gap-1.5">
                <Lock className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                This chat won't be saved.{' '}
                <button className="font-semibold text-primary underline underline-offset-2" onClick={() => setShowSignInModal(true)}>
                  Sign in to save your conversations.
                </button>
              </div>
            </div>
          )}

          <ChatMessages
            messages={messages}
            isTyping={isTyping}
            selectedMode={selectedMode}
            user={user}
            profile={profile}
            activeThreadId={activeThreadId}
            activeUserId={activeUserId}
            highlightedMessageId={highlightedMessageId}
            hasMoreMessages={hasMoreMessages}
            loadingMoreMessages={loadingMoreMessages}
            inlineEditId={inlineEditId}
            inlineEditText={inlineEditText}
            onStartInlineEdit={startInlineEdit}
            onCancelInlineEdit={cancelInlineEdit}
            onSubmitInlineEdit={submitInlineEdit}
            onInlineEditTextChange={setInlineEditText}
            getBranchInfo={getBranchInfo}
            onSwitchBranch={switchBranch}
            onLoadMoreMessages={handleLoadMoreMessages}
            onCopyMessage={copyMessage}
            onDownloadMessage={downloadMessage}
            onToggleLike={toggleLike}
            onRegenerateMessage={handleRegenerateMessage}
            onContinueGenerating={handleContinueGenerating}
            onToneModifier={handleToneModifier}
            onConvertToTable={handleConvertToTable}
            onSaveProduct={handleSaveProduct}
            onOpenPlanner={(checklistId) => { navigate(`/${activeUserId}/planner/${checklistId}`); setSelectedChecklistId(checklistId); }}
            onShowSignIn={() => setShowSignInModal(true)}
            ttsLoadingId={ttsLoadingId}
            ttsActiveId={ttsActiveId}
            ttsAudioUrls={ttsAudioUrls}
            onTtsPlay={handleTtsPlay}
            onTtsClose={handleTtsClose}
            copiedMsgId={copiedMsgId}
            savedProductIds={savedProductIds}
            pendingScrollToId={pendingScrollToId}
            onSetInputText={setInputText}
            onSetSelectedMode={setSelectedMode}
          />

          {/* Input Bar Area */}
          <div className="px-4 sm:px-6 pt-2 pb-1  flex-shrink-0 relative z-10" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            <ChatInput {...inputBarProps} placeholder="ask me anything about your wedding styling, planning, or outfits..." />
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={handleFileSelected} />
            <p className="text-center text-3xs text-white/20 mt-2.5 uppercase tracking-[0.25em] font-medium">wedding ease — your day, perfected</p>
          </div>
        </main>
      </div>
    );
  }

  // ── Landing page ──────────────────────────────────────────────────────────
  return (
    <div className={`gradient-bg flex h-screen overflow-hidden bg-background transition-all duration-300 ${isSidebarOpen ? 'md:pl-[256px]' : 'pl-0'}`} style={bgStyle}>
      {shortcutsOverlayJSX}
      {isSidebarOpen && <div className="fixed inset-0 bg-black/60 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
      {sidebarJSX}

      <main className="flex-1 flex flex-col relative overflow-hidden">
        <ChatHeader
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(v => !v)}
          onNewChat={handleNewChat}
          user={user}
          profile={profile}
          selectedMode={selectedMode}
          onModeChange={setSelectedMode}
          preferredLang={preferredLang}
          onLanguageChange={handleLanguageChange}
          onShowReminders={() => setSidebarView('reminders')}
          onShowShortcuts={() => setShowShortcuts(true)}
          onShowSignIn={() => setShowSignInModal(true)}
          onShowSignUp={() => setShowSignUpModal(true)}
          onSignOut={signOut}
          onShowSettings={() => setShowSettingsModal(true)}
          showSignInModal={showSignInModal}
          onShowSignInModalChange={setShowSignInModal}
          showSignUpModal={showSignUpModal}
          onShowSignUpModalChange={setShowSignUpModal}
          signUpPrefillEmail={signUpPrefillEmail}
          onSignUpPrefillEmailChange={setSignUpPrefillEmail}
        />
        {/* Landing content */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 noise-overlay relative floral-overlay overflow-y-auto">
          <div className="text-center max-w-3xl mx-auto w-full relative z-10 flex flex-col items-center">
            <div className="relative z-10 w-full">
              {/* Bot avatar */}
              <div className="w-20 h-20 rounded-full border-2 border-[#C6944A]/60 flex items-center justify-center shadow-lg mx-auto mb-4 bot-avatar overflow-hidden bg-gradient-to-br from-[#D4A853]/20 to-[#B07D35]/20">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#D4A853] to-[#B07D35] flex items-center justify-center text-white text-2xl italic font-headline">E</div>
              </div>

              {/* Title */}
              <h1 className="uppercase tracking-[0.2em] text-sm font-bold text-[#C6944A] text-center mb-0.5">Ease Bot</h1>
              <p className="text-2xs uppercase tracking-[0.25em] text-[#C6944A]/60 font-label mb-6 text-center">Your Wedding Concierge</p>

              {/* Hero heading */}
              <h2 className="font-headline text-2xl sm:text-2xl md:text-[1.5rem] text-white/90 mb-3 tracking-tight text-center leading-tight">
                {profile
                  ? <>Hi, I'm here to <span className="italic text-[#C6944A]">guide you.</span></>
                  : <>Hi, I'm here to <span className="italic text-[#C6944A]">guide you.</span></>
                }
              </h2>
              <p className="text-sm text-white/50 mb-10 leading-relaxed max-w-lg mx-auto text-center font-body">
                Tell me your event, style or budget — I'll guide you step by step.
              </p>

              {/* Quick prompt cards — 2x2 grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-5 max-w-2xl mx-auto">
                {actionButtons.map((btn, i) => (
                  <button key={i} onClick={() => handleQuickPrompt(btn.action)} className="glass-action-card flex flex-col items-center justify-center gap-2.5 rounded-2xl py-5 px-3 group cursor-pointer">
                    <btn.icon className="w-6 h-6 text-[#C6944A]/70 group-hover:text-[#C6944A] transition-colors" />
                    <span className="text-xs font-medium text-white/55 group-hover:text-white/80 text-center leading-snug">{btn.text}</span>
                  </button>
                ))}
              </div>

              {/* "Not sure what you need?" banner */}
              <div className="flex items-center gap-3 bg-white/[0.06] backdrop-blur-md border border-white/[0.1] rounded-2xl px-4 py-3 mb-5 max-w-2xl mx-auto w-full">
                <Sparkles className="w-5 h-5 text-[#C6944A]/70 flex-shrink-0" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-white/80">Not sure what you need?</p>
                  <p className="text-xs text-white/40">Tell me your event, style or budget</p>
                </div>
                <button
                  onClick={() => setInputText('Help me decide what I need for my wedding')}
                  className="px-4 py-2 rounded-full bg-white/[0.08] backdrop-blur-md border border-white/[0.12] text-white/70 text-xs font-semibold flex items-center gap-1.5 hover:bg-white/[0.14] hover:text-white/90 transition-all flex-shrink-0"
                >
                  Help me decide <Sparkles className="w-3 h-3" />
                </button>
              </div>

              {/* Occasion chips — horizontal scroll */}
              <div className="w-full max-w-2xl mx-auto mb-6 overflow-x-auto scrollbar-hide">
                <div className="flex gap-2 px-1 pb-1" style={{ minWidth: 'max-content' }}>
                  {occasions.map((occ) => (
                    <button
                      key={occ}
                      onClick={() => setSelectedOccasion(selectedOccasion === occ ? null : occ)}
                      className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-200 border whitespace-nowrap flex-shrink-0 ${selectedOccasion === occ
                        ? 'bg-[#C6944A]/20 border-[#C6944A]/40 text-[#C6944A]'
                        : 'bg-white/[0.06] border-white/[0.1] text-white/55 hover:bg-white/10 hover:text-white/75'
                      }`}
                    >
                      {occ}
                    </button>
                  ))}
                </div>
              </div>

              <ChatInput {...inputBarProps} placeholder="Ask me anything about your wedding..." />
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={handleFileSelected} />
            </div>
          </div>
        </div>

        {/* Bottom tagline */}
        <p className="flex-shrink-0 text-center py-3 text-2xs text-white/25 uppercase tracking-[0.25em] font-medium">
          wedding ease — your day, perfected
        </p>
      </main>
    </div>
  );
};

export default Index;
