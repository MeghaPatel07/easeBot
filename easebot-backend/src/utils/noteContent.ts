/**
 * Convert LLM-produced plain text (or light markdown) into the Tiptap
 * ProseMirror JSON doc shape expected by the frontend NoteEditor.
 *
 * Frontend schema (see `Wedding-Ease-Viva-Chat/src/components/notes/NoteEditor.tsx`):
 *   { type: 'doc', content: [ { type: 'paragraph', content: [ { type: 'text', text: '...' } ] }, ... ] }
 *
 * - Splits input on blank lines (double newline) to form paragraphs.
 * - Preserves single-newline line breaks within a paragraph as `hardBreak` nodes.
 * - Empty paragraphs are emitted with no children (valid Tiptap empty paragraph).
 * - If `text` already parses to a `{ type: 'doc', ... }` object, it is passed
 *   through unchanged.
 *
 * The return value is a JSON-serialized string (the `notes` collection's
 * `content` field is a JSON string, not an object — see notesService).
 */
export function plainTextToEditorContent(text: string | null | undefined): string {
  const raw = (text ?? '').toString()

  // Pass-through: if the caller already produced a valid Tiptap doc.
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object' && parsed.type === 'doc' && Array.isArray(parsed.content)) {
        return JSON.stringify(parsed)
      }
    } catch {
      // fall through to plain-text path
    }
  }

  if (!raw || trimmed === '') {
    return JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    })
  }

  // Normalize line endings, then split into paragraphs on blank lines.
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const paragraphs = normalized.split(/\n{2,}/)

  const content = paragraphs.map((para) => {
    if (para === '') {
      return { type: 'paragraph' }
    }
    // Within a paragraph, single newlines become hardBreak nodes.
    const lines = para.split('\n')
    const inline: Array<Record<string, any>> = []
    lines.forEach((line, idx) => {
      if (line.length > 0) {
        inline.push({ type: 'text', text: line })
      }
      if (idx < lines.length - 1) {
        inline.push({ type: 'hardBreak' })
      }
    })
    if (inline.length === 0) {
      return { type: 'paragraph' }
    }
    return { type: 'paragraph', content: inline }
  })

  return JSON.stringify({ type: 'doc', content })
}
