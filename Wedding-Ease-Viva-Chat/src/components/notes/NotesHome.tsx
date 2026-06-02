import React, { useMemo, useState } from 'react';
import {
  Plus, Layout, Search, Star, Clock, Users, FileText,
  MoreHorizontal, Heart, Pencil, Copy, Trash2, Share2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Note } from '@/types/notes';
import { CATEGORY_COLORS, timeAgo, toMillis } from './noteDisplay';

interface NotesHomeProps {
  /** Owned notes (may include trashed — filtered out here). */
  notes: Note[];
  /** Notes shared with the current user. */
  sharedNotes: Note[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectNote: (noteId: string) => void;
  onCreateNote: () => void;
  onCreateFromTemplate: () => void;
  // Per-note actions (owned notes only).
  onToggleFavorite: (noteId: string, favorited: boolean) => void;
  onRenameNote: (noteId: string, title: string) => void;
  onDuplicateNote: (noteId: string) => void;
  onDeleteNote: (noteId: string) => void;
  onShareNote: (noteId: string) => void;
}

/** First ~140 chars of the note body, for a card preview. */
function previewOf(note: Note): string {
  const t = (note.searchableText || '').replace(/\s+/g, ' ').trim();
  return t.length > 140 ? `${t.slice(0, 140).trimEnd()}…` : t;
}

interface NoteCardProps {
  note: Note;
  onSelect: (id: string) => void;
  shared?: boolean;
  onToggleFavorite?: (noteId: string, favorited: boolean) => void;
  onRename?: (noteId: string, title: string) => void;
  onDuplicate?: (noteId: string) => void;
  onDelete?: (noteId: string) => void;
  onShare?: (noteId: string) => void;
}

const NoteCard: React.FC<NoteCardProps> = ({
  note, onSelect, shared = false,
  onToggleFavorite, onRename, onDuplicate, onDelete, onShare,
}) => {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(note.title || '');
  const preview = previewOf(note);
  // Actions only make sense for notes the user owns.
  const hasActions = !shared && !!(onToggleFavorite || onRename || onDuplicate || onDelete || onShare);

  const beginRename = () => {
    setRenameValue(note.title || '');
    setRenaming(true);
  };
  const submitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && onRename) onRename(note.id, trimmed);
    setRenaming(false);
  };

  return (
    <div className="group relative flex flex-col rounded-2xl bg-card border border-border/60 hover:border-primary/40 shadow-card hover:shadow-dropdown transition-all duration-200 overflow-hidden min-h-[148px]">
      {renaming ? (
        <div className="flex items-start gap-2 p-4">
          <span className="text-2xl leading-none flex-shrink-0">{note.icon || '📝'}</span>
          <input
            autoFocus
            onFocus={e => e.currentTarget.select()}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            onBlur={submitRename}
            className="flex-1 min-w-0 text-sm px-2 py-1 rounded-lg bg-foreground/[0.08] border border-primary/40 outline-none focus:ring-1 focus:ring-primary/30 text-foreground/90"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onSelect(note.id)}
          className="flex flex-1 flex-col text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-2xl"
        >
          {note.coverImage && (
            <div className="h-16 w-full flex-shrink-0 overflow-hidden">
              <img src={note.coverImage} alt="" className="h-full w-full object-cover" />
            </div>
          )}
          <div className="flex flex-1 flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="text-2xl leading-none">{note.icon || '📝'}</span>
              {note.favorited && (
                <Star className="h-3.5 w-3.5 flex-shrink-0 text-primary/70 fill-primary/70 mt-1 mr-6" />
              )}
            </div>
            <h3 className="text-sm font-semibold text-foreground/90 line-clamp-1">
              {note.title || 'Untitled'}
            </h3>
            {preview && (
              <p className="text-xs text-foreground/45 line-clamp-2 flex-1">{preview}</p>
            )}
            <div className="flex items-center gap-1.5 mt-auto pt-1">
              <Badge
                className={`text-[9px] px-1.5 py-0 h-4 border-0 ${CATEGORY_COLORS[note.category || 'general'] || CATEGORY_COLORS.general}`}
              >
                {(note.category || 'general').replace('_', ' ')}
              </Badge>
              {shared && note.ownerEmail && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-foreground/35 truncate max-w-[7rem]">
                  <Users className="h-2.5 w-2.5 flex-shrink-0" />
                  {note.ownerEmail.split('@')[0]}
                </span>
              )}
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-foreground/35 flex-shrink-0">
                <Clock className="h-2.5 w-2.5" />
                {timeAgo(note.updatedAt)}
              </span>
            </div>
          </div>
        </button>
      )}

      {/* Per-note actions — sibling of the open button (not nested) so we don't
          put a button inside a button. */}
      {hasActions && !renaming && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={e => e.stopPropagation()}
              aria-label="Note actions"
              className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-card/80 backdrop-blur-sm border border-border/50 text-foreground/55 hover:text-foreground/90 hover:bg-foreground/10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-sm"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-44 bg-surface-popover-alt/95 backdrop-blur-sm border-foreground/10 text-foreground/80"
          >
            {onToggleFavorite && (
              <DropdownMenuItem
                className="cursor-pointer text-xs"
                onClick={() => onToggleFavorite(note.id, !note.favorited)}
              >
                <Heart className={`mr-2 h-3.5 w-3.5 ${note.favorited ? 'fill-primary text-primary' : ''}`} />
                {note.favorited ? 'Unfavorite' : 'Favorite'}
              </DropdownMenuItem>
            )}
            {onRename && (
              <DropdownMenuItem className="cursor-pointer text-xs" onClick={beginRename}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Rename
              </DropdownMenuItem>
            )}
            {onDuplicate && (
              <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => onDuplicate(note.id)}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Duplicate
              </DropdownMenuItem>
            )}
            {onShare && (
              <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => onShare(note.id)}>
                <Share2 className="mr-2 h-3.5 w-3.5" />
                Share
              </DropdownMenuItem>
            )}
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-xs text-destructive focus:text-destructive"
                  onClick={() => onDelete(note.id)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Move to trash
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};

