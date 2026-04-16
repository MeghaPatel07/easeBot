import React, { useState, useRef, useEffect } from 'react';
import {
  Star, Share2, MoreHorizontal, Trash2, Heart, Download,
  Loader2, Check, Eye, Save, Undo2, Redo2, Copy, Scissors, ClipboardPaste,
  MessageSquare, Keyboard, ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { Note, NoteCategory } from '@/types/notes';
import type { Editor } from '@tiptap/react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface NoteHeaderProps {
  note: Note | null;
  onUpdateTitle: (title: string) => void;
  onUpdateIcon: (icon: string) => void;
  onUpdateCategory: (category: NoteCategory) => void;
  onToggleFavorite: () => void;
  onShare: () => void;
  onDelete: () => void;
  onSave: () => void;
  isSaving: boolean;
  lastSavedAt: Date | null;
  hasUnsavedChanges: boolean;
  readOnly?: boolean;
  wordCount?: number;
  editor?: Editor | null;
  onToggleComments?: () => void;
  commentsCount?: number;
  /** Mobile back-to-list handler. Shown as a left-aligned arrow button on <640px. */
  onBack?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const WEDDING_EMOJIS = [
  '💒', '💍', '🎂', '🌸', '🎭', '🎪', '📋', '✨', '💐', '🕊️',
  '🎵', '🍾', '🥂', '🎊', '🎉', '📸', '🏛️', '🚗', '✈️', '🌴',
  '💌', '📝', '🎀', '🌹', '💎', '👗', '🤵', '👰', '🎁', '🪷',
];

const CATEGORIES: { value: NoteCategory; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'venue', label: 'Venue' },
  { value: 'catering', label: 'Catering' },
  { value: 'decor', label: 'Decor' },
  { value: 'attire', label: 'Attire' },
  { value: 'guest_list', label: 'Guest List' },
  { value: 'ceremony', label: 'Ceremony' },
  { value: 'reception', label: 'Reception' },
  { value: 'honeymoon', label: 'Honeymoon' },
  { value: 'budget', label: 'Budget' },
  { value: 'vendor', label: 'Vendor' },
];

const formatTime = (d: Date) =>
  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
const modKey = isMac ? '⌘' : 'Ctrl';

