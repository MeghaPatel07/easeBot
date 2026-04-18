/**
 * Convert LLM-produced markdown into the Tiptap ProseMirror JSON doc shape
 * expected by the frontend NoteEditor (StarterKit schema, heading levels 1–3).
 *
 * Supported block-level syntax: `# / ## / ###` headings, `>` blockquotes,
 * `- ` / `* ` bullet lists, `1. ` ordered lists, `---` horizontal rule, and
 * paragraphs separated by blank lines. Single newlines inside a paragraph
 * become `hardBreak` nodes.
 *
 * Supported inline marks: `**bold**`, `__bold__`, `*italic*`, `_italic_`,
 * `` `code` ``, `[text](url)` links.
 *
 * If `text` already parses to a valid `{ type: 'doc', ... }` object, it is
 * passed through unchanged (with any `imageUrls` appended).
 *
 * The return value is a JSON-serialized string (the `notes` collection's
 * `content` field is a JSON string, not an object — see notesService).
 */

type Node = Record<string, any>

function parseInline(text: string): Node[] {
  if (!text) return []
  const nodes: Node[] = []
  // Order matters: ** before *, __ before _
  const pattern =
    /\*\*([^\n*]+?)\*\*|__([^\n_]+?)__|\*([^\n*]+?)\*|_([^\n_]+?)_|`([^\n`]+?)`|\[([^\]\n]+?)\]\(([^)\s]+?)\)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    }
    if (match[1] !== undefined) {
      nodes.push({ type: 'text', text: match[1], marks: [{ type: 'bold' }] })
    } else if (match[2] !== undefined) {
      nodes.push({ type: 'text', text: match[2], marks: [{ type: 'bold' }] })
    } else if (match[3] !== undefined) {
      nodes.push({ type: 'text', text: match[3], marks: [{ type: 'italic' }] })
    } else if (match[4] !== undefined) {
      nodes.push({ type: 'text', text: match[4], marks: [{ type: 'italic' }] })
    } else if (match[5] !== undefined) {
      nodes.push({ type: 'text', text: match[5], marks: [{ type: 'code' }] })
    } else if (match[6] !== undefined && match[7] !== undefined) {
      nodes.push({
        type: 'text',
        text: match[6],
        marks: [{ type: 'link', attrs: { href: match[7] } }],
      })
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    nodes.push({ type: 'text', text: text.slice(lastIndex) })
  }
  return nodes
}

const BLOCK_STARTER = /^(#{1,3}\s|>\s?|\s*[-*]\s|\s*\d+\.\s|---+\s*$)/

export function parseMarkdownBlocks(text: string): Node[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const blocks: Node[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') {
      i++
      continue
    }

    if (/^---+\s*$/.test(line.trim())) {
      blocks.push({ type: 'horizontalRule' })
      i++
      continue
    }

    const hMatch = /^(#{1,3})\s+(.*)$/.exec(line)
    if (hMatch) {
      const inline = parseInline(hMatch[2])
      blocks.push({
        type: 'heading',
        attrs: { level: hMatch[1].length },
        content: inline.length > 0 ? inline : [{ type: 'text', text: hMatch[2] }],
      })
      i++
      continue
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      const inline = parseInline(quoteLines.join(' '))
      blocks.push({
        type: 'blockquote',
        content: [
          inline.length > 0
            ? { type: 'paragraph', content: inline }
            : { type: 'paragraph' },
        ],
      })
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      blocks.push({
        type: 'bulletList',
        content: items.map((item) => ({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: parseInline(item).length > 0 ? parseInline(item) : [{ type: 'text', text: item }],
            },
          ],
        })),
      })
      continue
    }

    const olStart = /^\s*(\d+)\.\s+/.exec(line)
    if (olStart) {
      const start = parseInt(olStart[1], 10)
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      const orderedNode: Node = {
        type: 'orderedList',
        content: items.map((item) => ({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: parseInline(item).length > 0 ? parseInline(item) : [{ type: 'text', text: item }],
            },
          ],
        })),
      }
      if (start !== 1) orderedNode.attrs = { start }
      blocks.push(orderedNode)
      continue
    }

    // Paragraph — collect consecutive non-empty, non-block lines
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !BLOCK_STARTER.test(lines[i])
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      const inline: Node[] = []
      paraLines.forEach((l, idx) => {
        const parsed = parseInline(l)
        if (parsed.length > 0) inline.push(...parsed)
        else inline.push({ type: 'text', text: l })
        if (idx < paraLines.length - 1) inline.push({ type: 'hardBreak' })
      })
      blocks.push(inline.length === 0 ? { type: 'paragraph' } : { type: 'paragraph', content: inline })
    }
  }

  return blocks.length > 0 ? blocks : [{ type: 'paragraph' }]
}

export function plainTextToEditorContent(
  text: string | null | undefined,
  imageUrls?: string[] | null,
): string {
  const raw = (text ?? '').toString()
  const images = (imageUrls ?? []).filter(
    (u): u is string => typeof u === 'string' && u.length > 0,
  )

  // Pass-through: if the caller already produced a valid Tiptap doc.
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (
        parsed &&
        typeof parsed === 'object' &&
        parsed.type === 'doc' &&
        Array.isArray(parsed.content)
      ) {
        if (images.length > 0) {
          parsed.content.push(...images.map((src) => ({ type: 'image', attrs: { src } })))
        }
        return JSON.stringify(parsed)
      }
    } catch {
      // fall through to markdown path
    }
  }

  const content = parseMarkdownBlocks(raw)

  for (const src of images) {
    content.push({ type: 'image', attrs: { src } })
  }

  return JSON.stringify({ type: 'doc', content })
}
