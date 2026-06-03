import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, AlertCircle, Sparkles, XCircle, Lock, Mail, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  getNoteByShareIdAny,
  resolveEffectiveAccess,
  claimCollaboratorUid,
  type EffectiveAccess,
} from '@/services/notesSharingService';
import { subscribeToNote } from '@/services/notesService';
import NoteEditor from '@/components/notes/NoteEditor';
import SignInModal from '@/components/auth/SignInModal';
import SignUpModal from '@/components/auth/SignUpModal';
// Trimmed from assets/images/4.png (the source is a 2000×2000 canvas with wide
// whitespace margins, which made it render tiny in the header).
import weddingBotLogo from '@/assets/images/the-wedding-bot-logo.png';
import type { Note } from '@/types/notes';

type PageState = 'loading' | 'not-found' | 'error' | 'resolved';

// ─────────────────────────────────────────────────────────────────────────────
// Shared-note dispatcher.
//
// The collaborator-invite email links here (`/shared/note/<publicShareId>`).
// Previously this page derived edit/view solely from `publicAccess.permission`
// (which the invite mailer hardcodes to 'view'), so an editor invitee always
// landed read-only and off-theme. Now the page is an auth-aware dispatcher:
//
//   • Owner / named collaborator (matched by EMAIL) → redirect INTO the real
//     notes section (/:uid/notes/:noteId) which already has the full themed
//     editor, autosave, comments, and the "shared by" banner. This fixes both
//     the view-only bug AND the off-theme look in one move.
//   • Not signed in → in-place Sign in / Create account (handles invitees who
//     don't yet have an account — they sign up with the invited email and are
//     auto-recognised on return because the grant is keyed by email).
//   • Signed in but not authorised → request-access screen (no content shown).
//   • Public link → themed, read-only public view (anonymous viewing preserved).
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_WRAP = 'min-h-[100vh] min-h-[100dvh] gradient-bg bg-background text-foreground/90';

