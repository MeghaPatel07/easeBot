import React, { useState } from 'react';
import {
  PanelLeft, Search, SquarePen, Pin, PinOff,
  MoreHorizontal, Pencil, Trash2, Share2, Archive, ArchiveRestore,
  Tag, X, ChevronDown, ChevronRight,
  ThumbsUp, Bell, CheckSquare, DollarSign, ShoppingCart, ImagePlus,
  Clock, BarChart3, Users, HelpCircle, Settings, LogIn, FileText,
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
import type { ChatThread } from '@/types';
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
  isOpen, onToggle, user, threads, activeThreadId,
  sidebarView, onSetSidebarView,
  onNewChat, onLoadChat, onDeleteThread, onRenameThread, onPinThread,
  onArchiveThread, onShareThread, onUpdateThreadTags,
  onShowShortcuts, onShowSettings, onShowSignIn,
  allLikedMessagesCount, calendarEventsCount, overdueCount, galleryImageCount,
  searchQuery, onSearchQueryChange,
}) => {
  const [showSearch, setShowSearch] = useState(false);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [tagPickerThreadId, setTagPickerThreadId] = useState<string | null>(null);

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
          className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-white/[0.06] border border-primary/20 outline-none focus:ring-1 focus:ring-primary/30 text-white/90"
        />
      ) : (
        <>
          <button
            onClick={() => onLoadChat(thread.id)}
            className={`thread-title w-full text-left text-xs rounded-lg transition-all duration-200 px-2 py-1.5 ${activeThreadId === thread.id ? 'bg-white/[0.08] text-primary font-medium' : 'text-white/50 hover:text-white/75 hover:bg-white/[0.04]'}`}
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
              <button className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 transition-opacity text-white/50 z-10" onClick={e => e.stopPropagation()}>
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-40 bg-[#3A0E20]/95 backdrop-blur-sm border-white/10 text-white/80" align="end">
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
              <DropdownMenuItem className="cursor-pointer text-xs text-red-500 focus:text-red-500" onClick={() => onDeleteThread(thread.id)}>
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
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[500px] glass-panel rounded-2xl p-6 border border-white/[0.1] shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl text-white/90">Organize with Tags</DialogTitle>
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
                  : 'bg-white/10 text-white/40 border-white/15 hover:bg-white/15 hover:border-white/25'
                  }`}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 justify-end pt-4 border-t border-white/10">
          <Button variant="ghost" onClick={() => setTagPickerThreadId(null)} className="px-6 text-white/60 hover:text-white/80">
            Cancel
          </Button>
          <Button onClick={() => setTagPickerThreadId(null)} className="px-6 bg-primary hover:bg-primary/90 text-white">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      {tagPickerModal}
      <div className={`fixed left-0 top-0 h-full transition-all duration-300 z-30 font-['Lato',sans-serif] ${isOpen ? 'w-64' : 'w-0'} overflow-hidden`} style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="ml-2.5 mt-3 h-[calc(100%-24px)] flex flex-col rounded-2xl border border-[#C6944A]/15 backdrop-blur-2xl bg-white/[0.04] overflow-hidden">

          {/* Top bar: close + search + new chat */}
          <div className="flex items-center justify-between px-3 pt-3 pb-1 flex-shrink-0">
            <Button onClick={onToggle} variant="ghost" className="h-8 w-8 rounded-full hover:bg-white/10 text-white/70" title="Close sidebar">
              <PanelLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-0.5">
              {user && (
                <Button onClick={() => { setShowSearch(v => !v); if (showSearch) onSearchQueryChange(''); }} variant="ghost" className={`h-8 w-8 rounded-full hover:bg-white/10 text-white/60 ${showSearch ? 'bg-white/10' : ''}`} title="Search chats">
                  <Search className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button onClick={onNewChat} variant="ghost" className="h-8 w-8 rounded-full hover:bg-white/10 text-white/60" title="New Chat">
                <SquarePen className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Search bar */}
          {user && showSearch && (
            <div className="relative px-3 pb-2">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-3 w-3 text-white/40" />
              <Input placeholder="Search chats..." value={searchQuery} onChange={e => onSearchQueryChange(e.target.value)} className="pl-9 bg-white/[0.06] border-white/10 rounded-xl text-sm text-white/90 placeholder-white/35 h-8" autoFocus />
            </div>
          )}

          {/* Main Navigation */}
          <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 pt-2 pb-2 min-h-0">
            {/* Extra quick actions (logged-in) */}
            {user && (
              <div className="space-y-0.5 mb-4">
                {([
                  { view: 'planner' as const, icon: CheckSquare, label: 'planner', badge: overdueCount },
                  { view: 'liked' as const, icon: ThumbsUp, label: 'liked', badge: allLikedMessagesCount },
                  { view: 'reminders' as const, icon: Bell, label: 'reminders', badge: calendarEventsCount },
                  { view: 'timeline' as const, icon: Clock, label: 'timeline', badge: 0 },
                  // { view: 'progress' as const, icon: BarChart3, label: 'progress', badge: 0 },
                  // { view: 'notifications' as const, icon: Bell, label: 'alerts', badge: 0 },
                  // { view: 'collaborate' as const, icon: Users, label: 'collaborate', badge: 0 },
                  { view: 'images' as const, icon: ImagePlus, label: 'images', badge: 0 },
                  { view: 'notes' as const, icon: FileText, label: 'notes', badge: 0 },
                ] as const).map(({ view, icon: Icon, label, badge }) => {
                  const isActive = sidebarView === view;
                  return (
                    <button
                      key={view}
                      onClick={() => onSetSidebarView(view)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-xs lowercase ${isActive ? 'bg-white/[0.1] text-[#C6944A] font-medium' : 'text-white/45 hover:text-white/70 hover:bg-white/[0.04]'}`}
                    >
                      <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-[#C6944A]' : 'text-white/35'}`} />
                      <span>{label}</span>
                      {badge > 0 && (
                        <span className={`ml-auto text-2xs rounded-full px-1.5 py-0.5 font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-primary/15 text-primary/80'}`}>{badge}</span>
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
                    <h3 className="uppercase tracking-[0.12em] text-2xs text-white/35 mb-2 px-2 font-semibold flex items-center gap-1.5">
                      <Pin className="h-3 w-3" />Pinned
                    </h3>
                    <div className="space-y-0.5">
                      {pinnedThreads.map(thread => renderThreadItem(thread, true))}
                    </div>
                  </div>
                )}

                {/* Recent Threads */}
                <h3 className="uppercase tracking-[0.12em] text-2xs text-white/35 mb-2 px-2 font-semibold">Recent</h3>
                <div>
                  {sortedGroupKeys.length === 0 && pinnedThreads.length === 0 && !searchQuery && <p className="text-2xs text-white/30 text-center py-4 px-3 italic">Your conversations will appear here.</p>}
                  {sortedGroupKeys.length === 0 && searchQuery && <p className="text-xs text-white/35 text-center py-3">No chats found for "{searchQuery}"</p>}
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
                    <h3 className="uppercase tracking-[0.12em] text-2xs text-white/35 mb-1.5 px-1 font-semibold flex items-center gap-1.5">
                      <Tag className="h-3 w-3" />Filter by Tag
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {allUsedTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => setSelectedTagFilter(selectedTagFilter === tag ? null : tag)}
                          className={`text-3xs px-2 py-0.5 rounded-full border font-medium transition-all ${selectedTagFilter === tag
                            ? getTagStyle(tag) + ' ring-1 ring-offset-1'
                            : 'bg-white/[0.06] text-white/35 border-white/10 hover:bg-white/10'
                            }`}
                        >{tag}</button>
                      ))}
                      {selectedTagFilter && (
                        <button
                          onClick={() => setSelectedTagFilter(null)}
                          className="text-3xs px-2 py-0.5 rounded-full border border-white/15 bg-white/[0.06] text-white/40 hover:bg-white/10 flex items-center gap-0.5"
                        ><X className="h-2.5 w-2.5" />Clear</button>
                      )}
                    </div>
                  </div>
                )}

                {/* Archived Threads */}
                {archivedThreads.length > 0 && (
                  <Collapsible open={showArchived} onOpenChange={setShowArchived} className="mt-2">
                    <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-2 py-1.5 text-3xs font-bold uppercase tracking-wider text-white/35 hover:text-white/60">
                      {showArchived ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      <Archive className="h-3 w-3" />
                      Archived
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-0.5 animate-in fade-in duration-200 mt-1">
                      {archivedThreads.map(thread => (
                        <div key={thread.id} className="px-2">
                          <button
                            onClick={() => onLoadChat(thread.id)}
                            className="w-full text-left text-xs px-2 py-1 rounded text-white/40 hover:text-white/70 hover:bg-white/[0.06] truncate transition-all"
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

          {/* Bottom: help + settings + profile */}
          <div className="flex-shrink-0 border-t border-white/[0.06] px-3 py-2.5" style={{ paddingBottom: 'calc(0.25rem + env(safe-area-inset-bottom, 0px))' }}>
            {user ? (
              <div className="space-y-1">
                <button onClick={onShowShortcuts} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-200 text-xs lowercase text-white/45 hover:text-white/75 hover:bg-white/[0.05]">
                  <HelpCircle className="h-4 w-4 flex-shrink-0" />
                  <span>help</span>
                </button>
                <button onClick={onShowSettings} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-200 text-xs lowercase text-white/45 hover:text-white/75 hover:bg-white/[0.05]">
                  <Settings className="h-4 w-4 flex-shrink-0" />
                  <span>settings</span>
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <button onClick={onShowShortcuts} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-200 text-xs lowercase text-white/45 hover:text-white/75 hover:bg-white/[0.05]">
                  <HelpCircle className="h-4 w-4 flex-shrink-0" />
                  <span>help</span>
                </button>
                <button className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl bg-gradient-to-r from-[#C6944A]/12 to-transparent border border-[#C6944A]/20 hover:border-[#C6944A]/35 transition-all duration-200 text-xs text-white/70" onClick={onShowSignIn}>
                  <LogIn className="h-4 w-4 text-primary flex-shrink-0" />
                  <span>sign in</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ChatSidebar;
