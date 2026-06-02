import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FileText, Loader2, AlertCircle, Sparkles, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getNoteByShareId } from '@/services/notesSharingService';
import { subscribeToNote } from '@/services/notesService';
import NoteEditor from '@/components/notes/NoteEditor';
import type { Note } from '@/types/notes';

type PageState = 'loading' | 'not-found' | 'no-access' | 'error' | 'ready';

export default function SharedNote() {
  const { shareId } = useParams<{ shareId: string }>();
  const [note, setNote] = useState<Note | null>(null);
  const [pageState, setPageState] = useState<PageState>('loading');

  useEffect(() => {
    if (!shareId) {
      setPageState('not-found');
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    const init = async () => {
      try {
        // Initial lookup to get the note ID from share ID
        const sharedNote = await getNoteByShareId(shareId);
        if (cancelled) return;

        if (!sharedNote) {
          setPageState('not-found');
          return;
        }

        // Set up real-time subscription using the note ID
        unsubscribe = subscribeToNote(sharedNote.id, (updatedNote) => {
          if (cancelled) return;
          if (!updatedNote) {
            setNote(null);
            setPageState('not-found');
            return;
          }
          if (!updatedNote.publicAccess?.enabled) {
            setNote(updatedNote);
            setPageState('no-access');
            return;
          }
          setNote(updatedNote);
          setPageState('ready');
        });
      } catch {
        if (!cancelled) {
          setPageState('error');
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [shareId]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-[100vh] min-h-[100dvh] flex items-center justify-center bg-surface-note">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto" />
          <p className="text-sm text-foreground/50">Loading shared note...</p>
        </div>
      </div>
    );
  }

  // ── Not found state ────────────────────────────────────────────────────────
  if (pageState === 'not-found') {
    return (
      <div className="min-h-[100vh] min-h-[100dvh] flex items-center justify-center bg-surface-note">
        <div className="text-center space-y-4 max-w-md px-6">
          <AlertCircle className="h-12 w-12 text-foreground/20 mx-auto" />
          <h2 className="text-lg font-headline text-foreground/60">Note not found</h2>
          <p className="text-sm text-foreground/40">
            This note doesn't exist or the link may be invalid.
          </p>
          <Link to="/">
            <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/10 mt-4">
              Go to TheWeddingBot
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ── No access state ─────────────────────────────────────────────────────────
  if (pageState === 'no-access') {
    return (
      <div className="min-h-[100vh] min-h-[100dvh] flex items-center justify-center bg-surface-note">
        <div className="text-center space-y-4 max-w-md px-6">
          <div className="h-16 w-16 rounded-full bg-warning/10 flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8 text-warning/60" />
          </div>
          <h2 className="text-lg font-headline text-foreground/60">Access Restricted</h2>
          <p className="text-sm text-foreground/40">
            This note exists but sharing has been disabled by the owner.
            {note?.ownerEmail && (
              <span className="block mt-2 text-foreground/50">
                Contact <span className="text-primary/80">{note.ownerEmail}</span> to request access.
              </span>
            )}
          </p>
          <Link to="/">
            <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/10 mt-4">
              Go to TheWeddingBot
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (pageState === 'error') {
    return (
      <div className="min-h-[100vh] min-h-[100dvh] flex items-center justify-center bg-surface-note">
        <div className="text-center space-y-4 max-w-md px-6">
          <XCircle className="h-12 w-12 text-destructive/40 mx-auto" />
          <h2 className="text-lg font-headline text-foreground/60">Something went wrong</h2>
          <p className="text-sm text-foreground/40">
            Something went wrong. Please try again.
          </p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <Button
              variant="outline"
              className="border-foreground/20 text-foreground/60 hover:bg-foreground/10"
              onClick={() => window.location.reload()}
            >
              Try again
            </Button>
            <Link to="/">
              <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/10">
                Go to TheWeddingBot
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!note) return null;

  // ── Determine permission-based editor mode ─────────────────────────────────
  const permission = note.publicAccess?.permission || 'view';
  const isReadOnly = permission !== 'edit';
  const canComment = permission === 'comment' || permission === 'edit';

  return (
    // WE-20260528-864: shared-print-surface marker is consumed by the
    // @media print block in src/index.css to neutralise globally-fixed
    // chrome (analytics consent, cap-hit banner, toasts) when planners
    // export a note to PDF for offline handoff.
    <div className="shared-print-surface min-h-[100vh] min-h-[100dvh] bg-surface-note print:bg-white print:text-black">
      {/* Branded header — slimmed in print: brand mark stays as attribution, CTA hidden. */}
      <header className="border-b border-foreground/[0.06] px-6 py-4 print:border-neutral-300 print:py-2">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary print:hidden" />
              <span className="text-sm font-headline text-primary/80 tracking-wide print:text-black">TheWeddingBot</span>
            </div>
            <div className="h-5 w-px bg-foreground/10 print:hidden" />
            <span className="text-[10px] uppercase tracking-wider text-foreground/30 font-medium print:text-neutral-600">Shared Note</span>
          </div>
          <Link to="/" className="print:hidden">
            <Button variant="ghost" className="text-xs text-primary/70 hover:text-primary gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Create your own wedding notes
            </Button>
          </Link>
        </div>
      </header>

      {/* Note title bar */}
      <div className="border-b border-foreground/[0.04] px-6 py-3 print:border-neutral-300">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <span className="text-2xl">{note.icon || '\u{1F4DD}'}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-headline text-foreground/90 truncate print:text-black print:whitespace-normal">{note.title || 'Untitled'}</h1>
            <p className="text-[10px] text-foreground/30 print:hidden">
              {permission === 'edit' ? 'You can edit this note' : permission === 'comment' ? 'You can comment on this note' : 'View only'}
            </p>
          </div>
        </div>
      </div>

      {/* Note content */}
      <main className="max-w-3xl mx-auto px-6 py-8 print:max-w-none print:px-0 print:py-4">
        <NoteEditor
          noteId={note.id}
          content={note.content}
          onUpdate={() => {}}
          readOnly={isReadOnly}
        />
      </main>
    </div>
  );
}
