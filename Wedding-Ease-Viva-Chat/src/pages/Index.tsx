import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQueryClient } from '@tanstack/react-query';
import {
  Sparkles, Heart, Calendar, CalendarCheck, Globe,
  Lock, ArrowLeft, CheckSquare, AlertTriangle,
  Bookmark, Image, ImagePlus, ShoppingCart, DollarSign, ThumbsUp,
  Keyboard, BarChart3, Clock, Bell, Users, FileText,
  X, Copy, Check, Link, Share2, MessageSquareHeart, MessageCircle,
} from 'lucide-react';
import { GiHanger } from 'react-icons/gi';
import { Button } from '@/components/ui/button';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import SignUpModal from '@/components/auth/SignUpModal';
import SignInModal from '@/components/auth/SignInModal';
import { useChat, type Message } from '@/hooks/useChat';
import { useKnownArtifactIds } from '@/hooks/useKnownArtifactIds';
import { useChatAttachments, type ChatAttachment } from '@/contexts/ChatAttachmentsContext';
import { useVoice } from '@/hooks/useVoice';
import { updatePreferredLanguage } from '@/services/authService';
import { searchAllMessages, createSharedChat, type SearchResult } from '@/services/chatService';
import PlannerView from '@/components/PlannerView';
import ChecklistDetail from '@/components/ChecklistDetail';
import BudgetDashboard from '@/components/BudgetDashboard';
import ShoppingListView from '@/components/ShoppingListView';
import SavedItemsView from '@/components/SavedItemsView';
import TimelineView from '@/components/TimelineView';
import RemindersView from '@/components/RemindersView';
import GalleryView from '@/components/GalleryView';
import ImagesHub from '@/pages/ImagesHub';
import NotesView from '@/components/notes/NotesView';
import ProgressDashboard from '@/components/ProgressDashboard';
import NotificationPanel from '@/components/NotificationPanel';
import InvitePartner from '@/components/InvitePartner';
import FeedbackDialog from '@/components/FeedbackDialog';
// Legacy SettingsModal is no longer rendered (Sprint 4, Hana — Marcus QA M-8).
// SettingsShell is the canonical surface. The file is intentionally not deleted
// because other codepaths / translations may still reference its exports.
import { SettingsShell } from '@/pages/settings/SettingsShell';
import { requestTTS } from '@/services/ttsService';
import { subscribeToChecklists, computeStats } from '@/services/checklistService';
import { subscribeToBudget, type BudgetData } from '@/services/budgetService';
import { subscribeToTimelineEvents } from '@/services/timelineEventsService';
import { addSavedItem } from '@/services/savedItemsService';
import { getVoicePreset } from '@/services/voicePresets';
import { getLocalVoiceId } from '@/services/settingsService';
import type { ChatThread, Mode, Checklist, TimelineEvent } from '@/types';
import { track, register } from '@/lib/analytics';
import logoImg from '@/assets/images/logo.png';

import WeddingEaseFloater from '@/components/WeddingEaseFloater';