function Branded({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${PAGE_WRAP} flex items-center justify-center`}>
      <div className="text-center space-y-4 max-w-md px-6">{children}</div>
    </div>
  );
}

function HomeButton({ label = 'Go to TheWeddingBot' }: { label?: string }) {
  return (
    <Link to="/">
      <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/10 mt-4">
        {label}
      </Button>
    </Link>
  );
}

export default function SharedNote() {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [note, setNote] = useState<Note | null>(null);
  const [pageState, setPageState] = useState<PageState>('loading');

  // In-place auth (so invitees never leave the note URL).
  const [authModal, setAuthModal] = useState<'signin' | 'signup' | null>(null);
  const [prefillEmail, setPrefillEmail] = useState<string | undefined>(undefined);

  // ── Resolve the note by share id, then keep it live ───────────────────────
  useEffect(() => {
    if (!shareId) {
      setPageState('not-found');
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        // Resolve REGARDLESS of publicAccess.enabled so a named collaborator can
        // open a note whose owner never enabled (or later disabled) public access.
        const resolved = await getNoteByShareIdAny(shareId);
        if (cancelled) return;

        if (!resolved) {
          setPageState('not-found');
          return;
        }

        // Render immediately from the initial resolve. The live subscription
        // below keeps it fresh, but if that listener ever errors (e.g. once
        // scoped Firestore rules land) we must not be stranded on the spinner.
        if (!resolved.isDeleted) {
          setNote(resolved);
          setPageState('resolved');
        }

        unsubscribe = subscribeToNote(resolved.id, (updated) => {
          if (cancelled) return;
          if (!updated || updated.isDeleted) {
            setNote(null);
            setPageState('not-found');
            return;
          }
          setNote(updated);
          setPageState('resolved');
        });
      } catch {
        if (!cancelled) setPageState('error');
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [shareId]);

  const access: EffectiveAccess = useMemo(
    () => resolveEffectiveAccess(note, user ? { uid: user.uid, email: user.email } : null),
    [note, user],
  );

  // ── Authorised owner/collaborator → open in the real notes section ────────
  const shouldEnterNotes =
    pageState === 'resolved' && !!user && !!note && (access.source === 'owner' || access.source === 'collaborator');

  useEffect(() => {
    if (!shouldEnterNotes || !user || !note) return;
    // Backfill the collaborator's uid from their email placeholder (best-effort,
    // fire-and-forget) so uid-keyed checks elsewhere stay consistent.
    if (access.source === 'collaborator' && access.collaborator && user.email && access.collaborator.userId !== user.uid) {
      void claimCollaboratorUid(note.id, user.email, user.uid);
    }
    navigate(`/${user.uid}/notes/${note.id}`, { replace: true });
  }, [shouldEnterNotes, user, note, access, navigate]);

  const openSignIn = useCallback((email?: string) => {
    setPrefillEmail(email);
    setAuthModal('signin');
  }, []);
  const openSignUp = useCallback((email?: string) => {
    setPrefillEmail(email);
    setAuthModal('signup');
  }, []);

  // The auth modals are mounted on every non-error branch so the in-place
  // sign-in / sign-up flow is always available. After a successful auth the
  // global `user` updates and the dispatcher re-resolves automatically.
  const authModalsJSX = (
    <>
      <SignInModal
        open={authModal === 'signin'}
        onOpenChange={(o) => setAuthModal(o ? 'signin' : null)}
        onSwitchToSignUp={(email) => openSignUp(email)}
      />
      <SignUpModal
        open={authModal === 'signup'}
        onOpenChange={(o) => setAuthModal(o ? 'signup' : null)}
        onSwitchToSignIn={() => openSignIn(prefillEmail)}
        initialEmail={prefillEmail}
      />
    </>
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (pageState === 'loading' || authLoading) {
    return (
      <Branded>
        <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto" />
        <p className="text-sm text-foreground/50">Loading shared note…</p>
      </Branded>
    );
  }

  // ── Not found ───────────────────────────────────────────────────────────────
  if (pageState === 'not-found') {
    return (
      <Branded>
        <AlertCircle className="h-12 w-12 text-foreground/20 mx-auto" />
        <h2 className="text-lg font-headline text-foreground/70">Note not found</h2>
        <p className="text-sm text-foreground/40">This note doesn't exist or the link may be invalid.</p>
        <HomeButton />
      </Branded>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (pageState === 'error') {
    return (
      <Branded>
        <XCircle className="h-12 w-12 text-destructive/40 mx-auto" />
        <h2 className="text-lg font-headline text-foreground/70">Something went wrong</h2>
        <p className="text-sm text-foreground/40">Please try again in a moment.</p>
        <div className="flex items-center justify-center gap-3 mt-4">
          <Button
            variant="outline"
            className="border-foreground/20 text-foreground/60 hover:bg-foreground/10"
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
          <HomeButton />
        </div>
      </Branded>
    );
  }

  if (!note) return null;

  // ── Authorised → brief "opening" state while the redirect effect runs ─────
  if (shouldEnterNotes) {
    return (
      <Branded>
        <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto" />
        <p className="text-sm text-foreground/50">Opening this note in your workspace…</p>
      </Branded>
    );
  }

  // ── Signed in, but NOT an owner/collaborator and no public access ─────────
  if (user && access.source === 'none') {
    return (
      <>
        <Branded>
          <div className="h-16 w-16 rounded-full bg-warning/10 flex items-center justify-center mx-auto">
            <Lock className="h-7 w-7 text-warning/70" />
          </div>
          <h2 className="text-lg font-headline text-foreground/70">You don't have access</h2>
          <p className="text-sm text-foreground/40">
            This note was shared privately and your account
            {user.email ? <> (<span className="text-foreground/60">{user.email}</span>)</> : null} isn't on its
            access list.
            {note.ownerEmail && (
              <span className="block mt-2 text-foreground/50">
                Ask <span className="text-primary/80">{note.ownerEmail}</span> to invite this email, or sign in with
                the address the note was shared to.
              </span>
            )}
          </p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <Button
              variant="outline"
              className="border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => openSignIn()}
            >
              Sign in with another email
            </Button>
            <HomeButton label="Go home" />
          </div>
        </Branded>
        {authModalsJSX}
      </>
    );
  }

  // ── Not signed in, and the note isn't publicly accessible → sign-in gate ──
  if (!user && access.source === 'none') {
    return (
      <>
        <Branded>
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Mail className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-lg font-headline text-foreground/80">You've been invited to a note</h2>
          <p className="text-sm text-foreground/50">
            Sign in to open it. Use the email address this note was shared to so we can recognise your access — if you
            don't have an account yet, you can create one in a moment.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-4">
            <Button className="rounded-xl px-6" onClick={() => openSignIn()}>
              Sign in
            </Button>
            <Button variant="outline" className="rounded-xl px-6 border-primary/40 text-primary hover:bg-primary/10" onClick={() => openSignUp()}>
              Create account
            </Button>
          </div>
        </Branded>
        {authModalsJSX}
      </>
    );
  }

  // ── Public view (anonymous or signed-in non-collaborator) ─────────────────
  // Read-only by design: public links render the content for viewing. Editor
  // collaboration is the authenticated, email-gated path above. Anonymous
  // public *editing* is intentionally not supported here (it has no per-user
  // attribution and the note's ACL can't bound it safely).
  const permissionLabel =
    access.canEdit ? 'You can edit this note' : access.canComment ? 'You can comment on this note' : 'View only';

  return (
    <>
      <div className={PAGE_WRAP}>
        {/* Branded header */}
        <header className="border-b border-border/40 px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center">
                <img src={weddingBotLogo} alt="TheWeddingBot" className="h-10 sm:h-12 w-auto object-contain" />
              </Link>
              <div className="h-5 w-px bg-foreground/10" />
              <span className="text-[10px] uppercase tracking-wider text-foreground/30 font-medium">Shared Note</span>
            </div>
            <Link to="/">
              <Button variant="ghost" className="text-xs text-primary/80 hover:text-primary gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Create your own wedding notes
              </Button>
            </Link>
          </div>
        </header>

        {/* Invited-to-edit nudge for logged-out visitors. The public link is
            view-only, but the same link is what editor invitees receive — so
            offer them a way to sign in and unlock their real access. */}
        {!user && (
          <div className="border-b border-primary/15 bg-primary/[0.06] px-6 py-2.5">
            <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-foreground/60">
                Were you invited to collaborate on this note? Sign in to open it in your workspace.
              </p>
              <button
                type="button"
                onClick={() => openSignIn()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80"
              >
                Sign in <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* Note title bar */}
        <div className="border-b border-border/30 px-6 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <span className="text-2xl">{note.icon || '\u{1F4DD}'}</span>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-headline text-foreground/90 truncate">{note.title || 'Untitled'}</h1>
              <p className="text-[10px] text-foreground/40">
                {user ? 'Shared publicly · ' : ''}
                {permissionLabel}
              </p>
            </div>
          </div>
        </div>

        {/* Note content — wrapped in the canonical notes card for theme parity. */}
        <main className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
          <div className="relative w-full rounded-2xl bg-card border border-border/60 shadow-card px-5 py-5 sm:px-8 sm:py-7 min-h-[420px]">
            <NoteEditor noteId={note.id} content={note.content} onUpdate={() => {}} readOnly />
          </div>
        </main>
      </div>
      {authModalsJSX}
    </>
  );
}
