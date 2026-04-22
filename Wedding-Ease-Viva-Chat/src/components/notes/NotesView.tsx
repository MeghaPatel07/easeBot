import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FileText, Plus, Layout, Loader2, ImagePlus, X, Users, Crown, ChevronDown, AlertTriangle } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNotes } from '@/hooks/useNotes';
import { useNoteEditor } from '@/hooks/useNoteEditor';
import {
  addCollaborator,
  removeCollaborator,
  updateCollaboratorPermission,
  enablePublicLink,
  disablePublicLink,
  sendNoteInvites,
} from '@/services/notesSharingService';
import {
  subscribeToComments,
  addComment,
  editComment,
  deleteComment,
  resolveComment,
  unresolveComment,
  addReaction,
} from '@/services/notesCommentsService';
import type { NoteComment, NotePermission, NoteCategory, NoteTemplate } from '@/types/notes';
import NotesSidebar from '@/components/notes/NotesSidebar';
import NoteHeader from '@/components/notes/NoteHeader';
import NoteEditor from '@/components/notes/NoteEditor';
import NoteShareDialog from '@/components/notes/NoteShareDialog';
import NoteCommentsSidebar from '@/components/notes/NoteCommentsSidebar';
import NoteTemplateDialog from '@/components/notes/NoteTemplateDialog';
import PaywallModal from '@/components/notes/PaywallModal';
import BlockWidgetBar from '@/components/notes/toolbar/BlockWidgetBar';
import { toast } from 'sonner';
import { useAccount } from '@/hooks/useAccount';
import { resolveTier, getLimits } from '@/config/tierConfig';
import { track } from '@/lib/analytics';