// ── Extracted components ────────────────────────────────────────────────────
import ChatSidebar, { type SidebarView } from '@/components/chat/ChatSidebar';
import ChatHeader from '@/components/chat/ChatHeader';
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
  const qc = useQueryClient();
  const { user, profile, signOut, loading: authLoading } = useAuth();
  const {
    messages, threads, activeThreadId, isTyping, allLikedMessages, reminders, lastToolActions,
    likedProducts, likedProductIds, toggleProductLike,
    sendMessage, stopGeneration, loadChat, startNewChat, deleteThread, renameThread,
    truncateMessages, restoreMessages, toggleLike, pinThread, archiveThread, updateThreadTags,
    hasMoreMessages, loadMoreMessages, deleteMessageImage, refetchReminders, chatLoadError, chatUnavailable,
  } = useChat();

  // Refetch account query when returning from upgrade/checkout
  useEffect(() => {
    const state = location.state as { planChanged?: string } | null
    if (state?.planChanged) {
      qc.refetchQueries({ queryKey: ['account', 'me'] })
    }
  }, [location, qc])

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

  const galleryImageCount = messages.reduce((count, msg) => {
    if (msg.imageUrls?.length) return count + msg.imageUrls.length;
    if (msg.imageUrl) return count + 1;
    return count;
  }, 0);

  // ── URL <-> thread sync ───────────────────────────────────────────────────
  // Wait for auth to resolve before loading a thread. loadChat's ownership
  // check needs the current uid; running it while auth is still loading would
  // skip the check (uid unknown) and open another account's chat — the IDOR bug.
  // authLoading flips false only AFTER `user` is set (AuthContext), so gating
  // here guarantees the uid is known. See PRD-SECURITY-cross-user-access-control.md.
  useEffect(() => {
    if (authLoading) return;
    if (urlThreadId && urlThreadId !== activeThreadId) loadChat(urlThreadId);
    else if (!urlThreadId && activeThreadId) startNewChat();
  }, [urlThreadId, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeThreadId && activeThreadId !== urlThreadId) navigate(`/chat/${activeThreadId}`, { replace: true });
  }, [activeThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Access guard: the per-user routes (/:userId/...) embed an owner uid. If a
  // signed-in user opens someone else's link, rewrite it into their own space so
  // they never sit in another account's context (the views already load by the
  // authed uid, so this is hygiene + closes the logged-out urlUserId fallback).
  // Data isolation itself needs Firestore rules — see
  // PRD-SECURITY-cross-user-access-control.md.
  useEffect(() => {
    if (urlUserId && user && urlUserId !== user.uid) {
      navigate(location.pathname.replace(/^\/[^/]+/, `/${user.uid}`), { replace: true });
    }
  }, [urlUserId, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── UI-only state ─────────────────────────────────────────────────────────
  const [inputText, setInputText] = useState('');
  const [attachedImage, setAttachedImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [showSignUpModal, setShowSignUpModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [searchQuery, setSearchQuery] = useState('');
  // Sprint 4 (Hana, Marcus QA M-8): the legacy SettingsModal is no longer
  // mounted. The sidebar/profile-menu "Open settings" buttons still call
  // setShowSettingsModal(true); we shim that to deep-link the new SettingsShell
  // via the ?settings=account query param (the canonical surface).
  const [showSettingsModal, _setShowSettingsModalRaw] = useState(false);
  const setShowSettingsModal = useCallback((next: boolean) => {
    _setShowSettingsModalRaw(next);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (next) {
        if (!url.searchParams.get('settings')) url.searchParams.set('settings', 'account');
      } else {
        url.searchParams.delete('settings');
      }
      window.history.pushState({}, '', url.toString());
      // Notify React Router's useSearchParams listeners.
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, []);
  const [selectedMode, setSelectedMode] = useState<ModeOrAuto>('auto');
  // PostHog: fire mode_selected when the user changes mode. Skip the initial
  // 'auto' render; skipRef ensures we don't track the mount default.
  const prevModeRef = useRef<ModeOrAuto>('auto');
  useEffect(() => {
    if (prevModeRef.current === selectedMode) return;
    track('mode_selected', { mode: selectedMode, previous_mode: prevModeRef.current });
    prevModeRef.current = selectedMode;
    register({ active_mode: selectedMode });
  }, [selectedMode]);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditText, setInlineEditText] = useState('');
  const [inlineEditImage, setInlineEditImage] = useState<string | null>(null);
  const [inlineEditImageMime, setInlineEditImageMime] = useState<string | null>(null);
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
  // Homepage-accessible feedback entry (DEV-B's FeedbackDialog). Guests allowed.
  const [homeFeedbackOpen, setHomeFeedbackOpen] = useState(false);

  // ── Guest Mode limits ───────────────────────────────────────────────────
  const GUEST_MESSAGE_LIMIT = 10;
  const GUEST_IMAGE_LIMIT = 3;
  // Initialize counts from localStorage so they persist across refreshes
  const storedMsgCount = () => { try { return Number(localStorage.getItem('easebot-guest-msg-count')) || 0 } catch { return 0 } }
  const storedImgCount = () => { try { return Number(localStorage.getItem('easebot-guest-img-count')) || 0 } catch { return 0 } }
  const [guestMessageCount, setGuestMessageCount] = useState(storedMsgCount);
  const [guestImageCount, setGuestImageCount] = useState(storedImgCount);
  const guestMessageCountRef = useRef(guestMessageCount);
  const guestImageCountRef = useRef(guestImageCount);

  // Sync ref with state
  useEffect(() => { guestMessageCountRef.current = guestMessageCount; }, [guestMessageCount]);
  useEffect(() => { guestImageCountRef.current = guestImageCount; }, [guestImageCount]);

  const guestBannerJSX = !user ? (
    <div className="flex-shrink-0 mx-auto w-full max-w-4xl px-3 sm:px-5 pt-3">
      <div className="bg-foreground/[0.06] backdrop-blur-sm rounded-xl px-3 py-2.5 text-xs text-foreground/70 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <span className="font-semibold text-foreground/80">Guest Mode</span>
          <span className="text-foreground/40 mx-1">—</span>
          <span>{Math.max(0, GUEST_MESSAGE_LIMIT - guestMessageCount)} message{GUEST_MESSAGE_LIMIT - guestMessageCount !== 1 ? 's' : ''} remaining</span>
          <span className="text-foreground/30 hidden sm:inline">·</span>
          <span className="hidden sm:inline">{Math.max(0, GUEST_IMAGE_LIMIT - guestImageCount)} image{GUEST_IMAGE_LIMIT - guestImageCount !== 1 ? 's' : ''} remaining</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5">
              {Array.from({ length: GUEST_MESSAGE_LIMIT }).map((_, i) => (
                <div key={i} className={`h-1.5 w-1.5 rounded-full transition-colors ${i < guestMessageCount ? 'bg-primary/60' : 'bg-foreground/[0.12]'}`} />
              ))}
            </div>
          </div>
        </div>
        {guestMessageCount >= GUEST_MESSAGE_LIMIT ? (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-foreground/50 text-2xs">You've used all guest messages.</span>
            <button
              onClick={() => setShowSignUpModal(true)}
              className="ml-auto px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-semibold hover:bg-primary/30 transition-colors"
            >
              Sign up to continue chatting
            </button>
          </div>
        ) : (
          <div className="text-2xs text-foreground/40">
            This chat won't be saved.{' '}
            <button className="font-semibold text-primary underline underline-offset-2" onClick={() => setShowSignInModal(true)}>
              Sign in to save your conversations.
            </button>
          </div>
        )}
      </div>
    </div>
  ) : null;

  const guestLimitIndicatorJSX = !user && guestMessageCount >= GUEST_MESSAGE_LIMIT ? (
    <div className="max-w-3xl mx-auto w-full text-center py-3 space-y-2">
      <p className="text-xs text-foreground/50">You've reached the guest message limit.</p>
      <button
        onClick={() => setShowSignUpModal(true)}
        className="px-5 py-2 rounded-full bg-gradient-to-br from-primary-subtle to-primary-hover text-foreground text-sm font-semibold hover:from-primary hover:to-cat-knowledge transition-all shadow-md shadow-primary/25"
      >
        Sign up to continue chatting
      </button>
    </div>
  ) : null;

  // ── Sidebar view from URL ─────────────────────────────────────────────────
  const VALID_VIEWS = new Set<SidebarView>(['gallery', 'images', 'planner', 'liked', 'reminders', 'budget', 'shopping', 'saved-items', 'timeline', 'progress', 'notifications', 'collaborate', 'moodboard', 'notes']);
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

  const { voiceState, isRecording, interimText, recordingDuration, error: voiceError, amplitudes, startRecording, stopRecording, cancelRecording, clearError: clearVoiceError } = useVoice();
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

  // ── Timeline events (AI-created via chat + manual) ────────────────────────
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  useEffect(() => {
    if (!user) { setTimelineEvents([]); return; }
    return subscribeToTimelineEvents(user.uid, setTimelineEvents);
  }, [user?.uid]);

  // Live id-sets of the user's artifacts (notes / checklists / timeline /
  // gallery images). ChatMessages uses these to decide whether a message's
  // attached-artifact chip is still clickable or should render as "Deleted
  // artifact". Guest users get empty sets — their messages never have
  // attachments anyway.
  const knownArtifactIds = useKnownArtifactIds(user?.uid ?? null);

  // ── Scroll to + highlight a specific message ─────────────────────────────
  useEffect(() => {
    if (!pendingScrollToId || messages.length === 0) return;
    const el = document.getElementById(`msg-${pendingScrollToId}`);
    if (!el) {
      // Message not in DOM yet — load older messages if available
      if (hasMoreMessages) loadMoreMessages();
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(pendingScrollToId);
    setPendingScrollToId(null);
    const timer = setTimeout(() => setHighlightedMessageId(null), 2000);
    return () => clearTimeout(timer);
  }, [messages, pendingScrollToId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      track('image_uploaded', { size_kb: Math.round(file.size / 1024) });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveImage = () => setAttachedImage(null);

  // ── Guest message counting helper ─────────────────────────────────────────
  // Returns false if the guest has hit the limit (caller should abort).
  // Must be called by every path that sends a message when !user.
  const checkAndBumpGuestCount = (): boolean => {
    if (user) return true;
    if (guestMessageCountRef.current >= GUEST_MESSAGE_LIMIT) {
      track('guest_prompt_hit', { limit_kind: 'message', count: guestMessageCountRef.current });
      return false;
    }
    const nextCount = guestMessageCountRef.current + 1;
    guestMessageCountRef.current = nextCount;
    setGuestMessageCount(nextCount);
    try { localStorage.setItem('easebot-guest-msg-count', String(nextCount)) } catch { }
    return true;
  };

  // True when the guest has exhausted their 3 image generations.
  const guestImageLimitReached = !user && guestImageCountRef.current >= GUEST_IMAGE_LIMIT;

  // Attachments tray — owned by ChatAttachmentsContext, staged from Notes /
  // Checklists / Timeline surfaces via "Attach to chat". We clear the tray
  // only AFTER sendMessage resolves so a failed network call preserves the
  // user's selected attachments for retry. Note: attachments are request-
  // scoped (not thread-scoped) — regenerate / retry / continue do NOT
  // auto-re-attach; users must explicitly re-stage if desired.
  const { attachments: stagedAttachments, clearAttachments } = useChatAttachments();

  const handleSendMessage = (incomingText?: string, incomingAttachments?: ChatAttachment[]) => {
    // ChatInput passes (text, attachments); older call sites (if any) can
    // call with no args and we fall back to the inputText state + staged tray.
    const rawText = incomingText !== undefined ? incomingText : inputText;
    const text = rawText.trim();
    if (!text && !attachedImage) return;
    if (!checkAndBumpGuestCount()) return;
    setInputText('');
    const mode = selectedMode === 'auto' ? undefined : selectedMode;
    const lang = voiceLanguage ?? langHint;
    setVoiceLanguage(null);
    const imgBase64 = attachedImage?.base64;
    const imgMime = attachedImage?.mimeType;
    setAttachedImage(null);
    const attachments = incomingAttachments ?? stagedAttachments;
    // PostHog: activation + message-sent tracking. first_message_sent fires
    // once per browser (sessionStorage-gated) to measure time-to-activation.
    try {
      const firstAt = sessionStorage.getItem('ph_first_msg_at');
      if (!firstAt) {
        const start = Number(sessionStorage.getItem('ph_session_start') ?? Date.now());
        sessionStorage.setItem('ph_first_msg_at', String(Date.now()));
        track('first_message_sent', {
          mode: mode ?? 'auto',
          time_to_first_msg_ms: Date.now() - start,
        });
      }
      track('message_sent', {
        mode: mode ?? 'auto',
        msg_len: text.length,
        has_attachment: Boolean(imgBase64) || (attachments?.length ?? 0) > 0,
      });
    } catch { }
    const sendPromise = sendMessage(text || 'Describe this image', {
      mode,
      language: lang,
      imageBase64: imgBase64,
      imageMimeType: imgMime,
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(guestImageLimitReached ? { skipImageGeneration: true } : {}),
    });
    // Clear the tray only on success — if the send throws, the user should
    // be able to retry with the same staged artifacts.
    if (attachments.length > 0) {
      Promise.resolve(sendPromise)
        .then(() => clearAttachments())
        .catch(() => { /* keep attachments staged so the user can retry */ });
    }
  };

  const showVoiceToast = (message: string) => {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 bg-destructive/90 text-destructive-foreground text-xs px-4 py-2 rounded-full shadow-lg z-50 animate-in fade-in';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

  const handleMicClick = async () => {
    if (voiceError) clearVoiceError();
    if (voiceState === 'recording') {
      const result = await stopRecording();
      if (result.ok) {
        setInputText(result.text);
        setVoiceLanguage(result.detectedLanguage);
        track('voice_input_used', { duration_s: result.durationSeconds ?? null });
      } else if (result.reason === 'no_speech') {
        showVoiceToast("Didn't catch that — please try again.");
      } else if (result.reason === 'error') {
        showVoiceToast(result.message);
      }
      // 'cancelled' → stay silent (user cancelled, or quota UI took over)
    } else if (voiceState === 'idle') {
      const err = await startRecording();
      if (err) showVoiceToast(`Mic: ${err}`);
    }
  };

  const handleLanguageChange = async (code: string) => {
    setPreferredLang(code);
    if (user) await updatePreferredLanguage(user.uid, code);
  };

  const startInlineEdit = (m: Message) => {
    setInlineEditId(m.id);
    setInlineEditText(m.text);
    // Preserve attached image — extract base64 from data URI if present
    if (m.attachedImage) {
      setInlineEditImage(m.attachedImage);
      const mimeMatch = m.attachedImage.match(/^data:([^;]+);/)
      setInlineEditImageMime(mimeMatch ? mimeMatch[1] : 'image/png');
    } else {
      setInlineEditImage(null);
      setInlineEditImageMime(null);
    }
  };
  const cancelInlineEdit = () => { setInlineEditId(null); setInlineEditText(''); setInlineEditImage(null); setInlineEditImageMime(null); };

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
    // Extract raw base64 from data URI if image is present
    let imgBase64: string | undefined;
    let imgMime: string | undefined;
    if (inlineEditImage) {
      const parts = inlineEditImage.match(/^data:([^;]+);base64,(.+)$/);
      if (parts) {
        imgMime = parts[1];
        imgBase64 = parts[2];
      }
    }
    if (!checkAndBumpGuestCount()) return;
    sendMessage(text, undefined, mode, langHint, imgBase64, imgMime);
    track('message_edited', { message_id: m.id, msg_len: text.length, has_image: !!imgBase64 });
    setInlineEditImage(null);
    setInlineEditImageMime(null);
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
    if (!checkAndBumpGuestCount()) return;
    track('regenerate_clicked', {
      message_id: m.id,
      mode: selectedMode === 'auto' ? undefined : selectedMode,
    });
    const idx = messages.findIndex(msg => msg.id === m.id);
    let userMsgIdx = idx - 1;
    while (userMsgIdx >= 0 && messages[userMsgIdx].sender !== 'user') userMsgIdx--;
    if (userMsgIdx >= 0) {
      const userMsg = messages[userMsgIdx];
      truncateMessages(userMsgIdx);
      // Preserve the original turn's mode and language so regeneration lands
      // in the same mode and replies in the same language. Prefer the
      // previous AI message's stamped language (what the model actually
      // produced); fall back to the user's session preference.
      const preservedMode = m.mode ?? (selectedMode === 'auto' ? undefined : selectedMode);
      const preservedLanguage = m.language ?? langHint;
      const baseOpts = {
        ...(preservedMode ? { mode: preservedMode } : {}),
        ...(preservedLanguage ? { language: preservedLanguage } : {}),
        ...(guestImageLimitReached ? { skipImageGeneration: true } : {}),
      };
      if (userMsg.attachedImage) {
        const match = userMsg.attachedImage.match(/^data:([^;]+);base64,(.+)$/);
        if (match) sendMessage(userMsg.text, { imageBase64: match[2], imageMimeType: match[1], ...baseOpts });
        else sendMessage(userMsg.text, baseOpts);
      } else {
        sendMessage(userMsg.text, baseOpts);
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

  const [shareModalUrl, setShareModalUrl] = useState<string | null>(null);
  const [shareModalTitle, setShareModalTitle] = useState('');
  const [shareLinkCopied, setShareLinkCopied] = useState(false);

  // Track the threadId backing the currently-open share modal so share actions
  // (copy / social / native) can report which thread they act on without
  // exposing any title/content.
  const [shareModalThreadId, setShareModalThreadId] = useState<string | null>(null);

  const handleShareThread = async (threadId: string) => {
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return;
    try {
      const shareId = await createSharedChat(threadId, thread.title);
      const shareUrl = `${window.location.origin}/share/${shareId}`;
      setShareModalUrl(shareUrl);
      setShareModalTitle(thread.title);
      setShareModalThreadId(threadId);
      setShareLinkCopied(false);
      track('thread_shared_link_created', { thread_id: threadId });
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

  const handleNewChat = () => {
    startNewChat(); setInputText(''); setSelectedChecklistId(null); setBranchMap({}); navigate('/');
    // Clear chat messages but KEEP the guest usage counts — the limit is
    // per-session, not per-chat, to prevent unlimited usage via new chats.
    if (!user) { sessionStorage.removeItem('easebot-guest-chat'); sessionStorage.removeItem('easebot-guest-images'); }
  };
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

  const handleStopGeneration = () => {
    const lastAi = [...messages].reverse().find(m => m.sender === 'ai');
    const charsStreamed = lastAi?.text?.length ?? 0;
    const threadId = activeThreadId ?? '';
    track('stop_generation_clicked', { thread_id: threadId, chars_streamed: charsStreamed });
    track('stream_aborted_client', { thread_id: threadId });
    stopGeneration();
  };

  const handleContinueGenerating = () => {
    if (!checkAndBumpGuestCount()) return;
    const mode = selectedMode === 'auto' ? undefined : selectedMode;
    sendMessage('Please continue from where you stopped.', {
      mode,
      language: langHint,
      ...(guestImageLimitReached ? { skipImageGeneration: true } : {}),
    });
  };

  const handleToneModifier = (modifier: string) => {
    if (!checkAndBumpGuestCount()) return;
    const mode = selectedMode === 'auto' ? undefined : selectedMode;
    sendMessage(`Rewrite your last response but make it ${modifier}.`, {
      mode,
      language: langHint,
      ...(guestImageLimitReached ? { skipImageGeneration: true } : {}),
    });
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
      track('product_saved', { product_id: productId });
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
      const effectiveVoiceId = getLocalVoiceId() ?? profile?.voiceId ?? undefined;
      const preset = effectiveVoiceId ? getVoicePreset(effectiveVoiceId) : undefined;
      const voiceName = preset?.geminiVoiceName;
      // Use the message's response language (the language the AI actually replied in).
      // If the user has a preferred language override, honour it; otherwise trust the
      // responseLanguage stored on the message by the backend.
      const activeLang = (preferredLang && preferredLang !== 'auto') ? preferredLang : (message.language || 'en');
      console.log(`[TTS] Playing message ${message.id} in language: ${activeLang} (message.language=${message.language}, preferredLang=${preferredLang})`);
      // Defense-in-depth: strip image markdown + bare URLs before handing text to TTS so the voice never reads out file paths.
      const cleanText = message.text.replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/https?:\/\/\S+/g, '').trim();
      const audioUrl = await requestTTS({ text: cleanText, voiceName, language: activeLang });
      setTtsAudioUrls(prev => ({ ...prev, [message.id]: audioUrl }));
      setTtsActiveId(message.id);
    } catch (err) {
      console.error('[TTS]', err);
      // Show brief error toast
      const toast = document.createElement('div');
      toast.textContent = 'Voice synthesis failed. Please try again.';
      toast.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 bg-destructive/90 text-destructive-foreground text-xs px-4 py-2 rounded-full shadow-lg z-50 animate-in fade-in';
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

  // Reset all TTS state: stop playback, revoke blobs, clear IDs
  const ttsAudioUrlsRef = useRef(ttsAudioUrls);
  ttsAudioUrlsRef.current = ttsAudioUrls;

  const resetTts = useCallback(() => {
    Object.values(ttsAudioUrlsRef.current).forEach(u => URL.revokeObjectURL(u));
    setTtsAudioUrls({});
    setTtsActiveId(null);
    setTtsLoadingId(null);
  }, []);

  // Clean up on unmount
  useEffect(() => resetTts, [resetTts]);

  // Stop playback when user navigates away, switches tabs, or changes thread
  useEffect(() => {
    const handleVisibility = () => { if (document.hidden) resetTts(); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [resetTts]);

  // Reset TTS when switching to a different chat thread
  useEffect(() => { resetTts(); }, [activeThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset guest state when user signs in (prevents stale count after sign-up)
  useEffect(() => {
    if (user) {
      setGuestMessageCount(0);
      guestMessageCountRef.current = 0;
      setGuestImageCount(0);
      guestImageCountRef.current = 0;
      sessionStorage.removeItem('easebot-guest-chat');
      sessionStorage.removeItem('easebot-guest-images');
      localStorage.removeItem('easebot-guest-msg-count');
      localStorage.removeItem('easebot-guest-img-count');
    }
  }, [user]);

  // Restore guest chat from sessionStorage on mount
  useEffect(() => {
    if (!user) {
      try {
        const stored = sessionStorage.getItem('easebot-guest-chat');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Restore timestamps as Date objects
            const restored = (parsed as Message[]).map(m => ({
              ...m,
              timestamp: new Date(m.timestamp),
            }));
            restoreMessages(restored);
          }
        }
        // Counts are already initialized from sessionStorage in useState —
        // no need to re-derive from messages here.
      } catch { /* corrupted sessionStorage — ignore */ }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync guest image count from messages (counts AI messages with images)
  useEffect(() => {
    if (user) return;
    const imgCount = messages.filter(m => m.sender === 'ai' && (m.imageUrl || (m.imageUrls && m.imageUrls.length > 0))).length;
    // Only ratchet up — never decrease the count (prevents reset when new chat clears messages)
    const totalImgCount = Math.max(imgCount, guestImageCountRef.current);
    if (totalImgCount !== guestImageCountRef.current) {
      guestImageCountRef.current = totalImgCount;
      setGuestImageCount(totalImgCount);
      try { localStorage.setItem('easebot-guest-img-count', String(totalImgCount)) } catch { }
    }
  }, [user, messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist guest messages to sessionStorage whenever they change
  useEffect(() => {
    if (!user && messages.length > 0) {
      try {
        sessionStorage.setItem('easebot-guest-chat', JSON.stringify(messages));
      } catch { /* quota exceeded — ignore */ }
    }
  }, [user, messages]);

  // Clear guest session data on tab close / navigation away (beforeunload).
  // Guest-generated images are external URLs — clearing sessionStorage effectively
  // removes them from the guest's perspective since they can't be retrieved.
  useEffect(() => {
    if (user) return;
    const cleanup = () => {
      sessionStorage.removeItem('easebot-guest-chat');
      sessionStorage.removeItem('easebot-guest-images');
    };
    window.addEventListener('beforeunload', cleanup);
    return () => window.removeEventListener('beforeunload', cleanup);
  }, [user]);

  // Quick-start cards on the empty-state landing (2×2 grid). Each card switches
  // to the most relevant mode and pre-fills a ready-to-send opener into the
  // composer — the user can personalise before hitting send.
  //
  // "Create an image" has no dedicated mode (image generation is intent-routed
  // on the backend). Its opener is phrased to match the backend's WANTS_IMAGE_RE
  // gate ("create … image"), which is what offers the generate_image tool — so
  // the card reliably produces a picture rather than a text reply.
  type QuickCard = {
    icon: React.ElementType;
    title: string;
    subtitle: string;
    mode?: Mode;
    prompt: string;
  };

  const quickCards: QuickCard[] = [
    {
      icon: CalendarCheck,
      title: 'Plan my wedding',
      subtitle: 'checklist, dates & budget',
      mode: 'planner',
      prompt: 'Help me plan my wedding — build a checklist, map out the key dates, and set a budget.',
    },
    {
      icon: GiHanger,
      title: 'Style my looks',
      subtitle: 'outfits for any function',
      mode: 'stylist',
      prompt: 'Help me style my looks — suggest outfit ideas for my wedding functions.',
    },
    {
      icon: ImagePlus,
      title: 'Create an image',
      subtitle: 'décor, themes & looks',
      prompt: 'Create an image of wedding décor and theme inspiration for my celebration.',
    },
    {
      icon: MessageCircle,
      title: 'Ask anything',
      subtitle: 'any question, any language',
      mode: 'knowledge',
      prompt: 'I have a question about my wedding — can you help?',
    },
  ];

  // Sample prompts ("People are asking") shown below the cards. Tapping one
  // pre-fills the composer; the backend's intent routing handles each (décor
  // ideas, checklist/reminder writes, language switch, knowledge answers).
  const examplePrompts: string[] = [
    'What happens during a haldi?',
    'Create wedding decoration ideas',
    'Make my wedding checklist',
    'Remind me to book the caterer',
    'Chat with me in Hindi',
    'What should I wear for my mehendi?',
  ];

  const handleQuickCard = (card: QuickCard) => {
    if (card.mode) setSelectedMode(card.mode);
    setInputText(card.prompt);
    track('quick_prompt_clicked', {
      kind: 'card',
      label: card.title,
      mode: card.mode ?? selectedMode,
    });
  };

  const handleExamplePrompt = (prompt: string) => {
    setInputText(prompt);
    track('quick_prompt_clicked', { kind: 'example', label: prompt, mode: selectedMode });
  };

  // Make the prompt slider scrollable with a plain desktop mouse. Touch already
  // scrolls overflow-x natively (that's why mobile works), but a mouse has no
  // horizontal gesture, so we wire two affordances. Both live on the element via
  // a callback ref that re-binds whenever the empty-state slider mounts; the
  // listeners are GC'd with the element on unmount (no manual cleanup needed).
  const promptSliderRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;

    // (1) Vertical wheel → horizontal scroll. Non-passive so preventDefault stops
    // the page from scrolling while the pointer is over the slider.
    el.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        if (el.scrollWidth <= el.clientWidth) return;
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // let native horizontal scroll win
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      },
      { passive: false },
    );

    // (2) Click-and-drag to scroll — the gesture desktop users reach for on a
    // hidden-scrollbar strip. Mouse only (pointerType === 'mouse'); touch keeps
    // its native momentum scroll untouched.
    let pressed = false; // pointer is down on the strip
    let dragging = false; // movement crossed the threshold → actively drag-scrolling
    let startX = 0;
    let startScroll = 0;

    el.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (el.scrollWidth <= el.clientWidth) return;
      pressed = true;
      dragging = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      // Don't capture yet: capturing on press retargets the click to this
      // container and would break a chip's tap-to-fill. We capture only once a
      // real drag begins (below).
    });
    el.addEventListener('pointermove', (e: PointerEvent) => {
      if (!pressed) return;
      const dx = e.clientX - startX;
      if (!dragging) {
        if (Math.abs(dx) <= 4) return; // below threshold: still a click, not a drag
        dragging = true;
        el.setPointerCapture(e.pointerId); // now own the gesture (keeps scrolling past the edges)
      }
      el.scrollLeft = startScroll - dx;
    });
    const endDrag = (e: PointerEvent) => {
      if (!pressed) return;
      pressed = false;
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    // Swallow the click that follows a real drag so it doesn't fire a chip's
    // tap-to-fill. Capture phase so it beats the button's own onClick. A plain
    // click never sets `dragging`, so it passes through untouched.
    el.addEventListener(
      'click',
      (e: MouseEvent) => {
        if (dragging) {
          e.preventDefault();
          e.stopPropagation();
          dragging = false;
        }
      },
      true,
    );
  }, []);

  // ── Shortcuts overlay ─────────────────────────────────────────────────────
  const shortcutsOverlayJSX = showShortcuts && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-scrim/30 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
      <div className="bg-card-elevated/95 backdrop-blur-2xl rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-headline text-lg text-foreground/90 flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-primary" />Keyboard Shortcuts
          </h3>
          <button onClick={() => setShowShortcuts(false)} className="text-foreground/40 hover:text-foreground/60 text-sm">Esc</button>
        </div>
        <div className="space-y-2.5">
          {[
            { keys: 'Ctrl + /', desc: 'Show this help' },
            { keys: 'Escape', desc: 'Stop generating / close' },
            { keys: 'Enter', desc: 'Send message' },
            { keys: 'Shift + Enter', desc: 'New line in message' },
          ].map(({ keys, desc }) => (
            <div key={keys} className="flex items-center justify-between">
              <span className="text-xs text-foreground/60">{desc}</span>
              <kbd className="text-2xs font-mono bg-foreground/[0.06] text-foreground/60 px-2 py-0.5 rounded">{keys}</kbd>
            </div>
          ))}
        </div>
        <p className="text-2xs text-foreground/40 mt-4 text-center">Press <kbd className="font-mono bg-foreground/10 px-1 rounded text-3xs">Ctrl + /</kbd> anytime to toggle</p>
      </div>
    </div>
  );

  // ── Chat share modal ──────────────────────────────────────────────────────
  const handleCopyShareLink = async () => {
    if (!shareModalUrl) return;
    try { await navigator.clipboard.writeText(shareModalUrl); }
    catch { /* fallback */ const i = document.createElement('input'); i.value = shareModalUrl; document.body.appendChild(i); i.select(); document.execCommand('copy'); document.body.removeChild(i); }
    setShareLinkCopied(true);
    setTimeout(() => setShareLinkCopied(false), 2000);
    if (shareModalThreadId) track('thread_shared_copied', { thread_id: shareModalThreadId });
  };

  const handleNativeShareChat = async () => {
    if (!shareModalUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ url: shareModalUrl, title: `TheWeddingBot — ${shareModalTitle}`, text: 'Check out this conversation from TheWeddingBot!' });
        if (shareModalThreadId) track('thread_shared_native', { thread_id: shareModalThreadId });
      } catch { /* cancelled */ }
    }
    setShareModalUrl(null);
  };

  const CHAT_SHARE_PLATFORMS = [
    {
      name: 'WhatsApp', color: 'text-success',
      icon: () => <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>,
      getUrl: (url: string) => `https://wa.me/?text=${encodeURIComponent(`Check out this conversation: ${url}`)}`
    },
    {
      name: 'Twitter / X', color: 'text-foreground',
      icon: () => <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>,
      getUrl: (url: string) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Check out this wedding conversation from TheWeddingBot!')}`
    },
    {
      name: 'Email', color: 'text-info',
      icon: () => <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>,
      getUrl: (url: string) => `mailto:?subject=${encodeURIComponent('TheWeddingBot — Shared Conversation')}&body=${encodeURIComponent(`Check out this conversation: ${url}`)}`
    },
  ];

  const shareModalJSX = shareModalUrl && (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-overlay-scrim/40 backdrop-blur-sm" onClick={() => setShareModalUrl(null)}>
      <div className="bg-card-elevated/95 backdrop-blur-2xl rounded-2xl shadow-2xl w-[calc(100%-2rem)] max-w-sm p-5 mx-4 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground/90">Share conversation</h3>
          <button onClick={() => setShareModalUrl(null)} className="p-1 rounded-lg text-foreground/40 hover:text-foreground/70 hover:bg-foreground/10 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Title preview */}
        <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-foreground/[0.04]">
          <p className="text-xs text-foreground/60 truncate">{shareModalTitle}</p>
          <p className="text-3xs text-foreground/30 mt-1">Link expires in 7 days</p>
        </div>

        {/* Copy link */}
        <button onClick={handleCopyShareLink} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-foreground/70 hover:text-foreground/90 hover:bg-foreground/[0.06] transition-all mb-4">
          {shareLinkCopied ? <Check className="h-4 w-4 text-success" /> : <Link className="h-4 w-4 text-foreground/40" />}
          <span>{shareLinkCopied ? 'Link copied!' : 'Copy link'}</span>
          {shareLinkCopied && <Check className="h-4 w-4 text-success ml-auto" />}
        </button>

        {/* Divider */}
        <div className="border-t border-foreground/[0.06] mb-4" />

        {/* Social platforms */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {CHAT_SHARE_PLATFORMS.map(platform => {
            const url = platform.getUrl(shareModalUrl)
            const isMailto = url.startsWith('mailto:')
            // Map platform label → short analytics channel slug.
            const channel = platform.name === 'WhatsApp' ? 'whatsapp'
              : platform.name === 'Twitter / X' ? 'twitter'
                : platform.name === 'Email' ? 'email'
                  : platform.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
            return (
              <a key={platform.name} href={url} target={isMailto ? '_self' : '_blank'} rel={isMailto ? undefined : 'noopener noreferrer'}
                onClick={() => {
                  if (shareModalThreadId) track('thread_shared_social', { thread_id: shareModalThreadId, channel });
                  setShareModalUrl(null);
                }}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-foreground/[0.06] transition-colors">
                <div className={platform.color}><platform.icon /></div>
                <span className="text-3xs text-foreground/40">{platform.name}</span>
              </a>
            )
          })}
        </div>

        {/* Native share (mobile) */}
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button onClick={handleNativeShareChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary/15 text-sm text-primary font-medium hover:bg-primary/25 transition-colors">
            <Share2 className="h-4 w-4" />
            More sharing options
          </button>
        )}
      </div>
    </div>
  );

  // ── Auth modals (always mounted, reused across every view) ────────────────
  // NOTE: these MUST be rendered in every return branch, otherwise header/sidebar
  // "Sign in" buttons flip the open state but have nothing listening for it.
  const authModalsJSX = (
    <>
      <SignInModal open={showSignInModal} onOpenChange={setShowSignInModal} onSwitchToSignUp={(email) => { setSignUpPrefillEmail(email); setShowSignUpModal(true); }} />
      <SignUpModal open={showSignUpModal} onOpenChange={setShowSignUpModal} onSwitchToSignIn={() => setShowSignInModal(true)} initialEmail={signUpPrefillEmail} />
      {/* Homepage feedback dialog — opened from the landing-page "Send feedback"
          entry. Sidebar has its own FeedbackDialog instance; keeping them
          independent avoids a shared-state refactor across owned-files. */}
      <FeedbackDialog open={homeFeedbackOpen} onOpenChange={setHomeFeedbackOpen} />
    </>
  );

  // ── Sidebar (shared across all views) ─────────────────────────────────────
  const sidebarJSX = (
    <ChatSidebar
      isOpen={isSidebarOpen}
      onToggle={() => setIsSidebarOpen(v => !v)}
      user={user}
      profile={profile}
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
      onShowSignUp={() => setShowSignUpModal(true)}
      onSignOut={signOut}
      onShowNotifications={() => setSidebarView('reminders')}
      allLikedMessagesCount={allLikedMessages.length + likedProducts.length}
      calendarEventsCount={reminders.length}
      overdueCount={overdueCount}
      galleryImageCount={galleryImageCount}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
    />
  );

  // ── Settings shell (always mounted so sidebar button works from any view) ─
  // Sprint 4 (Hana) — legacy <SettingsModal /> removed (Marcus QA M-8).
  // showSettingsModal state still drives the open intent; setShowSettingsModal
  // is shimmed above to deep-link via the ?settings=… query param.
  void showSettingsModal;
  const settingsModalJSX = <SettingsShell onShowSignIn={() => setShowSignInModal(true)} onShowSignUp={() => setShowSignUpModal(true)} />;

  // ── Shared chat header (used across chat + all sidebar views) ─────────────
  const chatHeaderJSX = (
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
  );

  // ── Auth wall for unauthorized chat access ────────────────────────────────
  // If someone navigates to /chat/:threadId without being logged in, or if the
  // logged-in user doesn't own the thread (Firestore returns permission error),
  // show a gate instead of an empty chat.
  // The chat thread was deleted by its owner (or the link is invalid). Show an
  // unavailable state to everyone — including a shared viewer who had the link —
  // instead of a blank chat. See PRD-SECURITY-cross-user-access-control.md.
  if (urlThreadId && !authLoading && chatUnavailable) {
    return (
      <div className="gradient-bg min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-sm mx-auto">
          <AlertTriangle className="h-12 w-12 text-foreground/30 mx-auto mb-4" />
          <h2 className="font-headline text-xl text-foreground/90 mb-2">This chat is no longer available</h2>
          <p className="text-sm text-foreground/50 mb-6">It may have been deleted by its owner.</p>
          <Button onClick={() => navigate('/')} className="rounded-xl px-6">
            Go to my chats
          </Button>
        </div>
      </div>
    );
  }

  if (urlThreadId && !authLoading && (!user || chatLoadError)) {
    const deniedForOtherAccount = !!user && chatLoadError;
    return (
      <div className="gradient-bg min-h-screen flex flex-col items-center justify-center px-6 text-center">
        {authModalsJSX}
        <div className="max-w-sm mx-auto">
          <Lock className="h-12 w-12 text-primary/60 mx-auto mb-4" />
          <h2 className="font-headline text-xl text-foreground/90 mb-2">
            {deniedForOtherAccount ? 'This chat belongs to another account' : 'You cannot view this chat'}
          </h2>
          <p className="text-sm text-foreground/50 mb-6">
            {deniedForOtherAccount ? "You don't have access to this conversation." : 'Login or signup to view.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {deniedForOtherAccount ? (
              <Button onClick={() => navigate('/')} className="rounded-xl px-6">
                Go to my chats
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => setShowSignInModal(true)}
                  className="rounded-xl px-6"
                >
                  Login
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowSignUpModal(true)}
                  className="rounded-xl px-6"
                >
                  Sign up
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Per-user private routes (/:userId/notes, /:userId/budget, /:userId/planner,
  // …) require auth. A guest who opens one — e.g. a shared note link before
  // signing in — must see the auth gate, NOT the default chat landing (which is
  // the bug this fixes). After sign-in the route guard above re-homes them and
  // the view enforces per-resource ownership. True isolation needs Firestore
  // rules — see PRD-SECURITY-cross-user-access-control.md.
  if (urlUserId && !authLoading && !user) {
    const isNoteRoute = sidebarView === 'notes';
    return (
      <div className="gradient-bg min-h-screen flex flex-col items-center justify-center px-6 text-center">
        {authModalsJSX}
        <div className="max-w-sm mx-auto">
          <Lock className="h-12 w-12 text-primary/60 mx-auto mb-4" />
          <h2 className="font-headline text-xl text-foreground/90 mb-2">
            {isNoteRoute ? 'Sign in to view this note' : 'Sign in to view this'}
          </h2>
          <p className="text-sm text-foreground/50 mb-6">
            {isNoteRoute
              ? 'This note is private. Sign in with the account it was shared to.'
              : 'Please sign in to access this page.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => setShowSignInModal(true)} className="rounded-xl px-6">
              Login
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowSignUpModal(true)}
              className="rounded-xl px-6"
            >
              Sign up
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Planner detail view ───────────────────────────────────────────────────
  if (sidebarView === 'planner' && selectedChecklistId && user) {
    return (
      <div className={`gradient-bg flex overflow-hidden bg-background transition-all duration-300 ${isSidebarOpen ? '' : 'pl-0'}`} style={{ height: '100dvh' }}>
        {shortcutsOverlayJSX}
        {shareModalJSX}
        {settingsModalJSX}
        {authModalsJSX}
        {isSidebarOpen && <div className="fixed inset-0 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
        {sidebarJSX}
        <main className={`flex-1 flex flex-col overflow-hidden transition-[padding] duration-300 ${isSidebarOpen ? 'md:pl-64' : ''}`}>
          {chatHeaderJSX}
          <div className="flex items-center gap-2 px-3 sm:px-5 h-11 flex-shrink-0 border-b border-border/40">
            <Button variant="ghost" size="sm" onClick={() => { setSelectedChecklistId(null); navigate('/'); }} className="h-7 w-7 p-0 rounded-lg hover:bg-foreground/10">
              <ArrowLeft className="h-3.5 w-3.5 text-foreground/60" />
            </Button>
            <h2 className="font-headline text-base text-foreground/90 flex items-center gap-2"><CheckSquare className="h-4 w-4 text-primary" />Planner</h2>
          </div>
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
  const mainAreaShell = (title: string, icon: React.ReactNode, children: React.ReactNode, onBack?: () => void) => (
    <div className={`gradient-bg flex overflow-hidden bg-background transition-all duration-300 ${isSidebarOpen ? '' : 'pl-0'}`} style={{ height: '100dvh' }}>
      {shortcutsOverlayJSX}
      {shareModalJSX}
      {settingsModalJSX}
      {authModalsJSX}
      {isSidebarOpen && <div className="fixed inset-0 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
      {sidebarJSX}
      <main className={`flex-1 flex flex-col overflow-x-hidden overflow-hidden transition-[padding] duration-300 ${isSidebarOpen ? 'md:pl-64' : ''}`}>
        {chatHeaderJSX}
        <div className="flex items-center gap-2 px-3 sm:px-5 h-11 flex-shrink-0 border-b border-border/40">
          <Button variant="ghost" size="sm" onClick={onBack ?? (() => navigate('/'))} className="h-7 w-7 p-0 rounded-lg hover:bg-foreground/10">
            <ArrowLeft className="h-3.5 w-3.5 text-foreground/60" />
          </Button>
          <h2 className="font-headline text-base text-foreground/90 flex items-center gap-2">{icon}{title}</h2>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-5">
          <div className=" mx-auto w-full">{children}</div>
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

  // ── Liked messages + products ─────────────────────────────────────────────
  if (sidebarView === 'liked') {
    const isEmpty = allLikedMessages.length === 0 && likedProducts.length === 0;
    return mainAreaShell('Liked', <ThumbsUp className="h-5 w-5 text-primary" />,
      isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 text-foreground/40">
          <ThumbsUp className="h-10 w-10 mb-3 opacity-20" />
          <p className="text-sm">Nothing liked yet.</p>
          <p className="text-xs mt-1">Tap the heart on a product or <ThumbsUp className="inline h-3 w-3 mx-0.5" /> on any AI response.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {likedProducts.length > 0 && (
            <section>
              <h3 className="text-3xs uppercase tracking-wider text-foreground/40 font-semibold mb-3">
                Liked Products
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {likedProducts.map((p) => (
                  <a
                    key={p.id}
                    href={p.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-row gap-3 items-start p-3 rounded-2xl border border-foreground/10 bg-foreground/[0.06] hover:bg-foreground/[0.1] hover:border-primary/40 transition-all duration-150 no-underline"
                  >
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      className="w-[72px] h-[72px] object-cover rounded-xl flex-shrink-0"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <span className="text-sm font-semibold text-primary leading-snug line-clamp-1">{p.name}</span>
                      {p.description && (
                        <span className="text-xs text-foreground/60 leading-relaxed line-clamp-2">{p.description}</span>
                      )}
                      {p.sourceThreadTitle && (
                        <span className="text-2xs text-foreground/40 mt-0.5 line-clamp-1">from "{p.sourceThreadTitle}"</span>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}
          {allLikedMessages.length > 0 && (
            <section>
              <h3 className="text-3xs uppercase tracking-wider text-foreground/40 font-semibold mb-3">
                Liked Messages
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {allLikedMessages.slice().sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).map((msg) => (
                  <div
                    key={msg.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleLikedMessageClick(msg)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleLikedMessageClick(msg); } }}
                    className="cursor-pointer text-left rounded-2xl bg-foreground/[0.06] px-4 py-3.5 space-y-2 hover:bg-foreground/[0.1] transition-all duration-150"
                  >
                    {msg.mode && <span className="inline-block text-3xs uppercase tracking-wider font-semibold text-primary/70 bg-primary/10 rounded-full px-1.5 py-0.5">{msg.mode}</span>}
                    <div className="relative max-h-40 overflow-hidden">
                      <div className="prose prose-sm prose-invert max-w-none text-[13px] leading-[1.6] text-foreground/70 prose-headings:text-foreground/80 prose-headings:text-sm prose-headings:font-semibold prose-headings:mt-1 prose-headings:mb-1 prose-strong:text-foreground/85 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-a:text-primary prose-a:no-underline">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            // Block images/links from doing anything inside a preview.
                            img: () => null,
                            a: ({ children }: any) => <span className="text-primary font-medium">{children}</span>,
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-foreground/[0.06] to-transparent" />
                    </div>
                    <p className="text-2xs text-foreground/40">{msg.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )
    );
  }

  // ── Reminders ─────────────────────────────────────────────────────────────
  if (sidebarView === 'reminders') {
    return mainAreaShell('Upcoming & Reminders', <Calendar className="h-5 w-5 text-primary" />,
      <RemindersView
        reminders={reminders}
        onRefresh={refetchReminders}
      />
    );
  }

  // ── Budget ────────────────────────────────────────────────────────────────
  if (sidebarView === 'budget' && user) return mainAreaShell('Budget Tracker', <DollarSign className="h-5 w-5 text-primary" />, <BudgetDashboard userId={user.uid} />);
  if (sidebarView === 'shopping' && user) return mainAreaShell('Shopping Lists', <ShoppingCart className="h-5 w-5 text-primary" />, <ShoppingListView userId={user.uid} />);
  if (sidebarView === 'saved-items' && user) return mainAreaShell('Saved Items', <Bookmark className="h-5 w-5 text-primary" />, <SavedItemsView userId={user.uid} />);
  if (sidebarView === 'timeline' && user) return mainAreaShell('Timeline', <Clock className="h-5 w-5 text-primary" />, <TimelineView userId={user.uid} checklists={checklistsData} reminders={reminders} timelineEvents={timelineEvents} weddingDate={profile?.weddingDate ? (profile.weddingDate as any).toDate?.() ?? null : null} onRefresh={refetchReminders} />);

  if (sidebarView === 'progress' && user) {
    const budgetStats = budgetData ? { totalBudget: budgetData.totalBudget, totalSpent: budgetData.categories.reduce((sum, c) => sum + c.spent, 0) } : null;
    return mainAreaShell('Progress', <BarChart3 className="h-5 w-5 text-primary" />, <ProgressDashboard weddingDate={profile?.weddingDate ? (profile.weddingDate as any).toDate?.() ?? null : null} checklistStats={computeStats(checklistsData)} budgetStats={budgetStats} calendarEventCount={reminders.length} threadCount={threads.length} />);
  }

  if (sidebarView === 'notifications' && user) return mainAreaShell('Notifications', <Bell className="h-5 w-5 text-primary" />, <NotificationPanel userId={user.uid} checklists={checklistsData} />);
  if (sidebarView === 'collaborate' && user && profile) return mainAreaShell('Collaborate', <Users className="h-5 w-5 text-primary" />, <InvitePartner userId={user.uid} userEmail={profile.email} userName={profile.name} />);
  if (sidebarView === 'notes' && user && profile) {
    // When a note is open (/:userId/notes/:noteId), "back" returns to the notes
    // listing rather than jumping straight to chat; from the listing it goes to chat.
    const openNoteId = pathSegments[2] ?? null;
    return mainAreaShell(
      'Notes',
      <FileText className="h-5 w-5 text-primary" />,
      <NotesView userId={user.uid} userEmail={profile.email} userName={profile.name} />,
      openNoteId ? () => navigate(`/${activeUserId}/notes`) : undefined,
    );
  }
  if (sidebarView === 'gallery' || sidebarView === 'images') return mainAreaShell('Images', <Image className="h-5 w-5 text-primary" />, user ? <ImagesHub sendMessage={sendMessage} startNewChat={startNewChat} /> : <div className="flex flex-col items-center justify-center py-20 text-center text-foreground/40 space-y-2"><Image className="h-10 w-10 opacity-20" /><p className="text-sm">Sign in to view your generated images.</p></div>);

  // ── Coming soon views ─────────────────────────────────────────────────────
  const comingSoonViews: Record<string, { title: string; icon: React.ReactNode; desc: string }> = {
    'moodboard': { title: 'Moodboard', icon: <Image className="h-5 w-5 text-primary" />, desc: 'Collect inspiration images for your wedding aesthetic.' },
  };
  if (sidebarView in comingSoonViews) {
    const cs = comingSoonViews[sidebarView];
    return mainAreaShell(cs.title, cs.icon,
      <div className="flex flex-col items-center justify-center py-20 text-center text-foreground/40 space-y-2">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-1">{cs.icon}</div>
        <p className="text-sm font-semibold text-foreground/60">Coming Soon</p>
        <p className="text-xs max-w-xs leading-relaxed">{cs.desc}</p>
      </div>
    );
  }

  // ── Shared input bar props ────────────────────────────────────────────────
  const inputBarProps = {
    inputText: voiceState === 'recording' ? interimText : inputText,
    onInputChange: setInputText,
    onSend: handleSendMessage,
    onStop: handleStopGeneration,
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
    amplitudes,
  };

  // ── Expanded chat view ────────────────────────────────────────────────────
  if (isExpanded) {
    return (
      <div className={`gradient-bg flex overflow-hidden bg-background transition-all duration-300 ${isSidebarOpen ? '' : 'pl-0'}`} style={{ height: '100dvh' }}>
        {shortcutsOverlayJSX}
        {shareModalJSX}
        {settingsModalJSX}
        {authModalsJSX}
        {isSidebarOpen && <div className="fixed inset-0 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
        {sidebarJSX}

        <main className={`flex-1 min-w-0 flex flex-col relative overflow-hidden transition-[padding] duration-300 ${isSidebarOpen ? 'md:pl-64' : ''}`}>
          {chatHeaderJSX}
          {guestBannerJSX}

          <ChatMessages
            messages={messages}
            isTyping={isTyping}
            selectedMode={selectedMode}
            user={user}
            profile={profile}
            activeThreadId={activeThreadId}
            activeUserId={activeUserId}
            knownArtifactIds={knownArtifactIds}
            highlightedMessageId={highlightedMessageId}
            hasMoreMessages={hasMoreMessages}
            loadingMoreMessages={loadingMoreMessages}
            inlineEditId={inlineEditId}
            inlineEditText={inlineEditText}
            inlineEditImage={inlineEditImage}
            onStartInlineEdit={startInlineEdit}
            onCancelInlineEdit={cancelInlineEdit}
            onSubmitInlineEdit={submitInlineEdit}
            onInlineEditTextChange={setInlineEditText}
            onInlineEditImageChange={setInlineEditImage}
            onInlineEditImageRemove={() => { setInlineEditImage(null); setInlineEditImageMime(null); }}
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
            likedProductIds={likedProductIds}
            onToggleProductLike={(product) => {
              const productId = product.uid || `${product.name}-${product.productUrl}`.toLowerCase().replace(/\s+/g, '-');
              track('product_like_toggled', { product_id: productId, liked: !likedProductIds.has(productId) });
              void toggleProductLike(product);
            }}
            onShareProduct={async (productTitle) => {
              if (!activeThreadId) return;
              try {
                const shareId = await createSharedChat(activeThreadId, productTitle || 'Recommended product');
                const shareUrl = `${window.location.origin}/share/${shareId}`;
                setShareModalUrl(shareUrl);
                setShareModalTitle(productTitle || 'Recommended product');
                setShareModalThreadId(activeThreadId);
                setShareLinkCopied(false);
                track('product_shared_link_created', { thread_id: activeThreadId });
              } catch (err) {
                console.error('[share:product] error:', err);
              }
            }}
            onOpenPlanner={(checklistId) => { navigate(`/${activeUserId}/planner/${checklistId}`); setSelectedChecklistId(checklistId); }}
            onShowSignIn={() => setShowSignInModal(true)}
            onDeleteImage={deleteMessageImage}
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
          <div className="mt-auto px-3 sm:px-6 pt-1 flex-shrink-0 relative z-10" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
            {guestLimitIndicatorJSX || (
              <>
                <div className="flex items-end justify-between w-full gap-3">
                  {/* Left invisible spacer balances the right logo perfectly so the chat input remains centered */}
                  <div className="w-12 sm:w-14 hidden sm:block invisible flex-shrink-0" aria-hidden="true" />

                  <div className="flex-1 min-w-0 max-w-2xl mx-auto">
                    <ChatInput {...inputBarProps} placeholder="ask me anything" className="w-full" />
                  </div>

                  {/* Right logo snaps to the corner nicely. Flex spacer causes chat input to shrink if needed, preventing overlap on narrow screens */}
                  <div className="w-12 sm:w-14 hidden sm:flex flex-shrink-0 items-end justify-end mb-1">
                    <WeddingEaseFloater isFixed={false} />
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={handleFileSelected} />
              </>
            )}
          </div>
        </main>

      </div>
    );
  }

  // ── Landing page ──────────────────────────────────────────────────────────
  return (
    <div className={`gradient-bg flex overflow-hidden bg-background transition-all duration-300 ${isSidebarOpen ? '' : 'pl-0'}`} style={{ height: '100dvh' }}>
      {shortcutsOverlayJSX}
      {shareModalJSX}
      {settingsModalJSX}
      {authModalsJSX}
      {isSidebarOpen && <div className="fixed inset-0 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
      {sidebarJSX}

      <main className={`flex-1 flex flex-col relative overflow-hidden transition-[padding] duration-300 ${isSidebarOpen ? 'md:pl-64' : ''}`}>
        {chatHeaderJSX}
        {guestBannerJSX}
        {/* Landing content
            Mobile: top-aligned, tight spacing — everything must fit on a
            375×667 iPhone SE without scrolling. Desktop keeps the airy
            center-aligned hero. */}
        <div className="flex-1 flex flex-col items-center justify-center px-3 pt-3 pb-2 sm:p-6 noise-overlay relative floral-overlay overflow-y-auto overflow-x-hidden">
          <div className="text-center max-w-3xl mx-auto w-full relative z-10 flex flex-col items-center">
            <div className="relative z-10 w-full">
              {/* Bot logo */}
              <div className="mx-auto mb-2 sm:mb-4">
                <div className="relative mx-auto inline-block">
                  <img src={logoImg} alt="TheWeddingBot" className="h-20 sm:h-30 object-contain block" />
                  {/* Light-theme only: overlay an inverted copy clipped to the right half
                      so only the text characters flip to black, not the left-side graphic */}
                  <img
                    src={logoImg}
                    alt=""
                    aria-hidden="true"
                    className="hidden [.light_&]:block absolute inset-0 h-20 sm:h-30 object-contain invert"
                    style={{ clipPath: 'inset(0 0 0 30%)' }}
                  />
                </div>
              </div>
              {/* <p className="hidden sm:block text-2xs uppercase tracking-[0.25em] text-primary/60 font-label mb-6 text-center">Your Wedding Concierge</p> */}

              {/* Hero heading — tighter on mobile */}
              <h2 className="mt-12 font-headline text-lg sm:text-xl md:text-[1.3rem] text-soft mb-1.5 sm:mb-3 tracking-tight text-center leading-tight">
                Hi!   <span className='text-primary/80'>I'm here to help...</span>
              </h2>
              <p className="text-xs sm:text-sm text-soft mb-4 sm:mb-6 leading-relaxed max-w-lg mx-auto text-center font-body px-2">
                {/* Ask me anything about your wedding */}
                {/* <br/> */}
                In any language, by text or voice.
              </p>
              <div className="glass-action-card hidden sm:flex items-center gap-3 rounded-2xl px-4 py-3 mb-5 max-w-2xl mx-auto w-full">
                <Sparkles className="w-5 h-5 text-primary/70 flex-shrink-0" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-soft">Not sure where to start?</p>
                  <p className="text-xs text-soft">Tell me what you are looking for your celebration</p>
                </div>
                <button
                  onClick={() => setInputText('Help me decide what I need for my wedding')}
                  className="glass-action-card px-4 py-2 rounded-full text-soft text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0"
                >
                  Help me decide <Sparkles className="w-3 h-3" />
                </button>
              </div>

              {/* Quick-start cards — 2×2 grid, compact, each with title + subtitle. */}
              <div className="grid grid-cols-2 gap-2 mb-3 sm:mb-4 max-w-md mx-auto w-full">
                {quickCards.map((card) => (
                  <button
                    key={card.title}
                    onClick={() => handleQuickCard(card)}
                    className="glass-action-card flex flex-col items-center gap-0.5 rounded-lg sm:rounded-xl px-2.5 py-2 sm:px-3 sm:py-2.5 group cursor-pointer text-center"
                  >
                    <card.icon strokeWidth={2.5} className="w-6 h-6 sm:w-5 sm:h-5 text-primary/80 group-hover:text-primary transition-colors mb-0.5" />
                    <span className="text-[13px] sm:text-[14px] font-semibold text-soft leading-tight">{card.title}</span>
                    <span className="text-[10px] sm:text-[11px] text-foreground/50 leading-snug">{card.subtitle}</span>
                  </button>
                ))}
              </div>

              {/* "Not sure what you need?" banner — desktop only (mobile users have
                  the prompt cards above which already cover this) */}

              {/* Homepage feedback entry — visible to guests and signed-in users.
                  Opens DEV-B's FeedbackDialog. Placed in the empty-state so
                  users can flag bugs/ideas without hunting through the sidebar. */}
              <div className="flex items-center justify-center gap-1.5 text-2xs sm:text-xs text-foreground/50 mb-2">
                <MessageSquareHeart className="h-3.5 w-3.5 text-primary/70" />
                <span>Have feedback?</span>
                <button
                  type="button"
                  onClick={() => setHomeFeedbackOpen(true)}
                  className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                >
                  Send it here
                </button>
              </div>

              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={handleFileSelected} />
            </div>
          </div>
        </div>

        {/* Bottom-anchored ChatInput — mirrors active chat layout so the landing
            and chat pages share one input position (no floating input in middle). */}
        <div className="flex-shrink-0 px-3 sm:ps-6 pb-3 sm:pb-4 pt-2 relative z-10">
          <div className=" mx-auto w-full">
            {/* "People are asking" — single-row horizontal slider of tap-to-fill
                prompts (mirrors the old occasion-chip slider, new content).
                promptSliderRef enables mouse-wheel horizontal scroll on desktop. */}
            <div ref={promptSliderRef} className="overflow-x-scroll scrollbar-hide max-w-2xl mb-2 min-w-0 m-auto cursor-grab active:cursor-grabbing select-none" style={{ WebkitOverflowScrolling: 'touch' }}>
              <div className="flex flex-nowrap items-center gap-1.5 sm:gap-2 px-1 pb-1 w-max">
                {examplePrompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => handleExamplePrompt(p)}
                    className="rounded-full px-3 sm:px-4 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium transition-all duration-200 border whitespace-nowrap flex-shrink-0 cursor-pointer bg-foreground/[0.06] border-foreground/[0.1] text-soft hover:bg-foreground/10"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end justify-between w-full gap-3">
              <div className="flex-1 min-w-0  mx-auto">
                {guestLimitIndicatorJSX || (
                  <div className="flex items-end justify-between w-full gap-3">
                    <div className="w-12 sm:w-14 hidden sm:block invisible flex-shrink-0" aria-hidden="true" />
                    <div className="flex-1 max-w-2xl min-w-0">
                      <ChatInput {...inputBarProps} placeholder="Ask me anything " className="w-full" />
                    </div>
                    <div className="w-12 sm:w-14 hidden sm:flex flex-shrink-0 items-end justify-end mb-1">
                      <WeddingEaseFloater isFixed={false} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom tagline — desktop only; on mobile it's redundant and steals 30px */}
        {/* <p className="hidden sm:block flex-shrink-0 text-center py-3 text-2xs text-foreground/25 uppercase tracking-[0.25em] font-medium">
          wedding ease — your day, perfected
        </p> */}
      </main>
    </div>
  );
};

export default Index;
