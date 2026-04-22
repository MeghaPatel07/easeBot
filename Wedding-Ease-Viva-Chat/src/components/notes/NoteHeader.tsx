import React, { useState, useRef, useEffect } from 'react';
import {
  Star, Share2, MoreHorizontal, Trash2, Heart, FileText, Lock,
  Loader2, Check, Eye, Save, Undo2, Redo2, Copy, Scissors, ClipboardPaste,
  MessageSquare, Keyboard, ArrowLeft, MessageSquarePlus,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useChatAttachments } from '@/contexts/ChatAttachmentsContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  checkExportAccess,
  generateHtmlPdfBlob,
  downloadFile,
} from '@/services/exportService';
import { track } from '@/lib/analytics';
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
  const navigate = useNavigate();
  const { addAttachment } = useChatAttachments();
  const { profile } = useAuth();
  const [isExporting, setIsExporting] = useState(false);

  const handleDownloadPdf = async () => {
    if (!note) return;
    const gate = checkExportAccess(profile, 'pdf');
    if (!gate.allowed) {
      track('data_export_requested', {
        source: 'note',
        source_id: note.id,
        format: 'pdf',
        allowed: false,
        tier: gate.tier,
      });
      toast.error(gate.message ?? 'Upgrade to download notes as PDF.', {
        action: { label: 'Upgrade', onClick: () => navigate('/pricing') },
      });
      return;
    }
    const dom = editor?.view?.dom as HTMLElement | undefined;
    if (!dom) {
      toast.error('Editor not ready — open the note and try again.');
      return;
    }
    setIsExporting(true);
    try {
      const blob = await generateHtmlPdfBlob(dom, note.title || 'Untitled');
      const filename = (note.title || 'note').replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
      downloadFile(blob, `${filename}.pdf`, 'application/pdf');
      track('data_export_requested', {
        source: 'note',
        source_id: note.id,
        format: 'pdf',
        allowed: true,
        tier: gate.tier,
      });
      toast.success('PDF download started');
    } catch (err) {
      console.error('Note PDF export failed:', err);
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // ── "Attach to chat" ─────────────────────────────────────────────────────
  // Stages this note in the ChatAttachmentsContext tray so the user can
  // reference it from their next chat message. ChatInput.tsx (Wave 2, DEV-E)
  // will render a chip above the textarea and serialize the payload into
  // the chat request so the backend can inject the note content into the
  // LLM prompt. Navigating to `/` gets the user to chat immediately.
  const handleAttachToChat = () => {
    if (!note) return;
    // Build a short plain-text preview from the Tiptap JSON (falls back to
    // raw string if parse fails). Keep it short — chips only need a hint.
    let preview = '';
    try {
      const doc = JSON.parse(note.content);
      const extractText = (n: Record<string, unknown>): string => {
        if (n.text) return n.text as string;
        if (Array.isArray(n.content)) {
          return (n.content as Record<string, unknown>[])
            .map(extractText)
            .join(' ');
        }
        return '';
      };
      preview = extractText(doc).trim().slice(0, 200);
    } catch {
      preview = (note.content || '').slice(0, 200);
    }

    addAttachment({
      kind: 'note',
      id: note.id,
      title: note.title || 'Untitled',
      preview,
      payload: { noteId: note.id, content: note.content },
    });
    toast.success('Note attached — ask Viva about it in chat');
    // Fire-and-forget nav to chat. Using replace:false so the user can
    // hit Back to return to the note if they change their mind.
    navigate('/');
  };

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
      <div className="flex items-center justify-center h-14 border-b border-foreground/[0.06] px-4">
        <p className="text-sm text-foreground/30 italic">Select or create a note</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1 sm:gap-1.5 h-12 sm:h-14 border-b border-foreground/[0.06] px-2 sm:px-4 flex-shrink-0">
        {/* Mobile-only back-to-list button */}
        {onBack && (
          <button
            onClick={onBack}
            className="sm:hidden h-9 w-9 flex items-center justify-center rounded-lg text-foreground/60 hover:text-foreground hover:bg-foreground/10 transition-colors flex-shrink-0"
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
              <button className="text-xl hover:bg-foreground/10 rounded-lg p-1 transition-colors flex-shrink-0" title="Change icon">
                {note.icon || '📝'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 bg-surface-popover-alt/95 backdrop-blur-md border-foreground/10 p-3" align="start">
              <p className="text-xs text-foreground/50 mb-2 font-medium">Pick an icon</p>
              <div className="grid grid-cols-6 gap-1">
                {WEDDING_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => onUpdateIcon(emoji)}
                    className="text-lg p-1.5 rounded-lg hover:bg-foreground/10 transition-colors"
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
          <h1 className="text-xl font-headline text-foreground flex-1 truncate">{note.title || 'Untitled'}</h1>
        ) : (
          <input
            ref={titleRef}
            value={titleValue}
            onChange={e => setTitleValue(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            placeholder="Untitled"
            className="flex-1 text-xl font-headline text-foreground bg-transparent border-none outline-none placeholder-foreground/25 min-w-0"
          />
        )}

        {/* Read-only badge */}
        {readOnly && (
          <Badge className="bg-foreground/10 text-foreground/50 border-foreground/10 text-[10px] gap-1">
            <Eye className="h-3 w-3" />
            View only
          </Badge>
        )}

        {/* ── Edit actions: Undo, Redo, Copy, Cut, Paste ─────────────────────── */}
        {/* Hidden on mobile — these duplicate the OS keyboard / soft-menu actions
            and eat precious header space on a 375px viewport. */}
        {!readOnly && editor && (
          <div className="hidden sm:flex items-center gap-0.5 border-r border-foreground/10 pr-2 mr-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().undo().run()}
                  disabled={!editor.can().undo()}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-foreground/50 hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-overlay-scrim/90 border-foreground/10 text-xs text-overlay-text">
                Undo <span className="text-foreground/40 ml-1">{modKey}+Z</span>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().redo().run()}
                  disabled={!editor.can().redo()}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-foreground/50 hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-overlay-scrim/90 border-foreground/10 text-xs text-overlay-text">
                Redo <span className="text-foreground/40 ml-1">{modKey}+Shift+Z</span>
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
                  className="h-7 w-7 flex items-center justify-center rounded-md text-foreground/50 hover:text-foreground hover:bg-foreground/10 transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-overlay-scrim/90 border-foreground/10 text-xs text-overlay-text">
                Copy <span className="text-foreground/40 ml-1">{modKey}+C</span>
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
                  className="h-7 w-7 flex items-center justify-center rounded-md text-foreground/50 hover:text-foreground hover:bg-foreground/10 transition-colors"
                >
                  <Scissors className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-overlay-scrim/90 border-foreground/10 text-xs text-overlay-text">
                Cut <span className="text-foreground/40 ml-1">{modKey}+X</span>
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
                  className="h-7 w-7 flex items-center justify-center rounded-md text-foreground/50 hover:text-foreground hover:bg-foreground/10 transition-colors"
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-overlay-scrim/90 border-foreground/10 text-xs text-overlay-text">
                Paste <span className="text-foreground/40 ml-1">{modKey}+V</span>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Category selector */}
        {!readOnly && (
          <Select value={note.category} onValueChange={(v) => onUpdateCategory(v as NoteCategory)}>
            <SelectTrigger className="w-28 h-8 text-xs bg-foreground/[0.06] border border-foreground/15 text-foreground/80 rounded-lg hover:bg-foreground/10">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="bg-popover text-popover-foreground border-border">
              {CATEGORIES.map(c => (
                <SelectItem
                  key={c.value}
                  value={c.value}
                  className="text-xs cursor-pointer text-popover-foreground focus:bg-primary/15 focus:text-popover-foreground data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary"
                >
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
              <div className="flex items-center gap-1 text-[10px] text-foreground/30">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Saving...</span>
              </div>
            ) : hasUnsavedChanges ? (
              <div className="flex items-center gap-1 text-[10px] text-warning/80">
                <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
                <span>Unsaved</span>
              </div>
            ) : lastSavedAt ? (
              <div className="flex items-center gap-1 text-[10px] text-success/60">
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
                      ? 'bg-primary/90 hover:bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                      : 'bg-foreground/[0.06] text-foreground/30 border border-foreground/[0.06]'
                  }`}
                >
                  <Save className="h-3 w-3" />
                  Save
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-overlay-scrim/90 border-foreground/10 text-xs text-overlay-text">
                Save <span className="text-foreground/40 ml-1">{modKey}+S</span>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Word count */}
        {wordCount !== undefined && (
          <span className="text-[10px] text-foreground/20 flex-shrink-0 hidden md:block">
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
                className="h-8 w-8 rounded-lg hover:bg-foreground/10 text-foreground/50 p-0 relative"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {(commentsCount ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-primary text-[9px] text-primary-foreground flex items-center justify-center font-medium px-1">
                    {commentsCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-overlay-scrim/90 border-foreground/10 text-xs text-overlay-text">
              Comments
            </TooltipContent>
          </Tooltip>
        )}

        {/* Attach to chat — stages the note in ChatAttachmentsContext so
            the user can ask Viva about it. Available to everyone with a
            note loaded (incl. view-only / Free tier — reading a note into
            chat doesn't require edit rights). */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleAttachToChat}
              variant="outline"
              className="h-10 sm:h-8 gap-1.5 rounded-lg border-primary/30 text-primary hover:bg-primary/10 text-xs px-3"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Attach to chat</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-overlay-scrim/90 border-foreground/10 text-xs text-overlay-text">
            Send this note to chat so Viva can read and reference it
          </TooltipContent>
        </Tooltip>

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
            <Button variant="ghost" className="h-8 w-8 rounded-lg hover:bg-foreground/10 text-foreground/50 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 bg-surface-popover-alt/95 backdrop-blur-sm border-foreground/10 text-foreground/80" align="end">
            <DropdownMenuItem className="cursor-pointer text-xs" onClick={onToggleFavorite}>
              <Heart className={`mr-2 h-3.5 w-3.5 ${note.favorited ? 'fill-primary text-primary' : ''}`} />
              {note.favorited ? 'Unfavorite' : 'Favorite'}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer text-xs gap-2"
              disabled={isExporting}
              onSelect={(e) => { e.preventDefault(); void handleDownloadPdf(); }}
            >
              {isExporting
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <FileText className="h-3.5 w-3.5" />}
              <span className="flex-1">Download as PDF</span>
              {!checkExportAccess(profile, 'pdf').allowed && (
                <Lock className="h-3 w-3 text-foreground/40" />
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => setShowShortcuts(true)}>
              <Keyboard className="mr-2 h-3.5 w-3.5" />
              Keyboard shortcuts
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-xs text-destructive focus:text-destructive" onClick={onDelete}>
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Keyboard shortcuts dialog */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="bg-card-elevated/90 backdrop-blur-2xl border border-foreground/[0.08] shadow-modal text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-headline flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-primary" />
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 mt-2">
            {KEYBOARD_SHORTCUTS.map(({ keys, description }) => (
              <div key={keys} className="flex items-center justify-between py-1.5 px-1">
                <span className="text-xs text-foreground/70">{description}</span>
                <kbd className="text-[10px] bg-foreground/10 border border-foreground/10 rounded px-1.5 py-0.5 font-mono text-foreground/50">
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
