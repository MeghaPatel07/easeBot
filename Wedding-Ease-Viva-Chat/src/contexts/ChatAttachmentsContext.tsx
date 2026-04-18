import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// ChatAttachmentsContext
// -----------------------------------------------------------------------------
// Sprint wave 1 (owned by DEV-Notes):
//   Provides a cross-surface "staging tray" of artifacts the user wants to
//   attach to their next chat message. Notes / Checklists / Timelines /
//   images / files can all be added from anywhere in the app (e.g. from
//   NoteEditor's "Attach to chat" button) and will later be rendered as
//   chips above the ChatInput textarea in Wave 2.
//
// Wave 2 integration contract (DEV-E + backend):
//   - ChatInput.tsx will consume this context via useChatAttachments() and
//     render a row of attachment chips above its textarea. On send, ChatInput
//     should serialize `attachments` into the chat payload (e.g. a new
//     `attachments: Attachment[]` field on the POST /chat request body) and
//     then call clearAttachments() on success.
//   - Backend chatController.ts must read that `attachments` array and, for
//     each entry, inject a contextual system/user-message fragment so the
//     LLM can reason about the attached artifact. Suggested shape on the
//     wire (JSON-serializable, safe to send):
//         {
//           kind: 'note' | 'checklist' | 'timeline' | 'image' | 'file',
//           id: string,
//           title: string,
//           preview?: string,   // short snippet for UI + logs
//           payload: unknown    // kind-specific data the LLM needs
//         }
//     For `note`, payload = { noteId, content } (content is Tiptap JSON
//     stringified; the backend should extract plain text before prompting).
//
// Mount point:
//   TODO(DEV-F): wrap <ChatAttachmentsProvider> around the app in
//   src/App.tsx (or src/pages/Index.tsx if app-wide isn't feasible) so both
//   the Notes surface and the Chat surface share a single tray. Do NOT
//   mount here — DEV-F owns App.tsx / Index.tsx this sprint to avoid
//   merge conflicts.
// ─────────────────────────────────────────────────────────────────────────────

export type ChatAttachmentKind =
  | 'note'
  | 'checklist'
  | 'timeline'
  | 'image'
  | 'file';

export interface ChatAttachment {
  /** Discriminator for rendering + backend routing. */
  kind: ChatAttachmentKind;
  /** Stable id of the underlying artifact (e.g. noteId). Used for dedup. */
  id: string;
  /** Human-readable label shown in the chip. */
  title: string;
  /** Optional short preview for the chip tooltip / log. */
  preview?: string;
  /** Kind-specific data passed to the backend. Keep JSON-serializable. */
  payload: unknown;
}

interface ChatAttachmentsContextValue {
  attachments: ChatAttachment[];
  addAttachment: (attachment: ChatAttachment) => void;
  removeAttachment: (id: string, kind?: ChatAttachmentKind) => void;
  clearAttachments: () => void;
}

const ChatAttachmentsContext = createContext<ChatAttachmentsContextValue | null>(
  null,
);

export function ChatAttachmentsProvider({ children }: { children: ReactNode }) {
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);

  const addAttachment = useCallback((attachment: ChatAttachment) => {
    setAttachments((prev) => {
      // Dedup on (kind, id) so re-clicking "Attach to chat" is idempotent.
      const exists = prev.some(
        (a) => a.id === attachment.id && a.kind === attachment.kind,
      );
      if (exists) return prev;
      return [...prev, attachment];
    });
  }, []);

  const removeAttachment = useCallback(
    (id: string, kind?: ChatAttachmentKind) => {
      setAttachments((prev) =>
        prev.filter((a) => !(a.id === id && (kind ? a.kind === kind : true))),
      );
    },
    [],
  );

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const value = useMemo<ChatAttachmentsContextValue>(
    () => ({ attachments, addAttachment, removeAttachment, clearAttachments }),
    [attachments, addAttachment, removeAttachment, clearAttachments],
  );

  return (
    <ChatAttachmentsContext.Provider value={value}>
      {children}
    </ChatAttachmentsContext.Provider>
  );
}

/**
 * Hook to read/mutate the chat attachment tray.
 *
 * Safe to call from surfaces where the provider may not yet be mounted
 * (Wave 1 — DEV-F hasn't mounted it yet): returns a no-op shim instead of
 * throwing so Notes-side "Attach to chat" degrades gracefully. Once DEV-F
 * mounts the provider in Wave 2, this returns the live store.
 */
export function useChatAttachments(): ChatAttachmentsContextValue {
  const ctx = useContext(ChatAttachmentsContext);
  if (ctx) return ctx;
  // No-op fallback. Intentionally silent in production; warn in dev so the
  // missing-provider case is discoverable.
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      '[ChatAttachmentsContext] Provider not mounted yet. ' +
        'Attachments will be dropped until DEV-F wires <ChatAttachmentsProvider> at the app root.',
    );
  }
  return {
    attachments: [],
    addAttachment: () => {},
    removeAttachment: () => {},
    clearAttachments: () => {},
  };
}
