import React, { useState, useMemo } from 'react';
import {
  ArrowLeft, Plus, Search, Star, Users, Trash2, FolderOpen, FileText,
  MoreHorizontal, ChevronDown, ChevronRight, FolderPlus, Pencil, Heart,
  X, Copy, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { Note, NoteFolder } from '@/types/notes';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type SidebarFilter = 'all' | 'favorites' | 'shared' | 'trash';

export interface NotesSidebarProps {
  notes: Note[];
  sharedNotes: Note[];
  folders: NoteFolder[];
  activeNoteId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectNote: (noteId: string) => void;
  onCreateNote: (folderId?: string) => void;
  onDeleteNote: (noteId: string) => void;
  onRenameNote?: (noteId: string, title: string) => void;
  onRestoreNote?: (noteId: string) => void;
  onDuplicateNote?: (noteId: string) => void;
  onCreateFolder: (name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onMoveNote: (noteId: string, folderId: string | null) => void;
  onToggleFavorite: (noteId: string, favorited: boolean) => void;
  onBack: () => void;
  trashedCount?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  venue: 'bg-blue-500/20 text-blue-300',
  catering: 'bg-orange-500/20 text-orange-300',
  decor: 'bg-pink-500/20 text-pink-300',
  attire: 'bg-purple-500/20 text-purple-300',
  guest_list: 'bg-green-500/20 text-green-300',
  ceremony: 'bg-yellow-500/20 text-yellow-300',
  reception: 'bg-red-500/20 text-red-300',
  honeymoon: 'bg-cyan-500/20 text-cyan-300',
  budget: 'bg-emerald-500/20 text-emerald-300',
  vendor: 'bg-indigo-500/20 text-indigo-300',
  general: 'bg-white/10 text-white/50',
};

const timeAgo = (date: Date | { toDate: () => Date } | null | undefined): string => {
  if (!date) return 'just now';
  const d = typeof (date as any).toDate === 'function' ? (date as any).toDate() : date;
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** Highlight matching substrings with <mark> */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/30 text-white rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const NotesSidebar: React.FC<NotesSidebarProps> = ({
  notes, sharedNotes, folders, activeNoteId, searchQuery,
  onSearchChange, onSelectNote, onCreateNote, onDeleteNote,
  onRenameNote, onRestoreNote, onDuplicateNote,
  onCreateFolder, onDeleteFolder, onRenameFolder, onMoveNote,
  onToggleFavorite, onBack, trashedCount,
}) => {
  const [activeFilter, setActiveFilter] = useState<SidebarFilter>('all');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');
  const [renamingNoteId, setRenamingNoteId] = useState<string | null>(null);
  const [renameNoteValue, setRenameNoteValue] = useState('');

  const toggleFolderCollapse = (folderId: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });
  };

  const submitNewFolder = () => {
    const trimmed = newFolderName.trim();
    if (trimmed) onCreateFolder(trimmed);
    setNewFolderName('');
    setCreatingFolder(false);
  };

  const submitRenameFolder = (folderId: string) => {
    const trimmed = renameFolderValue.trim();
    if (trimmed) onRenameFolder(folderId, trimmed);
    setRenamingFolderId(null);
  };

  const submitRenameNote = (noteId: string) => {
    const trimmed = renameNoteValue.trim();
    if (trimmed && onRenameNote) onRenameNote(noteId, trimmed);
    setRenamingNoteId(null);
    setRenameNoteValue('');
  };

  const beginRenameNote = (note: Note) => {
    setRenamingNoteId(note.id);
    setRenameNoteValue(note.title || '');
  };

  // ── Filtered notes ──────────────────────────────────────────────────────────
  const displayNotes = useMemo(() => {
    let filtered: Note[];
    switch (activeFilter) {
      case 'favorites':
        filtered = notes.filter(n => n.favorited && !n.isDeleted);
        break;
      case 'shared':
        filtered = sharedNotes;
        break;
      case 'trash':
        filtered = notes.filter(n => n.isDeleted);
        break;
      default:
        filtered = notes.filter(n => !n.isDeleted);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(n => n.title.toLowerCase().includes(q));
    }
    return filtered;
  }, [notes, sharedNotes, activeFilter, searchQuery]);

  const notesByFolder = useMemo(() => {
    const map: Record<string, Note[]> = {};
    const unfiled: Note[] = [];
    displayNotes.forEach(n => {
      if (n.folderId) {
        (map[n.folderId] ??= []).push(n);
      } else {
        unfiled.push(n);
      }
    });
    return { map, unfiled };
  }, [displayNotes]);

  const isTrashView = activeFilter === 'trash';

  // ── Note item renderer ────────────────────────────────────────────────────
  const isSharedView = activeFilter === 'shared';

  const renderNoteItem = (note: Note) => (
    <div
      key={note.id}
      className={`group relative rounded-xl sm:rounded-lg transition-all duration-200 ${
        activeNoteId === note.id
          ? 'bg-primary/15 sm:border-l-2 sm:border-primary'
          : 'hover:bg-white/[0.06] active:bg-white/[0.08] sm:border-l-2 sm:border-transparent'
      }`}
    >
      {renamingNoteId === note.id ? (
        <div className="flex items-center gap-2.5 sm:gap-2 px-3 sm:px-2 py-2.5 sm:py-1.5">
          <span className="text-base sm:text-sm flex-shrink-0">{note.icon || '📝'}</span>
          <input
            autoFocus
            onFocus={e => e.currentTarget.select()}
            value={renameNoteValue}
            onChange={e => setRenameNoteValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submitRenameNote(note.id);
              if (e.key === 'Escape') { setRenamingNoteId(null); setRenameNoteValue(''); }
            }}
            onBlur={() => submitRenameNote(note.id)}
            className="flex-1 min-w-0 text-sm sm:text-xs px-2 py-1 rounded-lg bg-white/[0.08] border border-primary/40 outline-none focus:ring-1 focus:ring-primary/30 text-white/90"
          />
        </div>
      ) : (
      <>
      <button
        type="button"
        onClick={() => onSelectNote(note.id)}
        className="w-full text-left flex items-start gap-2.5 sm:gap-2 pl-3 sm:pl-2 pr-10 sm:pr-2 py-2.5 sm:py-1.5 rounded-xl sm:rounded-lg cursor-pointer"
      >
      <span className="text-base sm:text-sm mt-0.5 flex-shrink-0">{note.icon || '📝'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm sm:text-xs text-white/90 sm:text-white/80 truncate font-medium">
          {searchQuery
            ? highlightMatch(note.title || 'Untitled', searchQuery)
            : (note.title || 'Untitled')}
        </p>
        <div className="flex items-center gap-1.5 mt-1 sm:mt-0.5">
          <Badge className={`text-[9px] sm:text-[8px] px-1.5 sm:px-1 py-0 h-4 sm:h-3.5 border-0 ${CATEGORY_COLORS[note.category || 'general'] || CATEGORY_COLORS.general}`}>
            {(note.category || 'general').replace('_', ' ')}
          </Badge>
          <span className="text-[10px] sm:text-[9px] text-white/40 sm:text-white/30">{timeAgo(note.updatedAt)}</span>
        </div>

        {/* Sharing info for "Shared with Me" view */}
        {isSharedView && (
          <div className="mt-1 space-y-0.5">
            <p className="text-[9px] text-white/40 truncate">
              <span className="text-white/55">Owner:</span> {note.ownerEmail}
            </p>
            {note.collaborators?.length > 1 && (
              <p className="text-[9px] text-white/35 truncate">
                <Users className="inline h-2.5 w-2.5 mr-0.5 -mt-px" />
                {note.collaborators.map(c => c.name || c.email.split('@')[0]).join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
      {note.favorited && !isSharedView && <Star className="h-3 w-3 text-primary/60 flex-shrink-0 mt-1 fill-primary/60" />}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="absolute right-1 top-1/2 -translate-y-1/2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-2 sm:p-1 rounded-lg sm:rounded hover:bg-white/10 active:bg-white/15 transition-opacity text-white/60 sm:text-white/50 z-10"
            onClick={e => e.stopPropagation()}
            aria-label="Note actions"
          >
            <MoreHorizontal className="h-4 w-4 sm:h-3 sm:w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-44 bg-[#1a1a1a]/95 backdrop-blur-sm border-white/10 text-white/80" align="end">
          {/* Folder move options (only when not in trash) */}
          {!isTrashView && folders.length > 0 && (
            <>
              {folders.map(f => (
                <DropdownMenuItem
                  key={f.id}
                  className="cursor-pointer text-xs"
                  onClick={() => onMoveNote(note.id, f.id)}
                >
                  <FolderOpen className="mr-2 h-3.5 w-3.5" />
                  Move to {f.name}
                </DropdownMenuItem>
              ))}
              {note.folderId && (
                <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => onMoveNote(note.id, null)}>
                  <FolderOpen className="mr-2 h-3.5 w-3.5" />
                  Remove from folder
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}

          {/* Favorite (not in trash) */}
          {!isTrashView && (
            <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => onToggleFavorite(note.id, !note.favorited)}>
              <Heart className={`mr-2 h-3.5 w-3.5 ${note.favorited ? 'fill-primary text-primary' : ''}`} />
              {note.favorited ? 'Unfavorite' : 'Favorite'}
            </DropdownMenuItem>
          )}

          {/* Rename (not in trash) */}
          {!isTrashView && onRenameNote && (
            <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => beginRenameNote(note)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
          )}

          {/* Duplicate (not in trash) */}
          {!isTrashView && onDuplicateNote && (
            <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => onDuplicateNote(note.id)}>
              <Copy className="mr-2 h-3.5 w-3.5" />
              Duplicate
            </DropdownMenuItem>
          )}

          {/* Restore (trash only) */}
          {isTrashView && onRestoreNote && (
            <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => onRestoreNote(note.id)}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Restore
            </DropdownMenuItem>
          )}

          {/* Delete / permanent delete */}
          <DropdownMenuItem className="cursor-pointer text-xs text-red-500 focus:text-red-500" onClick={() => onDeleteNote(note.id)}>
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            {isTrashView ? 'Delete permanently' : 'Move to trash'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </>
      )}
    </div>
  );

  // ── Filter buttons ──────────────────────────────────────────────────────────
  const allNotesCount = notes.filter(n => !n.isDeleted).length;
  const favoritesCount = notes.filter(n => n.favorited && !n.isDeleted).length;
  const trashCount = trashedCount ?? notes.filter(n => n.isDeleted).length;

  const filterButtons: { key: SidebarFilter; icon: React.ElementType; label: string; mobileLabel: string; count: number }[] = [
    { key: 'all', icon: FileText, label: 'All Notes', mobileLabel: 'All', count: allNotesCount },
    { key: 'favorites', icon: Star, label: 'Favorites', mobileLabel: 'Favorites', count: favoritesCount },
    { key: 'shared', icon: Users, label: 'Shared with Me', mobileLabel: 'Shared', count: sharedNotes.length },
    // { key: 'trash', icon: Trash2, label: 'Trash', count: trashCount },
  ];

  return (
    <div className="w-full sm:w-64 flex-shrink-0 bg-black/40 backdrop-blur-md sm:border-r border-white/10 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1 sm:pb-1 flex-shrink-0 gap-2">
        <Button onClick={onBack} variant="ghost" className="h-9 w-9 sm:h-8 sm:w-8 rounded-full hover:bg-white/10 text-white/70 flex-shrink-0" title="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="sm:hidden flex-1 text-base font-headline text-white/90 text-center truncate">Notes</h2>
        <Button onClick={() => onCreateNote()} variant="ghost" className="h-9 sm:h-8 gap-1.5 rounded-lg hover:bg-white/10 text-white/70 sm:text-white/60 text-xs px-2.5 flex-shrink-0" title="New note">
          <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          <span>New</span>
        </Button>
      </div>

      {/* Search */}
      <div className="relative px-3 pb-2 pt-1 sm:pt-0">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-3 sm:w-3 text-white/40" />
        <Input
          placeholder="Search notes..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-9 bg-white/[0.06] border-white/10 rounded-xl text-sm text-white/90 placeholder-white/35 h-10 sm:h-8"
        />
      </div>

      {/* Filters — mobile: horizontal scrollable pills (top slider). Desktop: vertical stack. */}
      <div className="sm:hidden px-3 pb-2 flex-shrink-0 overflow-hidden">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1 snap-x">
          {filterButtons.map(({ key, icon: Icon, mobileLabel, count }) => {
            const isActive = activeFilter === key;
            return (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                className={`snap-start flex items-center gap-1 flex-shrink-0 px-2.5 py-1.5 rounded-full border text-xs transition-all duration-200 ${
                  isActive
                    ? 'bg-primary/15 border-primary/40 text-[#C6944A] font-medium'
                    : 'bg-white/[0.04] border-white/[0.08] text-white/55 active:bg-white/[0.08]'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? 'text-[#C6944A]' : 'text-white/45'}`} />
                <span className="whitespace-nowrap">{mobileLabel}</span>
                {count > 0 && (
                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-medium ${
                    isActive ? 'bg-primary/25 text-white' : 'bg-white/[0.08] text-white/45'
                  }`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="hidden sm:block px-3 pb-2 space-y-0.5 flex-shrink-0">
        {filterButtons.map(({ key, icon: Icon, label, count }) => {
          const isActive = activeFilter === key;
          return (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-all duration-200 text-xs ${
                isActive
                  ? 'bg-white/[0.1] text-[#A17A63] font-medium'
                  : 'text-white/45 hover:text-white/70 hover:bg-white/[0.04]'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? 'text-[#A17A63]' : 'text-white/35'}`} />
              <span className="flex-1 text-left">{label}</span>
              {count > 0 && (
                <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-medium ${
                  isActive ? 'bg-white/20 text-white' : 'bg-white/[0.06] text-white/30'
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="border-t border-white/[0.06] mx-3" />

      {/* Notes list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 py-2 space-y-1">
          {/* Empty states */}
          {displayNotes.length === 0 && (
            <div className="text-center py-8 px-2">
              <p className="text-xs text-white/30 italic">
                {activeFilter === 'favorites' && 'No favorite notes yet.'}
                {activeFilter === 'shared' && 'No notes shared with you.'}
                {activeFilter === 'trash' && 'Trash is empty.'}
                {activeFilter === 'all' && (searchQuery ? `No notes matching "${searchQuery}"` : 'No notes yet. Create one to get started!')}
              </p>
            </div>
          )}

          {/* Folders + their notes */}
          {activeFilter === 'all' && folders.map(folder => {
            const folderNotes = notesByFolder.map[folder.id] || [];
            const isCollapsed = collapsedFolders.has(folder.id);
            return (
              <Collapsible key={folder.id} open={!isCollapsed} onOpenChange={() => toggleFolderCollapse(folder.id)}>
                <div className="group flex items-center gap-1 rounded-lg hover:bg-white/[0.04] pr-1">
                  <CollapsibleTrigger className="flex-1 flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-white/50 hover:text-white/70">
                    {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    <FolderOpen className="h-3.5 w-3.5 text-primary/50" />
                    {renamingFolderId === folder.id ? (
                      <input
                        autoFocus
                        value={renameFolderValue}
                        onChange={e => setRenameFolderValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') submitRenameFolder(folder.id);
                          if (e.key === 'Escape') setRenamingFolderId(null);
                        }}
                        onBlur={() => submitRenameFolder(folder.id)}
                        onClick={e => e.stopPropagation()}
                        className="flex-1 text-xs px-1 py-0 bg-white/[0.06] border border-primary/20 outline-none focus:ring-1 focus:ring-primary/30 rounded text-white/90"
                      />
                    ) : (
                      <span className="truncate">{folder.name}</span>
                    )}
                    <span className="text-[10px] text-white/25 ml-auto mr-1">{folderNotes.length}</span>
                  </CollapsibleTrigger>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 transition-opacity text-white/50">
                        <MoreHorizontal className="h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-36 bg-[#1a1a1a]/95 backdrop-blur-sm border-white/10 text-white/80" align="end">
                      <DropdownMenuItem
                        className="cursor-pointer text-xs"
                        onClick={() => { setRenamingFolderId(folder.id); setRenameFolderValue(folder.name); }}
                      >
                        <Pencil className="mr-2 h-3.5 w-3.5" />Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer text-xs"
                        onClick={() => onCreateNote(folder.id)}
                      >
                        <Plus className="mr-2 h-3.5 w-3.5" />Add note
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="cursor-pointer text-xs text-red-500 focus:text-red-500"
                        onClick={() => onDeleteFolder(folder.id)}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CollapsibleContent className="pl-4 space-y-0.5 animate-in fade-in duration-200">
                  {folderNotes.map(note => renderNoteItem(note))}
                </CollapsibleContent>
              </Collapsible>
            );
          })}

          {/* Unfiled notes */}
          {activeFilter === 'all' && notesByFolder.unfiled.length > 0 && (
            <div>
              {folders.length > 0 && (
                <h3 className="uppercase tracking-[0.12em] text-[10px] text-white/30 mb-1 px-2 font-semibold mt-2">
                  Unfiled
                </h3>
              )}
              <div className="space-y-0.5">
                {notesByFolder.unfiled.map(note => renderNoteItem(note))}
              </div>
            </div>
          )}

          {/* Non-"all" filter: flat list */}
          {activeFilter !== 'all' && displayNotes.map(note => renderNoteItem(note))}
        </div>
      </ScrollArea>

      {/* New Folder button */}
      <div className="flex-shrink-0 border-t border-white/[0.06] px-3 py-2">
        {creatingFolder ? (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              placeholder="Folder name..."
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submitNewFolder();
                if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); }
              }}
              className="h-7 text-xs bg-white/[0.06] border-white/10 text-white/90 placeholder-white/35 rounded-lg flex-1"
            />
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/40 hover:text-white/70" onClick={() => { setCreatingFolder(false); setNewFolderName(''); }}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setCreatingFolder(true)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-white/35 hover:text-white/60 hover:bg-white/[0.04] transition-all"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New Folder
          </button>
        )}
      </div>
    </div>
  );
};

export default NotesSidebar;