const NotesHome: React.FC<NotesHomeProps> = ({
  notes, sharedNotes, searchQuery, onSearchChange,
  onSelectNote, onCreateNote, onCreateFromTemplate,
  onToggleFavorite, onRenameNote, onDuplicateNote, onDeleteNote, onShareNote,
}) => {
  const q = searchQuery.trim().toLowerCase();
  const matches = (n: Note) =>
    !q ||
    (n.title || '').toLowerCase().includes(q) ||
    (n.searchableText || '').toLowerCase().includes(q);

  const owned = useMemo(
    () => notes.filter(n => !n.isDeleted && matches(n)).sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt)),
    [notes, q],
  );
  const shared = useMemo(
    () => sharedNotes.filter(matches).sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt)),
    [sharedNotes, q],
  );

  const totalOwned = notes.filter(n => !n.isDeleted).length;
  const nothingMatches = q && owned.length === 0 && shared.length === 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Home header — title, count, search, create actions */}
      <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 pt-4 pb-3 border-b border-border/40">
        <div className="min-w-0">
          <h2 className="text-lg font-headline text-foreground/90 leading-tight">Your notes</h2>
          <p className="text-xs text-foreground/40">
            {totalOwned} {totalOwned === 1 ? 'note' : 'notes'}
            {sharedNotes.length > 0 && ` · ${sharedNotes.length} shared with you`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/40" />
            <Input
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Search notes..."
              className="pl-8 h-9 w-40 sm:w-52 bg-foreground/[0.06] [.light_&]:bg-background border-foreground/10 [.light_&]:border-border rounded-xl text-sm text-foreground/90 placeholder-foreground/35"
            />
          </div>
          <Button
            onClick={onCreateNote}
            className="h-9 gap-1.5 bg-primary text-primary-foreground hover:bg-primary-hover text-xs px-3 rounded-xl shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New note</span>
          </Button>
          <Button
            onClick={onCreateFromTemplate}
            variant="ghost"
            className="h-9 gap-1.5 text-foreground/60 hover:text-foreground text-xs px-3 rounded-xl"
          >
            <Layout className="h-4 w-4" />
            <span className="hidden sm:inline">Template</span>
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 sm:px-6 py-4 space-y-6">
          {nothingMatches ? (
            <div className="flex flex-col items-center justify-center text-center py-16 gap-2">
              <FileText className="h-12 w-12 text-foreground/10" />
              <p className="text-sm text-foreground/40">No notes matching “{searchQuery}”.</p>
            </div>
          ) : (
            <>
              {owned.length > 0 && (
                <section>
                  {shared.length > 0 && (
                    <h3 className="uppercase tracking-[0.12em] text-[10px] text-foreground/30 mb-2 px-0.5 font-semibold">
                      My notes
                    </h3>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {owned.map(note => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        onSelect={onSelectNote}
                        onToggleFavorite={onToggleFavorite}
                        onRename={onRenameNote}
                        onDuplicate={onDuplicateNote}
                        onDelete={onDeleteNote}
                        onShare={onShareNote}
                      />
                    ))}
                  </div>
                </section>
              )}

              {shared.length > 0 && (
                <section>
                  <h3 className="uppercase tracking-[0.12em] text-[10px] text-foreground/30 mb-2 px-0.5 font-semibold">
                    Shared with you
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {shared.map(note => (
                      <NoteCard key={note.id} note={note} onSelect={onSelectNote} shared />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default NotesHome;