const KEYBOARD_SHORTCUTS = [
  { keys: `${modKey}+S`, description: 'Save' },
  { keys: `${modKey}+Z`, description: 'Undo' },
  { keys: `${modKey}+Shift+Z`, description: 'Redo' },
  { keys: `${modKey}+B`, description: 'Bold' },
  { keys: `${modKey}+I`, description: 'Italic' },
  { keys: `${modKey}+U`, description: 'Underline' },
  { keys: `${modKey}+E`, description: 'Code' },
  { keys: `${modKey}+Shift+X`, description: 'Strikethrough' },
  { keys: '/', description: 'Slash commands' },
  { keys: `${modKey}+C`, description: 'Copy' },
  { keys: `${modKey}+X`, description: 'Cut' },
  { keys: `${modKey}+V`, description: 'Paste' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const NoteHeader: React.FC<NoteHeaderProps> = ({
  note, onUpdateTitle, onUpdateIcon, onUpdateCategory,
  onToggleFavorite, onShare, onDelete, onSave,
  isSaving, lastSavedAt, hasUnsavedChanges, readOnly, wordCount, editor,
  onToggleComments, commentsCount, onBack,
}) => {
  const [titleValue, setTitleValue] = useState(note?.title || '');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitleValue(note?.title || '');
  }, [note?.id, note?.title]);

  const handleTitleBlur = () => {
    const trimmed = titleValue.trim();
    if (trimmed !== note?.title) onUpdateTitle(trimmed || 'Untitled');
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleRef.current?.blur();
    }
  };

  if (!note) {
    return (
      <div className="flex items-center justify-center h-14 border-b border-white/[0.06] px-4">
        <p className="text-sm text-white/30 italic">Select or create a note</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1 sm:gap-1.5 h-12 sm:h-14 border-b border-white/[0.06] px-2 sm:px-4 flex-shrink-0">
        {/* Mobile-only back-to-list button */}
        {onBack && (
          <button
            onClick={onBack}
            className="sm:hidden h-9 w-9 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
            title="Back to notes"
            aria-label="Back to notes list"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        {/* Icon picker */}
        {!readOnly ? (
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-xl hover:bg-white/10 rounded-lg p-1 transition-colors flex-shrink-0" title="Change icon">
                {note.icon || '📝'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 bg-[#1a1a1a]/95 backdrop-blur-md border-white/10 p-3" align="start">
              <p className="text-xs text-white/50 mb-2 font-medium">Pick an icon</p>
              <div className="grid grid-cols-6 gap-1">
                {WEDDING_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => onUpdateIcon(emoji)}
                    className="text-lg p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <span className="text-xl p-1 flex-shrink-0">{note.icon || '📝'}</span>
        )}

        {/* Title */}
        {readOnly ? (
          <h1 className="text-xl font-headline text-white flex-1 truncate">{note.title || 'Untitled'}</h1>
        ) : (
          <input
            ref={titleRef}
            value={titleValue}
            onChange={e => setTitleValue(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            placeholder="Untitled"
            className="flex-1 text-xl font-headline text-white bg-transparent border-none outline-none placeholder-white/25 min-w-0"
          />
        )}

        {/* Read-only badge */}
        {readOnly && (
          <Badge className="bg-white/10 text-white/50 border-white/10 text-[10px] gap-1">
            <Eye className="h-3 w-3" />
            View only
          </Badge>
        )}

        {/* ── Edit actions: Undo, Redo, Copy, Cut, Paste ─────────────────────── */}
        {/* Hidden on mobile — these duplicate the OS keyboard / soft-menu actions
            and eat precious header space on a 375px viewport. */}
        {!readOnly && editor && (
          <div className="hidden sm:flex items-center gap-0.5 border-r border-white/10 pr-2 mr-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().undo().run()}
                  disabled={!editor.can().undo()}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-black/90 border-white/10 text-xs text-white">
                Undo <span className="text-white/40 ml-1">{modKey}+Z</span>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().redo().run()}
                  disabled={!editor.can().redo()}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-black/90 border-white/10 text-xs text-white">
                Redo <span className="text-white/40 ml-1">{modKey}+Shift+Z</span>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const { from, to } = editor.state.selection;
                      if (from === to) return;
                      const text = editor.state.doc.textBetween(from, to);
                      navigator.clipboard.writeText(text);
                    } catch (err) {
                      console.error('Copy failed:', err);
                    }
                  }}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-black/90 border-white/10 text-xs text-white">
                Copy <span className="text-white/40 ml-1">{modKey}+C</span>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const { from, to } = editor.state.selection;
                      if (from === to) return;
                      const text = editor.state.doc.textBetween(from, to);
                      navigator.clipboard.writeText(text).then(() => {
                        editor.chain().focus().deleteSelection().run();
                      });
                    } catch (err) {
                      console.error('Cut failed:', err);
                    }
                  }}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Scissors className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-black/90 border-white/10 text-xs text-white">
                Cut <span className="text-white/40 ml-1">{modKey}+X</span>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      navigator.clipboard.readText().then((text) => {
                        editor.chain().focus().insertContent(text).run();
                      });
                    } catch (err) {
                      console.error('Paste failed:', err);
                    }
                  }}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-black/90 border-white/10 text-xs text-white">
                Paste <span className="text-white/40 ml-1">{modKey}+V</span>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Category selector */}
        {!readOnly && (
          <Select value={note.category} onValueChange={(v) => onUpdateCategory(v as NoteCategory)}>
            <SelectTrigger className="w-28 h-8 text-xs bg-white/[0.06] border-white/10 text-white/70 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a1a]/95 backdrop-blur-md border-white/10 text-white/80">
              {CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value} className="text-xs cursor-pointer">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* ── Save status + Save button ──────────────────────────────────────── */}
        {!readOnly && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isSaving ? (
              <div className="flex items-center gap-1 text-[10px] text-white/30">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Saving...</span>
              </div>
            ) : hasUnsavedChanges ? (
              <div className="flex items-center gap-1 text-[10px] text-amber-400/80">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span>Unsaved</span>
              </div>
            ) : lastSavedAt ? (
              <div className="flex items-center gap-1 text-[10px] text-green-400/60">
                <Check className="h-3 w-3" />
                <span>Saved {formatTime(lastSavedAt)}</span>
              </div>
            ) : null}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onSave}
                  disabled={isSaving || !hasUnsavedChanges}
                  size="sm"
                  className={`h-7 gap-1 rounded-md text-[11px] px-2.5 transition-all ${
                    hasUnsavedChanges
                      ? 'bg-primary/90 hover:bg-primary text-white shadow-sm shadow-primary/20'
                      : 'bg-white/[0.06] text-white/30 border border-white/[0.06]'
                  }`}
                >
                  <Save className="h-3 w-3" />
                  Save
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-black/90 border-white/10 text-xs text-white">
                Save <span className="text-white/40 ml-1">{modKey}+S</span>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Word count */}
        {wordCount !== undefined && (
          <span className="text-[10px] text-white/20 flex-shrink-0 hidden md:block">
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
          </span>
        )}

        {/* Comments toggle button */}
        {onToggleComments && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onToggleComments}
                variant="ghost"
                className="h-8 w-8 rounded-lg hover:bg-white/10 text-white/50 p-0 relative"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {(commentsCount ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-primary text-[9px] text-white flex items-center justify-center font-medium px-1">
                    {commentsCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-black/90 border-white/10 text-xs text-white">
              Comments
            </TooltipContent>
          </Tooltip>
        )}

        {/* Share button */}
        {!readOnly && (
          <Button
            onClick={onShare}
            variant="outline"
            className="h-8 gap-1.5 rounded-lg border-primary/30 text-primary hover:bg-primary/10 text-xs px-3"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Share</span>
          </Button>
        )}

        {/* More menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 rounded-lg hover:bg-white/10 text-white/50 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 bg-[#1a1a1a]/95 backdrop-blur-sm border-white/10 text-white/80" align="end">
            <DropdownMenuItem className="cursor-pointer text-xs" onClick={onToggleFavorite}>
              <Heart className={`mr-2 h-3.5 w-3.5 ${note.favorited ? 'fill-primary text-primary' : ''}`} />
              {note.favorited ? 'Unfavorite' : 'Favorite'}
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => {
              // Extract plain text from Tiptap JSON content
              let plainText = '';
              try {
                const doc = JSON.parse(note.content);
                const extractText = (node: Record<string, unknown>): string => {
                  if (node.text) return node.text as string;
                  if (node.content && Array.isArray(node.content)) {
                    return (node.content as Record<string, unknown>[])
                      .map((child) => extractText(child))
                      .join(node.type === 'doc' || node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'taskList' ? '\n' : '');
                  }
                  return '';
                };
                plainText = extractText(doc);
              } catch {
                // Fallback: if content is not JSON, use as-is
                plainText = note.content;
              }
              const blob = new Blob([note.title + '\n\n' + plainText], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${note.title || 'note'}.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }}>
              <Download className="mr-2 h-3.5 w-3.5" />
              Export as text
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => setShowShortcuts(true)}>
              <Keyboard className="mr-2 h-3.5 w-3.5" />
              Keyboard shortcuts
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-xs text-red-500 focus:text-red-500" onClick={onDelete}>
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Keyboard shortcuts dialog */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="bg-[#0F0D0C]/90 backdrop-blur-2xl border border-white/[0.08] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.05)] text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-headline flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-primary" />
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 mt-2">
            {KEYBOARD_SHORTCUTS.map(({ keys, description }) => (
              <div key={keys} className="flex items-center justify-between py-1.5 px-1">
                <span className="text-xs text-white/70">{description}</span>
                <kbd className="text-[10px] bg-white/10 border border-white/10 rounded px-1.5 py-0.5 font-mono text-white/50">
                  {keys}
                </kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default NoteHeader;
