import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { track } from '@/lib/analytics';
import {
  PanelLeft, Search, SquarePen, Pin, PinOff,
  MoreHorizontal, Pencil, Trash2, Share2, Archive, ArchiveRestore,
  Tag, X, ChevronDown, ChevronRight,
  ThumbsUp, Bell, CheckSquare, DollarSign, ShoppingCart, ImagePlus,
  Clock, BarChart3, Users, Settings, LogIn, FileText, CircleHelp, Sparkles,
  MessageSquareHeart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ChatThread, UserProfile } from '@/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ProfileMenu } from '@/components/ProfileMenu';
import FeedbackDialog from '@/components/FeedbackDialog';
import { useAccount } from '@/hooks/useAccount';
import { resolveTier, getLimits } from '@/config/tierConfig';
import { TAG_PRESETS, getTagStyle } from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type SidebarView =
  | 'history' | 'liked' | 'reminders' | 'planner' | 'saved-items'
  | 'moodboard' | 'shopping' | 'budget' | 'timeline' | 'progress'
  | 'notifications' | 'collaborate' | 'gallery' | 'images' | 'notes';

export interface ChatSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  user: { uid: string } | null;
  profile: UserProfile | null;
  threads: ChatThread[];
  activeThreadId: string | null;
  sidebarView: SidebarView;
  onSetSidebarView: (view: SidebarView) => void;
  onNewChat: () => void;
  onLoadChat: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, title: string) => Promise<void>;
  onPinThread: (threadId: string, pinned: boolean) => Promise<void>;
  onArchiveThread: (threadId: string, archived: boolean) => void;
  onShareThread: (threadId: string) => void;
  onUpdateThreadTags: (threadId: string, tags: string[]) => void;
  onShowShortcuts: () => void;
  onShowSettings: () => void;
  onShowSignIn: () => void;
  onShowSignUp: () => void;
  onSignOut: () => void;
  onShowNotifications?: () => void;
  // Data for badges
  allLikedMessagesCount: number;
  calendarEventsCount: number;
  overdueCount: number;
  galleryImageCount: number;
  // Search
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
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

