import React, { useState, useMemo } from 'react';
import {
  X, MessageSquare, CheckCircle2, Circle, Trash2, Reply, Send, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { NoteComment } from '@/types/notes';
import { track } from '@/lib/analytics';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface NoteCommentsSidebarProps {
  comments: NoteComment[];
  open: boolean;
  onClose: () => void;
  onAddComment: (blockId: string, anchorText: string, content: string) => void;
  onReply: (parentCommentId: string, content: string) => void;
  onResolve: (commentId: string) => void;
  onUnresolve: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  onEditComment: (commentId: string, content: string) => void;
  onReact: (commentId: string, emoji: string) => void;
  currentUserId: string;
  /** Analytics context — passed through from NotesView so we can attribute
   *  comment events to the active note. Optional so existing callers don't
   *  break while Agent D/F threads it in. */
  noteId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const PRESET_REACTIONS = ['\u{1F44D}', '\u{2764}\u{FE0F}', '\u{1F60A}', '\u{1F389}', '\u{1F440}'];

function formatTimestamp(ts: any): string {
  if (!ts) return '';
  const date = typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const NoteCommentsSidebar: React.FC<NoteCommentsSidebarProps> = ({
  comments, open, onClose, onAddComment, onReply,
  onResolve, onUnresolve, onDelete, onEditComment, onReact, currentUserId,
  noteId,
}) => {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [newCommentText, setNewCommentText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Group comments into threads: top-level comments + their replies
  const threads = useMemo(() => {
    const topLevel = comments
      .filter(c => !c.parentCommentId && !c.isDeleted)
      .sort((a, b) => {
        const aTime = typeof (a.createdAt as any)?.toDate === 'function' ? (a.createdAt as any).toDate() : new Date(a.createdAt as any);
        const bTime = typeof (b.createdAt as any)?.toDate === 'function' ? (b.createdAt as any).toDate() : new Date(b.createdAt as any);
        return bTime.getTime() - aTime.getTime();
      });

    return topLevel.map(parent => ({
      parent,
      replies: comments
        .filter(c => c.parentCommentId === parent.id && !c.isDeleted)
        .sort((a, b) => {
          const aTime = typeof (a.createdAt as any)?.toDate === 'function' ? (a.createdAt as any).toDate() : new Date(a.createdAt as any);
          const bTime = typeof (b.createdAt as any)?.toDate === 'function' ? (b.createdAt as any).toDate() : new Date(b.createdAt as any);
          return aTime.getTime() - bTime.getTime();
        }),
    }));
  }, [comments]);

  const handleSubmitReply = (parentId: string) => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    onReply(parentId, trimmed);
    if (noteId) track('note_comment_added', { note_id: noteId });
    setReplyText('');
    setReplyingTo(null);
  };

  const handleAddTopComment = () => {
    const trimmed = newCommentText.trim();
    if (!trimmed) return;
    onAddComment('general', '', trimmed);
    if (noteId) track('note_comment_added', { note_id: noteId });
    setNewCommentText('');
  };

  const handleStartEdit = (comment: NoteComment) => {
    setEditingId(comment.id);
    setEditText(comment.content);
  };

  const handleSubmitEdit = (commentId: string) => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === '') return;
    onEditComment(commentId, trimmed);
    setEditingId(null);
    setEditText('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const activeCommentCount = comments.filter(c => !c.isDeleted && !c.parentCommentId).length;

  // Renders emoji reactions for a comment
  const renderReactions = (comment: NoteComment) => {
    const reactions = comment.reactions || {};
    const hasAnyReaction = Object.keys(reactions).length > 0;

    return (
      <div className="flex items-center gap-1 flex-wrap pt-1">
        {/* Existing reactions */}
        {Object.entries(reactions).map(([emoji, userIds]) => {
          const reacted = userIds.includes(currentUserId);
          return (
            <button
              key={emoji}
              onClick={() => onReact(comment.id, emoji)}
              className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md border transition-colors ${
                reacted
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-foreground/10 bg-foreground/[0.03] text-foreground/40 hover:bg-foreground/[0.06]'
              }`}
            >
              <span>{emoji}</span>
              <span>{userIds.length}</span>
            </button>
          );
        })}

        {/* Add reaction picker (collapsed into a + button) */}
        <div className="relative group">
          <button
            className="text-[10px] px-1.5 py-0.5 rounded-md border border-foreground/10 bg-foreground/[0.03] text-foreground/30 hover:bg-foreground/[0.06] hover:text-foreground/50 transition-colors"
          >
            +
          </button>
          <div className="absolute bottom-full left-0 mb-1 hidden group-hover:flex items-center gap-0.5 bg-surface-popover-alt/95 backdrop-blur-md border border-foreground/10 rounded-lg p-1 shadow-xl z-10">
            {PRESET_REACTIONS.map(emoji => (
              <button
                key={emoji}
                onClick={() => onReact(comment.id, emoji)}
                className="text-sm hover:bg-foreground/10 rounded p-1 transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Renders a single comment's content or edit field
  const renderCommentContent = (comment: NoteComment, textClass: string) => {
    if (editingId === comment.id) {
      return (
        <div className="flex items-center gap-1.5 pt-0.5">
          <input
            autoFocus
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSubmitEdit(comment.id);
              if (e.key === 'Escape') handleCancelEdit();
            }}
            className="flex-1 text-xs px-2 py-1.5 rounded-md bg-foreground/[0.06] border border-foreground/10 text-foreground/80 placeholder-foreground/25 outline-none focus:ring-1 focus:ring-primary/30"
          />
          <button
            onClick={() => handleSubmitEdit(comment.id)}
            disabled={!editText.trim()}
            className="p-1 rounded-md bg-primary/20 hover:bg-primary/30 text-primary disabled:opacity-30 transition-colors"
          >
            <Send className="h-2.5 w-2.5" />
          </button>
          <button
            onClick={handleCancelEdit}
            className="p-1 rounded-md hover:bg-foreground/10 text-foreground/30 hover:text-foreground/50 transition-colors"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      );
    }

    return (
      <p className={textClass}>
        {comment.content}
        {comment.isEdited && <span className="text-foreground/20 ml-1 text-[9px]">(edited)</span>}
      </p>
    );
  };

  return (
    <div
      className={`fixed right-0 top-0 h-full z-20 transition-transform duration-300 ease-in-out ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="w-72 h-full bg-overlay-scrim/40 backdrop-blur-md border-l border-foreground/10 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/[0.06] flex-shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary/60" />
            <h3 className="text-sm font-medium text-foreground/80">
              Comments
              {activeCommentCount > 0 && (
                <span className="ml-1.5 text-[10px] bg-primary/20 text-primary rounded-full px-1.5 py-0.5">
                  {activeCommentCount}
                </span>
              )}
            </h3>
          </div>
          <Button variant="ghost" className="h-7 w-7 p-0 rounded-lg hover:bg-foreground/10 text-foreground/40" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Comments list */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-3">
            {threads.length === 0 && (
              <div className="text-center py-8">
                <MessageSquare className="h-8 w-8 text-foreground/10 mx-auto mb-2" />
                <p className="text-xs text-foreground/25 italic">No comments yet</p>
              </div>
            )}

            {threads.map(({ parent, replies }) => (
              <div
                key={parent.id}
                className={`rounded-lg border p-3 space-y-2 ${
                  parent.resolved
                    ? 'border-foreground/5 bg-foreground/[0.02] opacity-60'
                    : 'border-foreground/10 bg-foreground/[0.04]'
                }`}
              >
                {/* Anchor text */}
                {parent.anchorText && (
                  <div className="flex items-start gap-1.5 pb-1.5 border-b border-foreground/[0.06]">
                    <span className="text-[10px] text-primary/50 mt-0.5">|</span>
                    <p className="text-[10px] text-foreground/30 italic line-clamp-2">
                      "{parent.anchorText}"
                    </p>
                  </div>
                )}

                {/* Parent comment */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] text-primary font-medium flex-shrink-0">
                      {parent.authorName?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="text-[10px] font-medium text-foreground/60 truncate">{parent.authorName}</span>
                    <span className="text-[9px] text-foreground/20 flex-shrink-0">{formatTimestamp(parent.createdAt)}</span>
                  </div>
                  {renderCommentContent(parent, 'text-xs text-foreground/70 leading-relaxed')}
                </div>

                {/* Reactions for parent */}
                {renderReactions(parent)}

                {/* Replies */}
                {replies.map(reply => (
                  <div key={reply.id} className="ml-4 pl-2 border-l border-foreground/[0.08] space-y-1">
                    <div className="flex items-center gap-1.5">
                      <div className="h-4 w-4 rounded-full bg-foreground/10 flex items-center justify-center text-[7px] text-foreground/50 font-medium flex-shrink-0">
                        {reply.authorName?.[0]?.toUpperCase() || '?'}
                      </div>
                      <span className="text-[10px] font-medium text-foreground/50 truncate">{reply.authorName}</span>
                      <span className="text-[9px] text-foreground/20 flex-shrink-0">{formatTimestamp(reply.createdAt)}</span>
                      {reply.authorId === currentUserId && (
                        <>
                          <button
                            onClick={() => handleStartEdit(reply)}
                            className="ml-auto p-0.5 rounded hover:bg-foreground/10 text-foreground/20 hover:text-foreground/50 transition-colors"
                          >
                            <Pencil className="h-2.5 w-2.5" />
                          </button>
                          <button
                            onClick={() => onDelete(reply.id)}
                            className="p-0.5 rounded hover:bg-foreground/10 text-foreground/20 hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        </>
                      )}
                    </div>
                    {renderCommentContent(reply, 'text-[11px] text-foreground/60 leading-relaxed')}
                    {renderReactions(reply)}
                  </div>
                ))}

                {/* Actions */}
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    onClick={() => parent.resolved ? onUnresolve(parent.id) : onResolve(parent.id)}
                    className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md transition-colors ${
                      parent.resolved
                        ? 'text-success/60 hover:bg-success/10'
                        : 'text-foreground/30 hover:bg-foreground/[0.06] hover:text-foreground/50'
                    }`}
                  >
                    {parent.resolved ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                    {parent.resolved ? 'Resolved' : 'Resolve'}
                  </button>
                  <button
                    onClick={() => { setReplyingTo(replyingTo === parent.id ? null : parent.id); setReplyText(''); }}
                    className="flex items-center gap-1 text-[10px] text-foreground/30 hover:text-foreground/50 px-2 py-0.5 rounded-md hover:bg-foreground/[0.06] transition-colors"
                  >
                    <Reply className="h-3 w-3" />
                    Reply
                  </button>
                  {parent.authorId === currentUserId && (
                    <>
                      <button
                        onClick={() => handleStartEdit(parent)}
                        className="flex items-center gap-1 text-[10px] text-foreground/30 hover:text-foreground/50 px-2 py-0.5 rounded-md hover:bg-foreground/[0.06] transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(parent.id)}
                        className="ml-auto p-0.5 rounded hover:bg-foreground/10 text-foreground/20 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>

                {/* Reply input */}
                {replyingTo === parent.id && (
                  <div className="flex items-center gap-1.5 pt-1">
                    <input
                      autoFocus
                      placeholder="Write a reply..."
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSubmitReply(parent.id)}
                      className="flex-1 text-xs px-2 py-1.5 rounded-md bg-foreground/[0.06] border border-foreground/10 text-foreground/80 placeholder-foreground/25 outline-none focus:ring-1 focus:ring-primary/30"
                    />
                    <button
                      onClick={() => handleSubmitReply(parent.id)}
                      disabled={!replyText.trim()}
                      className="p-1.5 rounded-md bg-primary/20 hover:bg-primary/30 text-primary disabled:opacity-30 transition-colors"
                    >
                      <Send className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* New comment input */}
        <div className="flex-shrink-0 border-t border-foreground/[0.06] p-3 space-y-2">
          <label className="text-[10px] text-foreground/30 font-medium uppercase tracking-wider">Add comment</label>
          <div className="flex items-center gap-1.5">
            <input
              placeholder="Write a comment..."
              value={newCommentText}
              onChange={e => setNewCommentText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddTopComment()}
              className="flex-1 text-xs px-2.5 py-2 rounded-lg bg-foreground/[0.06] border border-foreground/10 text-foreground/80 placeholder-foreground/25 outline-none focus:ring-1 focus:ring-primary/30"
            />
            <button
              onClick={handleAddTopComment}
              disabled={!newCommentText.trim()}
              className="p-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary disabled:opacity-30 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoteCommentsSidebar;
