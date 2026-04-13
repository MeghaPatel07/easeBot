import React, { useEffect, useState } from 'react';
import {
  Link2, Copy, Check, X, UserPlus, Shield, Globe, Loader2,
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
}) => {
  const [email, setEmail] = useState('');
  const [invitePermission, setInvitePermission] = useState<NotePermission>('editor');
  const [emailError, setEmailError] = useState('');
  const [copied, setCopied] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [pendingInviteEmails, setPendingInviteEmails] = useState<string[]>([]);
  const [sendingInvites, setSendingInvites] = useState(false);

  // Reset the pending list each time the dialog opens on a new note
  useEffect(() => {
    if (open) setPendingInviteEmails([]);
  }, [open, note?.id]);

  const handleSendInvite = async () => {
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
    const result = await onAddCollaborator(trimmed, invitePermission);
    // Only queue for email if the add actually succeeded
    if (result !== false) {
      setPendingInviteEmails(prev =>
        prev.includes(trimmed) ? prev : [...prev, trimmed],
      );
      setEmail('');
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
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[480px] glass-panel rounded-2xl p-6 border border-white/[0.1] shadow-2xl bg-[#1a1a1a]/95 backdrop-blur-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-lg text-white/90">
            Share "{note.title || 'Untitled'}"
          </DialogTitle>
          <DialogDescription className="text-white/40 text-sm">
            Invite people or share a public link
          </DialogDescription>
        </DialogHeader>

        {/* ── Add people ─────────────────────────────────────────────── */}
        <div className="space-y-3 pt-2">
          <label className="text-xs font-medium text-white/60 flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Add people
          </label>
          <div className="flex gap-2">
            <Input
              placeholder="Enter email address..."
              value={email}
              onChange={e => { setEmail(e.target.value); setEmailError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSendInvite()}
              className="flex-1 h-9 text-sm bg-white/[0.06] border-white/10 text-white/90 placeholder-white/35 rounded-lg"
            />
            <Select value={invitePermission} onValueChange={v => setInvitePermission(v as NotePermission)}>
              <SelectTrigger className="w-28 h-9 text-xs bg-white/[0.06] border-white/10 text-white/70 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a1a]/95 backdrop-blur-md border-white/10 text-white/80">
                <SelectItem value="editor" className="text-xs cursor-pointer">Editor</SelectItem>
                <SelectItem value="commenter" className="text-xs cursor-pointer">Commenter</SelectItem>
                <SelectItem value="viewer" className="text-xs cursor-pointer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {emailError && <p className="text-xs text-red-400">{emailError}</p>}
          <Button
            onClick={handleSendInvite}
            className="bg-primary hover:bg-primary/90 text-white text-xs h-8 px-4 rounded-lg"
            disabled={!email.trim()}
          >
            Send Invite
          </Button>
        </div>

        {/* ── People with access ─────────────────────────────────────── */}
        <div className="space-y-2 pt-3">
          <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider flex items-center gap-1.5">
            <Shield className="h-3 w-3" />
            People with access
          </h4>

          {/* Owner */}
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-white/[0.03]">
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-medium flex-shrink-0">
              {note.ownerEmail?.[0]?.toUpperCase() || 'O'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/80 truncate">{note.ownerEmail}</p>
            </div>
            <span className="text-[10px] text-white/30 font-medium uppercase tracking-wider">Owner</span>
          </div>

          {/* Collaborators */}
          {note.collaborators?.map(collab => (
            <div key={collab.userId} className="flex items-center gap-3 px-2 py-2 rounded-lg bg-white/[0.03] group">
              <div className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/50 font-medium flex-shrink-0">
                {collab.email?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/70 truncate">{collab.name || collab.email}</p>
                {collab.name && <p className="text-[10px] text-white/30 truncate">{collab.email}</p>}
              </div>
              <Select
                value={collab.permission}
                onValueChange={v => onUpdatePermission(collab.userId, v as NotePermission)}
              >
                <SelectTrigger className="w-24 h-7 text-[10px] bg-white/[0.04] border-white/10 text-white/50 rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a]/95 backdrop-blur-md border-white/10 text-white/80">
                  <SelectItem value="editor" className="text-xs cursor-pointer">Editor</SelectItem>
                  <SelectItem value="commenter" className="text-xs cursor-pointer">Commenter</SelectItem>
                  <SelectItem value="viewer" className="text-xs cursor-pointer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <button
                onClick={() => onRemoveCollaborator(collab.userId)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-white/40 hover:text-red-400 transition-all"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {(!note.collaborators || note.collaborators.length === 0) && (
            <p className="text-xs text-white/20 italic px-2 py-1">No collaborators yet</p>
          )}
        </div>

        {/* ── Link sharing ─────────────────────────────────────────── */}
        <div className="space-y-3 pt-3 border-t border-white/[0.06]">
          <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider flex items-center gap-1.5">
            <Globe className="h-3 w-3" />
            Link sharing
          </h4>

          {publicEnabled ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Link2 className="h-3.5 w-3.5 text-primary/60 flex-shrink-0" />
                <span className="text-xs text-white/60 flex-1">Anyone with the link:</span>
                <Select
                  value={note.publicAccess.permission}
                  onValueChange={v => handleEnableLink(v as 'view' | 'comment' | 'edit')}
                >
                  <SelectTrigger className="w-28 h-7 text-[10px] bg-white/[0.04] border-white/10 text-white/50 rounded-md">
                    <SelectValue>{PUBLIC_PERMISSION_LABELS[note.publicAccess.permission]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a]/95 backdrop-blur-md border-white/10 text-white/80">
                    <SelectItem value="view" className="text-xs cursor-pointer">Can view</SelectItem>
                    <SelectItem value="comment" className="text-xs cursor-pointer">Can comment</SelectItem>
                    <SelectItem value="edit" className="text-xs cursor-pointer">Can edit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleCopyLink}
                  variant="outline"
                  className="h-8 gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10 rounded-lg flex-1"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied!' : 'Copy link'}
                </Button>
                <Button
                  onClick={onDisablePublicLink}
                  variant="ghost"
                  className="h-8 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
                >
                  Disable
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => handleEnableLink('view')}
              variant="outline"
              className="h-8 gap-1.5 text-xs border-white/10 text-white/50 hover:bg-white/10 rounded-lg w-full"
              disabled={linkLoading}
            >
              {linkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Enable public link
            </Button>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-[10px] text-white/40">
            {pendingInviteEmails.length > 0
              ? `${pendingInviteEmails.length} invite${pendingInviteEmails.length === 1 ? '' : 's'} will be emailed on Done`
              : ''}
          </p>
          <Button
            onClick={handleDone}
            disabled={sendingInvites}
            className="bg-primary hover:bg-primary/90 text-white text-xs h-8 px-6 rounded-lg"
          >
            {sendingInvites ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Done'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NoteShareDialog;