interface NotesViewProps {
  userId: string;
  userEmail: string;
  userName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: extract text from Tiptap JSON for word counting
// ─────────────────────────────────────────────────────────────────────────────
function extractText(json: any): string {
  if (!json) return '';
  if (typeof json === 'string') return json;
  if (json.type === 'text') return json.text || '';
  if (Array.isArray(json.content)) return json.content.map(extractText).join(' ');
  if (json.content) return extractText(json.content);
  return '';
}

export default function NotesView({ userId, userEmail, userName }: NotesViewProps) {
  const { noteId: urlNoteId } = useParams<{ noteId?: string }>();
  const navigate = useNavigate();
  const {
    notes, sharedNotes, folders, activeNoteId, setActiveNoteId,
    searchQuery, setSearchQuery, isLoading,
    createNote, updateNote, deleteNote, restoreNote, duplicateNote,
    createFolder, updateFolder, deleteFolder,
    moveNoteToFolder,
  } = useNotes(userId, userEmail);

  // Sync activeNoteId with URL :noteId param — lets /:userId/notes/:noteId
  // deeplinks (e.g. from the AI message chip) open the target note.
  useEffect(() => {
    if (urlNoteId && urlNoteId !== activeNoteId) {
      setActiveNoteId(urlNoteId);
    }
  }, [urlNoteId, activeNoteId, setActiveNoteId]);

  // Keep URL in sync when the user selects a different note in the sidebar.
  const handleSelectNote = useCallback((nextId: string | null) => {
    setActiveNoteId(nextId);
    if (nextId) navigate(`/${userId}/notes/${nextId}`, { replace: true });
    else navigate(`/${userId}/notes`, { replace: true });
  }, [navigate, setActiveNoteId, userId]);

  const {
    note, isSaving, lastSavedAt, hasUnsavedChanges, save,
    updateContent, updateTitle, uploadImage,
    conflict, dismissConflict, discardLocalEdits,
  } = useNoteEditor(activeNoteId, userId);

  // Local state
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [comments, setComments] = useState<NoteComment[]>([]);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [coverHovered, setCoverHovered] = useState(false);
  const [notesPickerOpen, setNotesPickerOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallTrigger, setPaywallTrigger] = useState<'edit' | 'create' | 'template'>('edit');

  // Tier computation — hoisted so handlers can gate on it.
  const { profile: accountProfile } = useAccount();
  const tier = resolveTier(accountProfile);
  const limits = getLimits(tier);
  const tierAllowsEdit = limits.notesAccess === 'full';

  const openPaywall = useCallback((reason: 'edit' | 'create' | 'template') => {
    setPaywallTrigger(reason);
    setPaywallOpen(true);
    track('note_paywall_shown', { feature: 'notes', trigger: reason, current_tier: tier, required_tier: 'pro' });
  }, [tier]);

  const guardedCreateNote = useCallback(
    (folderId?: string) => {
      if (!tierAllowsEdit) {
        openPaywall('create');
        return;
      }
      createNote(folderId ? { folderId } : undefined);
    },
    [tierAllowsEdit, createNote, openPaywall],
  );
  const coverInputRef = useRef<HTMLInputElement>(null);
  const handleEditorReady = useCallback((editor: Editor) => setEditorInstance(editor), []);

  // Subscribe to comments when active note changes
  useEffect(() => {
    if (!activeNoteId) {
      setComments([]);
      return;
    }
    const unsubscribe = subscribeToComments(activeNoteId, (updatedComments) => {
      setComments(updatedComments);
    });
    return () => unsubscribe();
  }, [activeNoteId]);

  // Template handler
  const handleSelectTemplate = async (template: NoteTemplate) => {
    if (!tierAllowsEdit) {
      setShowTemplateDialog(false);
      openPaywall('template');
      return;
    }
    try {
      await createNote({
        title: template.title,
        content: template.content,
        icon: template.icon,
        category: template.category,
      });
      setShowTemplateDialog(false);
    } catch (err) {
      toast.error('Failed to create note from template');
    }
  };

  // Sharing handlers
  const handleAddCollaborator = async (email: string, permission: NotePermission): Promise<boolean> => {
    if (!activeNoteId) return false;
    try {
      await addCollaborator(activeNoteId, {
        userId: '',
        email,
        name: email.split('@')[0],
        permission,
        addedBy: userId,
      });
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add collaborator');
      return false;
    }
  };

  const handleSendInvites = async (emails: string[]) => {
    if (!activeNoteId || emails.length === 0) return;
    try {
      const result = await sendNoteInvites(activeNoteId, emails);
      if (result.sent.length > 0) {
        toast.success(
          result.sent.length === 1
            ? `Invitation sent to ${result.sent[0]}`
            : `Invitations sent to ${result.sent.length} people`,
        );
      }
      if (result.skipped.length > 0) {
        toast.error(`Could not email: ${result.skipped.join(', ')}`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send invitations');
    }
  };

  const handleRemoveCollaborator = async (collaboratorUserId: string) => {
    if (!activeNoteId) return;
    try {
      await removeCollaborator(activeNoteId, collaboratorUserId);
    } catch (err) {
      toast.error('Failed to remove collaborator');
    }
  };

  const handleUpdateCollaboratorPermission = async (collaboratorUserId: string, permission: NotePermission) => {
    if (!activeNoteId) return;
    try {
      await updateCollaboratorPermission(activeNoteId, collaboratorUserId, permission);
    } catch (err) {
      toast.error('Failed to update permission');
    }
  };

  const handleEnablePublicLink = async (permission: 'view' | 'comment' | 'edit') => {
    if (!activeNoteId) return '';
    // Shareable links are Pro Max only (PRICING_PRD §4)
    if (!getLimits(tier).shareableLinks) {
      toast.error('Shareable links are a Pro Max feature. Upgrade to create read-only links.');
      return '';
    }
    try {
      return await enablePublicLink(activeNoteId, permission);
    } catch (err) {
      toast.error('Failed to enable public link');
      return '';
    }
  };

  const handleDisablePublicLink = async () => {
    if (!activeNoteId) return;
    try {
      await disablePublicLink(activeNoteId);
    } catch (err) {
      toast.error('Failed to disable public link');
    }
  };

  // Toggle favorite via updateNote
  const handleToggleFavorite = async (noteId: string, favorited: boolean) => {
    try {
      await updateNote(noteId, { favorited });
    } catch (err) {
      toast.error('Failed to update favorite');
    }
  };

  // Cover image handler
  const handleCoverImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !note) return;
    try {
      const url = await uploadImage(file);
      if (url) {
        await updateNote(note.id, { coverImage: url });
      }
    } catch (err) {
      toast.error('Failed to upload cover image');
    }
    // Reset file input
    if (coverInputRef.current) coverInputRef.current.value = '';
  };

  const handleRemoveCover = async () => {
    if (!note) return;
    try {
      await updateNote(note.id, { coverImage: null });
    } catch (err) {
      toast.error('Failed to remove cover image');
    }
  };

  // Duplicate handler
  const handleDuplicateNote = async (noteId: string) => {
    try {
      await duplicateNote(noteId);
      toast.success('Note duplicated');
    } catch (err) {
      toast.error('Failed to duplicate note');
    }
  };

  // Restore handler
  const handleRestoreNote = async (noteId: string) => {
    try {
      await restoreNote(noteId);
      toast.success('Note restored');
    } catch (err) {
      toast.error('Failed to restore note');
    }
  };

  // Collaborators are stored with userId === email fallback (see notesSharingService),
  // so match on both userId and email to be robust across older/newer records.
  const normalizedEmail = (userEmail || '').trim().toLowerCase();
  const matchesUser = (c: { userId?: string; email?: string }) =>
    c.userId === userId || (c.email || '').trim().toLowerCase() === normalizedEmail;

  const isOwner = note?.ownerId === userId;
  const myCollaborator = note?.collaborators?.find(matchesUser);
  const isEditor = myCollaborator?.permission === 'editor';
  const canEdit = tierAllowsEdit && (isOwner || isEditor);
  const readOnly = !canEdit;
  const blockedByTier = !tierAllowsEdit && (isOwner || isEditor);

  // Conflict display name: look up the remote editor in owner/collaborators,
  // fall back to the raw id if we can't match (e.g. stale collaborator list).
  const conflictName = React.useMemo(() => {
    if (!conflict || !note) return null;
    const id = conflict.remoteEditedBy;
    if (note.ownerId === id) return note.ownerEmail || 'the owner';
    const c = note.collaborators?.find(x => x.userId === id);
    return c?.name || c?.email || 'another collaborator';
  }, [conflict, note]);

  const handleViewTheirs = useCallback(() => {
    const remote = discardLocalEdits();
    if (!remote || !editorInstance) return;
    try {
      const json = JSON.parse(remote);
      editorInstance.commands.setContent(json);
      if (activeNoteId) {
        track('note_conflict_resolved', { note_id: activeNoteId, resolution: 'took_theirs' });
      }
    } catch (err) {
      console.error('[NotesView] failed to apply remote content', err);
    }
  }, [discardLocalEdits, editorInstance, activeNoteId]);

  const handleKeepMine = useCallback(() => {
    dismissConflict();
    if (activeNoteId) {
      track('note_conflict_resolved', { note_id: activeNoteId, resolution: 'kept_mine' });
    }
  }, [dismissConflict, activeNoteId]);

  // Word count -- content is Tiptap JSON, not HTML.
  // Memoized because extractText walks the entire document; on a long note
  // this ran on every render (e.g. every keystroke-triggered re-render).
  const wordCount = React.useMemo(() => {
    if (!note?.content) return 0;
    let parsed: unknown;
    try { parsed = JSON.parse(note.content); } catch { return 0; }
    return extractText(parsed).split(/\s+/).filter(Boolean).length;
  }, [note?.content]);

  // Trashed notes count
  const trashedCount = notes.filter(n => n.isDeleted).length;

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)] h-[calc(100dvh-7.5rem)] -m-3 sm:-m-5 rounded-xl overflow-hidden border border-foreground/[0.06]">
      {/* Centered editor-panel controls — Google-Docs-style file picker.
          "All notes" opens a popover with the list; "+ New note" creates.
          Shown on all sizes — the outer app nav already fills the left column,
          so a second persistent sidebar would create visual clutter. */}
      <div className="flex items-center justify-center gap-2 px-3 py-2.5 bg-card/60 [.light_&]:bg-card/95 border-b border-border/40 flex-shrink-0">
        <Popover open={notesPickerOpen} onOpenChange={setNotesPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 transition-colors shadow-sm"
              title="Switch notes"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>All notes</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="center"
            sideOffset={6}
            className="w-64 p-0 border-border bg-card shadow-dropdown [&>div]:!w-full"
          >
            <div className="h-[min(70vh,36rem)] flex flex-col">
              <NotesSidebar
                notes={notes}
                sharedNotes={sharedNotes}
                folders={folders}
                activeNoteId={activeNoteId}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onSelectNote={(noteId) => { handleSelectNote(noteId); setNotesPickerOpen(false); }}
                onCreateNote={(folderId) => { guardedCreateNote(folderId); setNotesPickerOpen(false); }}
                onDeleteNote={deleteNote}
                onRenameNote={(noteId, title) => updateNote(noteId, { title })}
                onRestoreNote={handleRestoreNote}
                onDuplicateNote={handleDuplicateNote}
                onCreateFolder={createFolder}
                onDeleteFolder={deleteFolder}
                onRenameFolder={(folderId, name) => updateFolder(folderId, { name })}
                onMoveNote={moveNoteToFolder}
                onToggleFavorite={handleToggleFavorite}
                onBack={() => setNotesPickerOpen(false)}
                trashedCount={trashedCount}
              />
            </div>
          </PopoverContent>
        </Popover>
        <button
          type="button"
          onClick={() => guardedCreateNote()}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary-hover transition-colors shadow-sm"
          title="New note"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New note</span>
        </button>
      </div>

      {/* Main content area — min-h-0 is required so flex children with
          overflow-y-auto can actually shrink and scroll rather than
          expanding the column and pushing the toolbar offscreen. */}
      <div className="flex flex-1 flex-col min-h-0 min-w-0 bg-foreground/[0.02]">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <Loader2 className="h-8 w-8 text-primary/40 mx-auto animate-spin" />
              <p className="text-sm text-foreground/30">Loading notes...</p>
            </div>
          </div>
        ) : note ? (
          <>
            <NoteHeader
              note={note}
              onUpdateTitle={updateTitle}
              onUpdateIcon={(icon: string) => updateNote(note.id, { icon })}
              onUpdateCategory={(category: NoteCategory) => updateNote(note.id, { category })}
              onToggleFavorite={() => handleToggleFavorite(note.id, !note.favorited)}
              onShare={() => setShowShareDialog(true)}
              onDelete={() => deleteNote(note.id)}
              onSave={save}
              isSaving={isSaving}
              lastSavedAt={lastSavedAt}
              hasUnsavedChanges={hasUnsavedChanges}
              readOnly={readOnly}
              wordCount={wordCount}
              editor={editorInstance}
              onToggleComments={() => setShowComments(v => !v)}
              commentsCount={comments.length}
              onBack={() => handleSelectNote(null)}
            />
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              {/* Shared note info banner */}
              {!isOwner && note.ownerEmail && (
                <div className="w-full px-3 sm:px-6 pt-3">
                  <div className="flex flex-col gap-1.5 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Crown className="h-3.5 w-3.5 text-primary/70 flex-shrink-0" />
                      <p className="text-xs text-foreground/60">
                        <span className="text-foreground/80 font-medium">Shared by</span>{' '}
                        {note.ownerEmail}
                      </p>
                    </div>
                    {note.collaborators?.length > 0 && (
                      <div className="flex items-start gap-2">
                        <Users className="h-3.5 w-3.5 text-foreground/30 flex-shrink-0 mt-0.5" />
                        <div className="flex flex-wrap gap-1">
                          {note.collaborators.map((c) => (
                            <span
                              key={c.userId}
                              className="inline-flex items-center gap-1 text-[10px] bg-foreground/[0.06] border border-foreground/[0.08] rounded-full px-2 py-0.5 text-foreground/50"
                            >
                              {c.name || c.email.split('@')[0]}
                              <span className="text-foreground/25">
                                {c.permission === 'editor' ? 'edit' : c.permission === 'commenter' ? 'comment' : 'view'}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Cover image area */}
              <div
                className="relative w-full px-3 sm:px-6"
                onMouseEnter={() => setCoverHovered(true)}
                onMouseLeave={() => setCoverHovered(false)}
              >
                {note.coverImage ? (
                  <div className="relative w-full h-48 overflow-hidden">
                    <img
                      src={note.coverImage}
                      alt="Note cover"
                      className="w-full h-full object-cover"
                    />
                    {!readOnly && coverHovered && (
                      <div className="absolute top-2 right-2 flex gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-[11px] bg-overlay-scrim/60 hover:bg-overlay-scrim/80 text-overlay-text border-0 backdrop-blur-sm"
                          onClick={() => coverInputRef.current?.click()}
                        >
                          Change cover
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 w-7 p-0 bg-overlay-scrim/60 hover:bg-overlay-scrim/80 text-overlay-text border-0 backdrop-blur-sm"
                          onClick={handleRemoveCover}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  !readOnly && coverHovered && (
                    <div className="flex justify-center py-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] text-foreground/30 hover:text-foreground/60 gap-1.5"
                        onClick={() => coverInputRef.current?.click()}
                      >
                        <ImagePlus className="h-3.5 w-3.5" />
                        Add cover
                      </Button>
                    </div>
                  )
                )}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverImageChange}
                />
              </div>
              <div className="w-full px-3 sm:px-6 py-4 sm:py-6 pb-16 sm:pb-20">
                {conflict && canEdit && (
                  <div className="mb-3 rounded-2xl bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/40 px-4 py-3.5 flex items-center gap-3 shadow-sm">
                    <div className="h-9 w-9 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground/90">
                        {conflictName ? `${conflictName} just updated this note` : 'This note was just updated'}
                      </p>
                      <p className="text-xs text-foreground/55 mt-0.5">
                        Your edits are saved locally. Choose which version to keep.
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleViewTheirs}
                        className="text-xs h-8 px-3"
                      >
                        View theirs
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleKeepMine}
                        className="text-xs h-8 px-3 bg-primary hover:bg-primary-hover text-primary-foreground"
                      >
                        Keep mine
                      </Button>
                    </div>
                  </div>
                )}
                {blockedByTier && (
                  <div className="mb-3 rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/30 px-4 py-3.5 flex items-center gap-3 shadow-sm">
                    <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Crown className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground/90">Notes are view-only on Free</p>
                      <p className="text-xs text-foreground/55 mt-0.5">Upgrade to Pro to edit, share, and collaborate.</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => openPaywall('edit')}
                      className="flex-shrink-0 bg-primary hover:bg-primary-hover text-primary-foreground text-xs h-8 px-3"
                    >
                      Upgrade
                    </Button>
                  </div>
                )}
                <div
                  className="relative w-full rounded-2xl bg-card border border-border/60 shadow-card px-5 py-5 sm:px-8 sm:py-7 min-h-[520px] focus-within:border-primary/40 focus-within:shadow-dropdown transition-all"
                  onClickCapture={(e) => {
                    if (blockedByTier) {
                      e.stopPropagation();
                      openPaywall('edit');
                    }
                  }}
                >
                  <NoteEditor
                    noteId={note.id}
                    content={note.content}
                    onUpdate={updateContent}
                    onEditorReady={handleEditorReady}
                    onImageUpload={uploadImage}
                    readOnly={readOnly}
                    placeholder="Start writing, or type '/' for commands..."
                  />
                </div>
              </div>
            </div>
            {!readOnly && editorInstance && (
              <div className="flex-shrink-0 border-t border-foreground/[0.06]">
                <div className="">
                  <BlockWidgetBar editor={editorInstance} onImageUpload={uploadImage} />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <FileText className="h-16 w-16 text-foreground/10 mx-auto" />
              <h3 className="text-lg font-headline text-foreground/40">
                Select a note or create a new one
              </h3>
              <div className="flex gap-2 justify-center">
                <Button
                  onClick={() => guardedCreateNote()}
                  variant="outline"
                  className="border-primary/40 text-primary hover:bg-primary/10"
                >
                  <Plus className="h-4 w-4 mr-2" /> New Note
                </Button>
                <Button
                  onClick={() => {
                    if (!tierAllowsEdit) { openPaywall('template'); return; }
                    setShowTemplateDialog(true);
                  }}
                  variant="ghost"
                  className="text-foreground/60 hover:text-foreground"
                >
                  <Layout className="h-4 w-4 mr-2" /> From Template
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right comments sidebar */}
      {showComments && activeNoteId && (
        <NoteCommentsSidebar
          comments={comments}
          noteId={activeNoteId}
          open={showComments}
          onClose={() => setShowComments(false)}
          onAddComment={(blockId, anchorText, content) =>
            addComment({
              noteId: activeNoteId,
              blockId,
              anchorText,
              authorId: userId,
              authorName: userName,
              authorEmail: userEmail,
              content,
              parentCommentId: null,
              resolved: false,
              resolvedBy: null,
              resolvedAt: null,
              reactions: {},
            })
          }
          onReply={(parentCommentId, content) =>
            addComment({
              noteId: activeNoteId,
              blockId: '',
              anchorText: '',
              authorId: userId,
              authorName: userName,
              authorEmail: userEmail,
              content,
              parentCommentId,
              resolved: false,
              resolvedBy: null,
              resolvedAt: null,
              reactions: {},
            })
          }
          onResolve={(commentId) => resolveComment(activeNoteId, commentId, userId)}
          onUnresolve={(commentId) => unresolveComment(activeNoteId, commentId)}
          onDelete={(commentId) => deleteComment(activeNoteId, commentId)}
          onEditComment={(commentId, content) => editComment(activeNoteId, commentId, content)}
          onReact={(commentId, emoji) => addReaction(activeNoteId, commentId, emoji, userId)}
          currentUserId={userId}
        />
      )}

      {/* Dialogs */}
      {activeNoteId && note && (
        <NoteShareDialog
          open={showShareDialog}
          onClose={() => setShowShareDialog(false)}
          note={note}
          isOwner={isOwner}
          onAddCollaborator={handleAddCollaborator}
          onRemoveCollaborator={handleRemoveCollaborator}
          onUpdatePermission={handleUpdateCollaboratorPermission}
          onEnablePublicLink={handleEnablePublicLink}
          onDisablePublicLink={handleDisablePublicLink}
          onSendInvites={handleSendInvites}
        />
      )}

      <NoteTemplateDialog
        open={showTemplateDialog}
        onClose={() => setShowTemplateDialog(false)}
        onSelectTemplate={handleSelectTemplate}
      />

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        currentTier={tier}
        trigger={paywallTrigger}
      />
    </div>
  );
}
