import React, { useEffect, useState } from 'react';
import {
  Link2, Copy, Check, X, UserPlus, Shield, Globe, Loader2, Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { Note, NotePermission } from '@/types/notes';
import { track } from '@/lib/analytics';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface NoteShareDialogProps {
  note: Note | null;
  open: boolean;
  onClose: () => void;
  onAddCollaborator: (email: string, permission: NotePermission) => Promise<boolean> | boolean | Promise<void> | void;
  onRemoveCollaborator: (userId: string) => void;
  onUpdatePermission: (userId: string, permission: NotePermission) => void;
  onEnablePublicLink: (permission: 'view' | 'comment' | 'edit') => Promise<string>;
  onDisablePublicLink: () => void;
  onSendInvites: (emails: string[]) => Promise<void> | void;
  isOwner: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const PERMISSION_LABELS: Record<NotePermission, string> = {
  editor: 'Editor',
  commenter: 'Commenter',
  viewer: 'Viewer',
};

const PUBLIC_PERMISSION_LABELS: Record<string, string> = {
  view: 'Can view',
  comment: 'Can comment',
  edit: 'Can edit',
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const NoteShareDialog: React.FC<NoteShareDialogProps> = ({
  note, open, onClose,
  onAddCollaborator, onRemoveCollaborator, onUpdatePermission,
  onEnablePublicLink, onDisablePublicLink, onSendInvites,
  isOwner,
}) => {
  const [email, setEmail] = useState('');
  const [invitePermission, setInvitePermission] = useState<NotePermission>('editor');
  const [emailError, setEmailError] = useState('');
  const [copied, setCopied] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [pendingInviteEmails, setPendingInviteEmails] = useState<string[]>([]);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [adding, setAdding] = useState(false);

  // Reset the pending list each time the dialog opens on a new note
  useEffect(() => {
    if (open) setPendingInviteEmails([]);
  }, [open, note?.id]);

  const handleSendInvite = async () => {
    if (adding) return;
    const trimmed = email.trim();
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    if (note && trimmed.toLowerCase() === note.ownerEmail?.toLowerCase()) {
      setEmailError("You can't add yourself as a collaborator");
      return;
    }
    setEmailError('');
    setAdding(true);
    try {
      const result = await onAddCollaborator(trimmed, invitePermission);
      // Only queue for email if the add actually succeeded
      if (result !== false) {
        setPendingInviteEmails(prev =>
          prev.includes(trimmed) ? prev : [...prev, trimmed],
        );
        setEmail('');
      }
    } finally {
      setAdding(false);
    }
  };

  const handleDone = async () => {
    if (pendingInviteEmails.length === 0) {
      onClose();
      return;
    }
    setSendingInvites(true);
    try {
      await onSendInvites(pendingInviteEmails);
    } finally {
      setSendingInvites(false);
      setPendingInviteEmails([]);
      onClose();
    }
  };

  const [copyError, setCopyError] = useState(false);

  const handleCopyLink = async () => {
    if (!note?.publicAccess?.shareId) return;
    const url = `${window.location.origin}/shared/note/${note.publicAccess.shareId}`;
    track('note_shared', { note_id: note.id, channel: 'copy' });
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: create a temporary input for manual copy
      setCopyError(true);
      const input = document.createElement('input');
      input.value = url;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.focus();
      input.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // User will need to copy manually — the URL is selected
        window.prompt('Copy this link:', url);
      }
      document.body.removeChild(input);
      setCopyError(false);
    }
  };

  const handleEnableLink = async (permission: 'view' | 'comment' | 'edit') => {
    setLinkLoading(true);
    try {
      await onEnablePublicLink(permission);
    } finally {
      setLinkLoading(false);
    }
  };

  if (!note) return null;

  const publicEnabled = note.publicAccess?.enabled ?? false;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-[480px] max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar glass-panel rounded-2xl p-4 sm:p-6 border border-foreground/[0.08] shadow-modal bg-card-elevated/90 backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="font-headline text-lg text-foreground/90">
            Share "{note.title || 'Untitled'}"
          </DialogTitle>
          <DialogDescription className="text-foreground/40 text-sm">
            Invite people or share a public link
          </DialogDescription>
        </DialogHeader>

        {/* ── Owner-only notice for non-owners ───────────────────────── */}
        {!isOwner && (
          <div className="flex items-start gap-2 rounded-lg bg-foreground/[0.04] border border-foreground/[0.08] px-3 py-2.5 mt-2">
            <Lock className="h-3.5 w-3.5 text-foreground/50 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/60 leading-relaxed">
              Only the owner can add people or change access. You can still copy the public link if one is enabled.
            </p>
          </div>
        )}

        {/* ── Add people (owner only) ────────────────────────────────── */}
        {isOwner && (
          <div className="space-y-3 pt-2">
            <label className="text-xs font-medium text-foreground/60 flex items-center gap-1.5">
              <UserPlus className="h-3.5 w-3.5" />
              Add people
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Enter email address..."
                value={email}
                onChange={e => { setEmail(e.target.value); setEmailError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSendInvite()}
                className="flex-1 min-w-0 h-9 text-sm bg-foreground/[0.06] border-foreground/10 text-foreground/90 placeholder-foreground/35 rounded-lg"
              />
              <Select value={invitePermission} onValueChange={v => setInvitePermission(v as NotePermission)}>
                <SelectTrigger className="w-full sm:w-28 h-9 text-xs bg-foreground/[0.06] border-foreground/10 text-foreground/70 rounded-lg flex-shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card-elevated/95 backdrop-blur-2xl border-foreground/[0.08] text-foreground">
                  <SelectItem value="editor" className="text-xs cursor-pointer">Editor</SelectItem>
                  <SelectItem value="commenter" className="text-xs cursor-pointer">Commenter</SelectItem>
                  <SelectItem value="viewer" className="text-xs cursor-pointer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {emailError && <p className="text-xs text-destructive">{emailError}</p>}
            <Button
              onClick={handleSendInvite}
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8 px-4 rounded-full"
              disabled={!email.trim() || adding}
            >
              {adding ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Adding...
                </>
              ) : (
                'Add'
              )}
            </Button>
          </div>
        )}

        {/* ── People with access ─────────────────────────────────────── */}
        <div className="space-y-2 pt-3">
          <h4 className="text-xs font-medium text-foreground/40 uppercase tracking-wider flex items-center gap-1.5">
            <Shield className="h-3 w-3" />
            People with access
          </h4>

          {/* Owner */}
          <div className="flex items-center gap-2 sm:gap-3 px-2 py-2 rounded-lg bg-foreground/[0.03]">
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-medium flex-shrink-0">
              {note.ownerEmail?.[0]?.toUpperCase() || 'O'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground truncate">{note.ownerEmail}</p>
            </div>
            <span className="text-[10px] text-foreground/30 font-medium uppercase tracking-wider flex-shrink-0">Owner</span>
          </div>

          {/* Collaborators */}
          {note.collaborators?.map(collab => (
            <div key={collab.userId} className="flex items-center gap-2 sm:gap-3 px-2 py-2 rounded-lg bg-foreground/[0.03] group">
              <div className="h-7 w-7 rounded-full bg-foreground/10 flex items-center justify-center text-xs text-foreground/50 font-medium flex-shrink-0">
                {collab.email?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground/70 truncate">{collab.name || collab.email}</p>
                {collab.name && <p className="text-[10px] text-foreground/30 truncate">{collab.email}</p>}
              </div>
              {isOwner ? (
                <Select
                  value={collab.permission}
                  onValueChange={v => onUpdatePermission(collab.userId, v as NotePermission)}
                >
                  <SelectTrigger className="w-20 sm:w-24 h-7 text-[10px] bg-foreground/[0.04] border-foreground/10 text-foreground/50 rounded-md flex-shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end" className="bg-card-elevated/95 backdrop-blur-2xl border-foreground/[0.08] text-foreground">
                    <SelectItem value="editor" className="text-xs cursor-pointer">Editor</SelectItem>
                    <SelectItem value="commenter" className="text-xs cursor-pointer">Commenter</SelectItem>
                    <SelectItem value="viewer" className="text-xs cursor-pointer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-[10px] text-foreground/40 font-medium uppercase tracking-wider flex-shrink-0 px-2">
                  {PERMISSION_LABELS[collab.permission]}
                </span>
              )}
              {isOwner && (
                <button
                  onClick={() => onRemoveCollaborator(collab.userId)}
                  className="flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded hover:bg-foreground/10 text-foreground/40 hover:text-destructive transition-all"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}

          {(!note.collaborators || note.collaborators.length === 0) && (
            <p className="text-xs text-foreground/20 italic px-2 py-1">No collaborators yet</p>
          )}
        </div>

        {/* ── Link sharing ─────────────────────────────────────────── */}
        <div className="space-y-3 pt-3 border-t border-foreground/[0.06]">
          <h4 className="text-xs font-medium text-foreground/40 uppercase tracking-wider flex items-center gap-1.5">
            <Globe className="h-3 w-3" />
            Link sharing
          </h4>

          {publicEnabled ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Link2 className="h-3.5 w-3.5 text-primary/60 flex-shrink-0" />
                <span className="text-xs text-foreground/60 flex-1 min-w-0 truncate">Anyone with the link:</span>
                {isOwner ? (
                  <Select
                    value={note.publicAccess.permission}
                    onValueChange={v => handleEnableLink(v as 'view' | 'comment' | 'edit')}
                  >
                    <SelectTrigger className="w-28 h-7 text-[10px] bg-foreground/[0.04] border-foreground/10 text-foreground/50 rounded-md flex-shrink-0">
                      <SelectValue>{PUBLIC_PERMISSION_LABELS[note.publicAccess.permission]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent align="end" className="bg-card-elevated/95 backdrop-blur-2xl border-foreground/[0.08] text-foreground">
                      <SelectItem value="view" className="text-xs cursor-pointer">Can view</SelectItem>
                      <SelectItem value="comment" className="text-xs cursor-pointer">Can comment</SelectItem>
                      <SelectItem value="edit" className="text-xs cursor-pointer">Can edit</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-[10px] text-foreground/40 font-medium uppercase tracking-wider flex-shrink-0 px-2">
                    {PUBLIC_PERMISSION_LABELS[note.publicAccess.permission]}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleCopyLink}
                  variant="outline"
                  className="h-8 gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10 rounded-full flex-1"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied!' : 'Copy link'}
                </Button>
                {isOwner && (
                  <Button
                    onClick={onDisablePublicLink}
                    variant="ghost"
                    className="h-8 text-xs text-destructive hover:text-destructive-subtle hover:bg-destructive/10 rounded-full"
                  >
                    Disable
                  </Button>
                )}
              </div>
            </div>
          ) : (
            isOwner ? (
              <Button
                onClick={() => handleEnableLink('view')}
                variant="outline"
                className="h-8 gap-1.5 text-xs border-foreground/[0.08] text-foreground/50 hover:bg-foreground/[0.06] rounded-full w-full"
                disabled={linkLoading}
              >
                {linkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                Enable public link
              </Button>
            ) : (
              <p className="text-[11px] text-foreground/40 italic px-2 py-1">Public link not enabled.</p>
            )
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <p className="text-[10px] text-foreground/40 flex-1 min-w-0">
            {pendingInviteEmails.length > 0
              ? `${pendingInviteEmails.length} invite${pendingInviteEmails.length === 1 ? '' : 's'} will be emailed on Done`
              : ''}
          </p>
          <Button
            onClick={handleDone}
            disabled={sendingInvites}
            className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8 px-6 rounded-full flex-shrink-0 ml-auto"
          >
            {sendingInvites ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Done'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NoteShareDialog;