const dateGroupOrder = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days'];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const ChatSidebar: React.FC<ChatSidebarProps> = ({
  isOpen, onToggle, user, profile, threads, activeThreadId,
  sidebarView, onSetSidebarView,
  onNewChat, onLoadChat, onDeleteThread, onRenameThread, onPinThread,
  onArchiveThread, onShareThread, onUpdateThreadTags,
  onShowShortcuts, onShowSettings, onShowSignIn, onShowSignUp, onSignOut,
  onShowNotifications,
  allLikedMessagesCount, calendarEventsCount, overdueCount, galleryImageCount,
  searchQuery, onSearchQueryChange,
}) => {
  const navigate = useNavigate();
  const { plan: accountPlan } = useAccount();
  const resolvedTier = accountPlan?.tier ?? profile?.plan ?? (profile?.isPremium ? 'pro' : 'free');
  const [showSearch, setShowSearch] = useState(false);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [tagPickerThreadId, setTagPickerThreadId] = useState<string | null>(null);
  const [deleteConfirmThreadId, setDeleteConfirmThreadId] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // Debounced thread_searched analytics — PII-safe: only length + count.
  // Fires once per user "intent" (debounced 500ms after they stop typing).
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTrackedQueryRef = useRef<string>('');

  const submitRename = async (threadId: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) await onRenameThread(threadId, trimmed);
    setRenamingThreadId(null);
  };

  const handleToggleTag = (threadId: string, tagName: string) => {
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return;
    const currentTags = thread.tags ?? [];
    const newTags = currentTags.includes(tagName)
      ? currentTags.filter(t => t !== tagName)
      : [...currentTags, tagName];
    onUpdateThreadTags(threadId, newTags);
  };

  // ── Filtered / grouped threads ─────────────────────────────────────────────
  const filteredThreads = threads
    .filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(t => !t.archived)
    .filter(t => !selectedTagFilter || (t.tags ?? []).includes(selectedTagFilter));
  const archivedThreads = threads.filter(t => t.archived && t.title.toLowerCase().includes(searchQuery.toLowerCase()));

  // Debounced thread_searched event — fires 500ms after user stops typing, only
  // if the query changed since last fire and is non-empty. No query text sent.
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const q = searchQuery;
    if (!q.trim()) { lastTrackedQueryRef.current = ''; return; }
    searchDebounceRef.current = setTimeout(() => {
      if (lastTrackedQueryRef.current === q) return;
      lastTrackedQueryRef.current = q;
      const resultCount = filteredThreads.length + archivedThreads.length;
      track('thread_searched', { query_length: q.length, result_count: resultCount });
    }, 500);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery, filteredThreads.length, archivedThreads.length]);
  const pinnedThreads = filteredThreads.filter(t => t.pinned);
  const unpinnedThreads = filteredThreads.filter(t => !t.pinned);
  const allUsedTags = Array.from(new Set(threads.flatMap(t => t.tags ?? [])));
  const groupedThreads = unpinnedThreads.reduce((acc, t) => {
    const key = formatDateGroup((t.updatedAt as any)?.toDate?.() ?? new Date());
    (acc[key] ??= []).push(t);
    return acc;
  }, {} as Record<string, ChatThread[]>);
  const sortedGroupKeys = Object.keys(groupedThreads).sort((a, b) => {
    const ai = dateGroupOrder.indexOf(a), bi = dateGroupOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    return ai !== -1 ? -1 : bi !== -1 ? 1 : 0;
  });

  // ── Thread item renderer (shared between pinned + unpinned) ────────────────
  const renderThreadItem = (thread: ChatThread, showPinIcon: boolean) => (
    <div key={thread.id} className="thread-item group relative rounded-lg py-0.5 px-1">
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
          className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-foreground/[0.06] border border-primary/20 outline-none focus:ring-1 focus:ring-primary/30 text-foreground/90"
        />
      ) : (
        <>
          <button
            onClick={() => onLoadChat(thread.id)}
            className={`thread-title w-full text-left text-xs rounded-lg transition-all duration-200 px-2 py-1.5 ${activeThreadId === thread.id ? 'bg-foreground/[0.08] text-primary font-medium' : 'text-foreground/50 hover:text-foreground/75 hover:bg-foreground/[0.04]'}`}
          >
            <div className="flex items-center gap-1.5">
              {showPinIcon && <Pin className="h-2.5 w-2.5 text-primary/40 flex-shrink-0" />}
              <span className="truncate">{thread.title}</span>
            </div>
            {(thread.tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {thread.tags.map(tag => (
                  <span key={tag} className={`text-[7px] px-1 py-0.5 rounded-full border font-medium ${getTagStyle(tag)}`}>{tag}</span>
                ))}
              </div>
            )}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-foreground/10 transition-opacity text-foreground/50 z-10" onClick={e => e.stopPropagation()}>
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-40 bg-card-elevated/95 backdrop-blur-sm border-foreground/10 text-foreground/80" align="end">
              <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => onPinThread(thread.id, !thread.pinned)}>
                {thread.pinned ? <PinOff className="mr-2 h-3.5 w-3.5" /> : <Pin className="mr-2 h-3.5 w-3.5" />}
                {thread.pinned ? 'Unpin' : 'Pin'}
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => onArchiveThread(thread.id, true)}>
                <Archive className="mr-2 h-3.5 w-3.5" />Archive
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer text-xs" onClick={(e) => { e.preventDefault(); setTagPickerThreadId(tagPickerThreadId === thread.id ? null : thread.id); }}>
                <Tag className="mr-2 h-3.5 w-3.5" />Tags
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => onShareThread(thread.id)}>
                <Share2 className="mr-2 h-3.5 w-3.5" />Share
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => { setRenamingThreadId(thread.id); setRenameValue(thread.title); }}>
                <Pencil className="mr-2 h-3.5 w-3.5" />Rename
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer text-xs text-destructive focus:text-destructive" onClick={() => setDeleteConfirmThreadId(thread.id)}>
                <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );

  // ── Tag picker modal ───────────────────────────────────────────────────────
  const tagPickerModal = (
    <Dialog open={!!tagPickerThreadId} onOpenChange={(open) => !open && setTagPickerThreadId(null)}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[500px] glass-panel rounded-2xl p-6 border border-foreground/[0.08] shadow-modal bg-card-elevated/90 backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl text-foreground/90">Organize with Tags</DialogTitle>
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
                className={`py-3 px-4 rounded-xl border-2 font-medium transition-all text-sm ${isActive
                  ? tag.color + ' border-opacity-80 ring-2 ring-offset-2'
                  : 'bg-foreground/10 text-foreground/40 border-foreground/15 hover:bg-foreground/15 hover:border-foreground/25'
                  }`}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 justify-end pt-4 border-t border-foreground/10">
          <Button variant="ghost" onClick={() => setTagPickerThreadId(null)} className="px-6 text-foreground/60 hover:text-foreground/80">
            Cancel
          </Button>
          <Button onClick={() => setTagPickerThreadId(null)} className="px-6 bg-primary hover:bg-primary/90 text-primary-foreground">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // ── Delete confirmation modal ───────────────────────────────────────────
  const deleteConfirmModal = (
    <AlertDialog open={!!deleteConfirmThreadId} onOpenChange={(open) => { if (!open) setDeleteConfirmThreadId(null); }}>
      <AlertDialogContent className="w-[calc(100%-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Chat?</AlertDialogTitle>
          <AlertDialogDescription>
            This conversation will be permanently deleted. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (deleteConfirmThreadId) onDeleteThread(deleteConfirmThreadId);
              setDeleteConfirmThreadId(null);
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <>
      {tagPickerModal}
      {deleteConfirmModal}
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <div className={`fixed left-0 top-0 h-full transition-all duration-300 z-30 font-body ${isOpen ? 'w-64' : 'w-0'} overflow-hidden`} style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="ml-2.5 mt-3 h-[calc(100%-24px)] flex flex-col rounded-2xl border border-primary/15 backdrop-blur-2xl bg-foreground/[0.04] overflow-hidden">

          {/* Top bar: close + search + new chat */}
          <div className="flex items-center justify-between px-3 pt-3 pb-1 flex-shrink-0">
            <Button onClick={onToggle} variant="ghost" className="h-8 w-8 rounded-full hover:bg-foreground/10 text-foreground/70" title="Close sidebar">
              <PanelLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-0.5">
              {user && (() => {
                const t = resolveTier(profile)
                const searchAllowed = getLimits(t).chatSearchable
                return searchAllowed ? (
                  <Button onClick={() => { setShowSearch(v => !v); if (showSearch) onSearchQueryChange(''); }} variant="ghost" className={`h-8 w-8 rounded-full hover:bg-foreground/10 text-foreground/60 ${showSearch ? 'bg-foreground/10' : ''}`} title="Search chats">
                    <Search className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button onClick={() => { /* noop — show tooltip instead */ }} variant="ghost" className="h-8 w-8 rounded-full hover:bg-foreground/10 text-foreground/30 cursor-not-allowed" title="Chat search — upgrade to Pro">
                    <Search className="h-3.5 w-3.5" />
                  </Button>
                )
              })()}
              <Button onClick={onNewChat} variant="ghost" className="h-8 w-8 rounded-full hover:bg-foreground/10 text-foreground/60" title="New Chat">
                <SquarePen className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Search bar */}
          {user && showSearch && (
            <div className="relative px-3 pb-2">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-3 w-3 text-foreground/40" />
              <Input placeholder="Search chats..." value={searchQuery} onChange={e => onSearchQueryChange(e.target.value)} className="pl-9 bg-foreground/[0.06] border-foreground/10 rounded-xl text-sm text-foreground/90 placeholder-foreground/35 h-8" autoFocus />
            </div>
          )}

          {/* Main Navigation */}
          <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 pt-2 pb-2 min-h-0">
            {/* Extra quick actions (logged-in) */}
            {user && (
              <div className="space-y-0.5 mb-4">
                {([
                  { view: 'planner' as const, icon: CheckSquare, label: 'Planner', badge: overdueCount },
                  { view: 'liked' as const, icon: ThumbsUp, label: 'Liked', badge: allLikedMessagesCount },
                  { view: 'reminders' as const, icon: Bell, label: 'Reminders', badge: calendarEventsCount },
                  { view: 'timeline' as const, icon: Clock, label: 'Timeline', badge: 0 },
                  // { view: 'progress' as const, icon: BarChart3, label: 'Progress', badge: 0 },
                  // { view: 'notifications' as const, icon: Bell, label: 'Alerts', badge: 0 },
                  // { view: 'collaborate' as const, icon: Users, label: 'Collaborate', badge: 0 },
                  { view: 'images' as const, icon: ImagePlus, label: 'Images', badge: 0 },
                  { view: 'notes' as const, icon: FileText, label: 'Notes', badge: 0 },
                ] as const).map(({ view, icon: Icon, label, badge }) => {
                  const isActive = sidebarView === view;
                  return (
                    <button
                      key={view}
                      onClick={() => onSetSidebarView(view)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-xs ${isActive ? 'bg-foreground/[0.1] text-primary font-medium' : 'text-foreground/45 hover:text-foreground/70 hover:bg-foreground/[0.04]'}`}
                    >
                      <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-primary' : 'text-foreground/35'}`} />
                      <span>{label}</span>
                      {badge > 0 && (
                        <span className={`ml-auto text-2xs rounded-full px-1.5 py-0.5 font-bold ${isActive ? 'bg-foreground/20 text-primary-foreground' : 'bg-primary/15 text-primary/80'}`}>{badge}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Thread history */}
            {user && (
              <div>
                {/* Pinned Threads */}
                {pinnedThreads.length > 0 && (
                  <div className="mb-3">
                    <h3 className="uppercase tracking-[0.12em] text-2xs text-foreground/35 mb-2 px-2 font-semibold flex items-center gap-1.5">
                      <Pin className="h-3 w-3" />Pinned
                    </h3>
                    <div className="space-y-0.5">
                      {pinnedThreads.map(thread => renderThreadItem(thread, true))}
                    </div>
                  </div>
                )}

                {/* Recent Threads */}
                <h3 className=" tracking-[0.12em] text-2xs text-foreground/35 mb-2 px-2 font-semibold">Recent</h3>
                <div>
                  {sortedGroupKeys.length === 0 && pinnedThreads.length === 0 && !searchQuery && <p className="text-2xs text-foreground/30 text-center py-4 px-3 italic">Your conversations will appear here.</p>}
                  {sortedGroupKeys.length === 0 && searchQuery && <p className="text-xs text-foreground/35 text-center py-3">No chats found for "{searchQuery}"</p>}
                  {sortedGroupKeys.map(dateKey => (
                    <div key={dateKey}>
                      <div className="space-y-0.5">
                        {groupedThreads[dateKey].map(thread => renderThreadItem(thread, false))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Tag filter bar */}
                {allUsedTags.length > 0 && (
                  <div className="mt-3 px-1">
                    <h3 className="uppercase tracking-[0.12em] text-2xs text-foreground/35 mb-1.5 px-1 font-semibold flex items-center gap-1.5">
                      <Tag className="h-3 w-3" />Filter by Tag
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {allUsedTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => setSelectedTagFilter(selectedTagFilter === tag ? null : tag)}
                          className={`text-3xs px-2 py-0.5 rounded-full border font-medium transition-all ${selectedTagFilter === tag
                            ? getTagStyle(tag) + ' ring-1 ring-offset-1'
                            : 'bg-foreground/[0.06] text-foreground/35 border-foreground/10 hover:bg-foreground/10'
                            }`}
                        >{tag}</button>
                      ))}
                      {selectedTagFilter && (
                        <button
                          onClick={() => setSelectedTagFilter(null)}
                          className="text-3xs px-2 py-0.5 rounded-full border border-foreground/15 bg-foreground/[0.06] text-foreground/40 hover:bg-foreground/10 flex items-center gap-0.5"
                        ><X className="h-2.5 w-2.5" />Clear</button>
                      )}
                    </div>
                  </div>
                )}

                {/* Archived Threads */}
                {archivedThreads.length > 0 && (
                  <Collapsible open={showArchived} onOpenChange={setShowArchived} className="mt-2">
                    <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-2 py-1.5 text-3xs font-bold uppercase tracking-wider text-foreground/35 hover:text-foreground/60">
                      {showArchived ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      <Archive className="h-3 w-3" />
                      Archived
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-0.5 animate-in fade-in duration-200 mt-1">
                      {archivedThreads.map(thread => (
                        <div key={thread.id} className="px-2">
                          <button
                            onClick={() => onLoadChat(thread.id)}
                            className="thread-title w-full text-left text-xs px-2 py-1 rounded text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.06] truncate transition-all"
                            title={thread.title}
                          >
                            {thread.title}
                          </button>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Retention notice for free-tier users */}
                {(() => {
                  const t = resolveTier(profile)
                  const l = getLimits(t)
                  if (l.chatRetentionDays === null || t === 'guest') return null
                  return (
                    <div className="mt-3 mx-2 rounded-lg bg-foreground/[0.04] border border-foreground/[0.06] px-3 py-2">
                      <p className="text-3xs text-foreground/40 leading-relaxed">
                        Free plan: chat history is kept for <span className="text-foreground/60 font-medium">{l.chatRetentionDays} days</span>.
                        {' '}<a href="/pricing" className="text-primary hover:underline">Upgrade</a> for full history.
                      </p>
                    </div>
                  )
                })()}
              </div>
            )}
          </nav>

          {/* Send Feedback — always visible, works for guests and logged-in users */}
          <div className="flex-shrink-0 px-3 pt-1.5 pb-1">
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              aria-label="Send Feedback"
              title="Send Feedback"
              className="w-full flex items-center gap-3 px-2.5 py-2.5 min-h-[40px] rounded-xl transition-all duration-200 text-xs text-foreground/70 hover:text-foreground hover:bg-primary/10 border border-transparent hover:border-primary/30"
            >
              <MessageSquareHeart className="h-4 w-4 flex-shrink-0 text-primary" />
              <span className="font-medium">Send Feedback</span>
              <span className="ml-auto text-2xs uppercase tracking-wider text-primary/70 font-semibold">New</span>
            </button>
          </div>

          {/* Bottom: profile dropdown (logged-in) or guest actions */}
          <div className="flex-shrink-0 border-t border-foreground/[0.06] px-3 py-2.5" style={{ paddingBottom: 'calc(0.25rem + env(safe-area-inset-bottom, 0px))' }}>
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-200 text-xs text-foreground/60 hover:text-foreground/90 hover:bg-foreground/[0.05]">
                    <Avatar className="h-7 w-7 flex-shrink-0">
                      <AvatarFallback className="bg-primary/15 text-primary text-2xs font-semibold">
                        {profile?.name
                          ? profile.name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
                          : <Settings className="h-3 w-3" />}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col items-start min-w-0 flex-1">
                      <span className="text-xs font-medium text-foreground/90 truncate w-full text-left">
                        {profile?.name || 'My Account'}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                        {resolvedTier === 'promax' ? 'Pro Max' : resolvedTier === 'pro' ? 'Pro' : 'Free'}
                      </span>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64 text-soft" side="top" align="start" forceMount>
                  <ProfileMenu
                    isAuthenticated={true}
                    onShowSignIn={onShowSignIn}
                    onShowSignUp={onShowSignUp}
                    onSignOut={onSignOut}
                    onShowShortcuts={onShowShortcuts}
                    onShowNotifications={onShowNotifications}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="space-y-0.5">
                <button onClick={() => navigate('/pricing')} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-200 text-xs text-foreground/45 hover:text-foreground/75 hover:bg-foreground/[0.05]">
                  <Sparkles className="h-4 w-4 flex-shrink-0" />
                  <span>See Plans And Pricing</span>
                </button>
                <button onClick={onShowSettings} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-200 text-xs text-foreground/45 hover:text-foreground/75 hover:bg-foreground/[0.05]">
                  <Settings className="h-4 w-4 flex-shrink-0" />
                  <span>Settings</span>
                </button>
                <button onClick={() => navigate('/help')} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-200 text-xs text-foreground/45 hover:text-foreground/75 hover:bg-foreground/[0.05]">
                  <CircleHelp className="h-4 w-4 flex-shrink-0" />
                  <span>Help</span>
                </button>

                {/* Sign-in nudge banner */}
                <div className="mt-2 rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-3">
                  <p className="text-xs font-medium text-foreground/80">Get Responses Tailored To You</p>
                  <p className="mt-1 text-2xs text-foreground/40 leading-relaxed">
                    Log in to save chats, create images, and get personalized wedding planning.
                  </p>
                  <button
                    onClick={onShowSignIn}
                    className="mt-2.5 w-full rounded-xl bg-foreground/[0.9] py-2 text-xs font-semibold text-card-elevated hover:bg-foreground transition-colors"
                  >
                    Log In
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ChatSidebar;
