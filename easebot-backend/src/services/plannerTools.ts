import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import {
  createChecklist, editChecklistItem, toggleItemDone,
  getChecklistStats, countChecklists,
} from './checklistService'
import { createReminderDoc } from './reminderService'
import { createNote, appendToNote } from './notesService'
import { createTimelineEvent } from './timelineService'
import { humanizeLeadTime } from '../utils/dateTime'
import { plainTextToEditorContent } from '../utils/noteContent'
import type { ToolAction } from '../types'

// Hosts the LLM hallucinates when it doesn't have a real image URL (the
// planner / assistant / stylist / knowledge prompts all explicitly forbid
// these, but models occasionally emit them anyway). Drop matching URLs so
// the existing safety-net fallback to turnImageUrls has a chance to kick in,
// rather than letting a 404ing src land in the Firestore note doc.
const FAKE_IMAGE_HOSTS = [
  'cdn.openai.com',
  'example.com',
  'placeholder.com',
  'placehold.it',
]

function isLikelyRealImageUrl(u: unknown): u is string {
  if (typeof u !== 'string' || u.length === 0) return false
  if (!/^https?:\/\//i.test(u)) return false
  const lower = u.toLowerCase()
  if (FAKE_IMAGE_HOSTS.some(h => lower.includes(h))) return false
  if (lower.includes('placeholder.')) return false
  return true
}

export const CREATE_CHECKLIST_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'create_checklist',
    description: "Save a checklist to the user's planner. Call this when the user says 'save this', 'create a checklist', or asks to persist a list of tasks.",
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title, e.g. "Haldi Ceremony Checklist"' },
        items: { type: 'array', items: { type: 'string' }, description: 'List of task strings' },
      },
      required: ['title', 'items'],
    },
  },
}

export const EDIT_CHECKLIST_ITEM_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'edit_checklist_item',
    description: 'Update the text of a specific task in a checklist. Accepts either the UUID or a natural-language identifier — checklist_id may be the checklist title (e.g. "Wedding To-Dos") and item_id may be the item text (e.g. "Hire a caterer"). If you do not know the exact id, pass the closest title / text you have.',
    parameters: {
      type: 'object',
      properties: {
        checklist_id: { type: 'string', description: 'Checklist UUID or title' },
        item_id: { type: 'string', description: 'Item UUID or the current item text' },
        new_text: { type: 'string', description: 'The new text for the item' },
      },
      required: ['checklist_id', 'item_id', 'new_text'],
    },
  },
}

export const MARK_AS_DONE_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'mark_as_done',
    description: "Toggle completed status of a checklist item. Call when user says they finished a task. Accepts UUIDs or natural-language identifiers — checklist_id may be the checklist title and item_id may be the item text.",
    parameters: {
      type: 'object',
      properties: {
        checklist_id: { type: 'string', description: 'Checklist UUID or title' },
        item_id: { type: 'string', description: 'Item UUID or the current item text' },
      },
      required: ['checklist_id', 'item_id'],
    },
  },
}

export const GET_CHECKLIST_STATS_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'get_checklist_stats',
    description: "Get the user's planning progress summary. Call when user asks 'How am I doing?' or wants a progress overview.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

export const CREATE_REMINDER_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'create_reminder',
    description: "Save a first-party reminder. Call this when the user wants to set a reminder, save a date, schedule an appointment, or remember an upcoming event. We will notify the user via email or WhatsApp at their configured lead time before the event.",
    parameters: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'Short event title, e.g. "Haldi Ceremony"' },
        date:        { type: 'string', description: 'Date in YYYY-MM-DD format' },
        time:        { type: 'string', description: 'Optional time in HH:MM 24h format' },
        description: { type: 'string', description: 'Optional extra details about the event' },
        leadTimeMinutes: { type: 'number', description: 'Minutes before the event to notify. Default 1440 (24 hours). Examples: 60 = 1 hour, 360 = 6 hours, 10080 = 1 week' },
      },
      required: ['title', 'date'],
    },
  },
}

export const CREATE_NOTE_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'create_note',
    description: "Save a free-form note to the user's Notes tab. Call this when the user asks you to 'save a note', 'write this down', 'capture this idea', or wants to persist non-checklist prose (tips, inspiration, vendor notes, decisions). To attach images (e.g. from a just-run generate_image call), pass their URLs in image_urls — they will be embedded as block images below the body.",
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short note title, e.g. "Florist Meeting Notes"' },
        body:  { type: 'string', description: 'Full note content as plain text or light markdown' },
        tags:  { type: 'array', items: { type: 'string' }, description: 'Optional tags for organization' },
        image_urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional image URLs to embed in the note. Use the exact URLs returned by a prior generate_image tool call in this turn (they appear inside the tool result JSON) — do NOT invent placeholder URLs.',
        },
      },
      required: ['title', 'body'],
    },
  },
}

export const APPEND_TO_NOTE_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'append_to_note',
    description: "Append prose and/or images to an EXISTING note the user already owns. Call this whenever the user asks to 'add to my note', 'add this image to the bottom of the timeline note', 'append X to the vendor-notes note', etc. Do NOT call create_note for this — that would create a duplicate. Accepts either the note UUID or a natural-language title (e.g. 'Wedding Planning Timeline'); when unsure of the exact title, pass the closest title you have. image_urls MUST be valid http(s) URLs — source them from (a) a prior generate_image tool result in THIS turn, or (b) the 'url:' line of any Image attachment listed in the [Attached context] block at the top of the user message. Never invent URLs and never pass an empty array when the user asked you to attach an image.",
    parameters: {
      type: 'object',
      properties: {
        note_id: { type: 'string', description: 'Note UUID or title (fuzzy-matched)' },
        body:    { type: 'string', description: 'Optional text to append as new paragraphs at the bottom of the note' },
        image_urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional image URLs to embed as block images at the bottom. Use exact URLs from a prior generate_image tool call.',
        },
      },
      required: ['note_id'],
    },
  },
}

export const CREATE_TIMELINE_EVENT_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'create_timeline_event',
    description: "Add an event to the user's wedding Timeline. Call this when the user wants to anchor a milestone, ceremony, or dated moment on their timeline (e.g. 'add the sangeet to my timeline on June 12'). Use create_reminder instead if they want a notification; use this for pure timeline anchoring.",
    parameters: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'Short event title, e.g. "Sangeet Ceremony"' },
        date:        { type: 'string', description: 'Date in YYYY-MM-DD format (ISO)' },
        description: { type: 'string', description: 'Optional extra details' },
        category:    { type: 'string', description: 'Optional category, e.g. "ceremony", "logistics", "vendor"' },
      },
      required: ['title', 'date'],
    },
  },
}

export interface ToolCallOutcome {
  result: string
  action: ToolAction
}

export interface ToolCallContext {
  /**
   * Image URLs attached to the CURRENT user turn (from `attachments[]` with
   * kind='image'). Used as a safety-net fallback when the LLM calls
   * create_note / append_to_note asking "add this image" but forgets to echo
   * the URL into image_urls. Keeps "add this image to that note" working
   * even if the model's tool-argument fidelity slips.
   */
  turnImageUrls?: string[]
}

export async function executeToolCall(
  uid: string,
  toolName: string,
  args: Record<string, any>,
  isPremium: boolean,
  userEmail?: string | null,
  context?: ToolCallContext,
): Promise<ToolCallOutcome> {
  if (!uid) {
    return {
      result: 'Please sign in to save checklists, notes, and reminders.',
      action: { tool: (toolName as ToolAction['tool']) ?? 'get_checklist_stats', blocked: 'no_auth' },
    }
  }
  switch (toolName) {
    case 'create_checklist': {
      if (!isPremium) {
        const existingCount = await countChecklists(uid)
        if (existingCount >= 5) {
          return {
            result: 'Free plan is limited to 5 checklists. Upgrade to Pro to add more.',
            action: { tool: 'create_checklist', blocked: 'free_limit' },
          }
        }
      }
      const checklist = await createChecklist(uid, args.title, args.items)
      // Surface per-item ids so the LLM can reference individual items on the
      // same turn (history omits tool messages, so ids are otherwise lost).
      const itemLines = checklist.items
        .map(i => `- ${i.text} [item_id: ${i.id}]`)
        .join('\n')
      return {
        result: `Checklist "${checklist.title}" saved (checklist_id: ${checklist.id}).\nItems:\n${itemLines}`,
        action: {
          tool: 'create_checklist',
          checklistId: checklist.id,
          checklistTitle: checklist.title,
          checklistItems: checklist.items.map(i => i.text),
        },
      }
    }
    case 'edit_checklist_item': {
      try {
        const r = await editChecklistItem(uid, args.checklist_id, args.item_id, args.new_text)
        return {
          result: `Updated "${r.checklistTitle}" — item now reads "${args.new_text}".`,
          action: { tool: 'edit_checklist_item', checklistId: r.checklistId, itemId: r.itemId },
        }
      } catch (err: any) {
        const msg = err?.message ?? 'unknown error'
        return {
          result: `Could not edit checklist item: ${msg}`,
          action: { tool: 'edit_checklist_item', checklistId: args.checklist_id, itemId: args.item_id },
        }
      }
    }
    case 'mark_as_done': {
      try {
        const r = await toggleItemDone(uid, args.checklist_id, args.item_id)
        return {
          result: `"${r.itemText}" in "${r.checklistTitle}" marked as ${r.completed ? 'completed ✅' : 'incomplete'}.`,
          action: { tool: 'mark_as_done', checklistId: r.checklistId, itemId: r.itemId },
        }
      } catch (err: any) {
        const msg = err?.message ?? 'unknown error'
        return {
          result: `Could not toggle item: ${msg}`,
          action: { tool: 'mark_as_done', checklistId: args.checklist_id, itemId: args.item_id },
        }
      }
    }
    case 'get_checklist_stats': {
      const stats = await getChecklistStats(uid)
      return {
        result: `${stats.todo} To-Do, ${stats.completed} Completed, ${stats.total} total tasks.`,
        action: { tool: 'get_checklist_stats' },
      }
    }
    // `save_reminder` kept as an alias to avoid breaking the planner prompt
    // mid-rewrite — both names route to the same handler.
    case 'save_reminder':
    case 'create_reminder': {
      try {
        const leadTimeMinutes =
          typeof args.leadTimeMinutes === 'number' ? args.leadTimeMinutes : undefined
        const { id, channel } = await createReminderDoc({
          userId: uid,
          title: args.title,
          eventDateStr: args.date,
          eventTimeStr: args.time ?? null,
          description: args.description ?? null,
          leadTimeMinutes,
          source: 'chat',
        })
        const humanLead = humanizeLeadTime(leadTimeMinutes ?? 1440)
        const channelLabel = channel === 'email' ? 'email' : 'WhatsApp'
        return {
          result: `Reminder set — we'll notify you via ${channelLabel} ${humanLead} before "${args.title}".`,
          action: { tool: 'create_reminder', reminderId: id, reminderTitle: args.title },
        }
      } catch (err: any) {
        const msg = err?.message ?? 'unknown error'
        return {
          result: `Could not create reminder: ${msg}`,
          action: { tool: 'create_reminder' },
        }
      }
    }
    case 'create_note': {
      try {
        let imageUrls = Array.isArray(args.image_urls)
          ? args.image_urls.filter(isLikelyRealImageUrl)
          : []
        // Same safety net as append_to_note — use the turn's attached images
        // if the LLM forgot to echo them (or hallucinated a fake URL that
        // isLikelyRealImageUrl stripped out).
        if (imageUrls.length === 0 && context?.turnImageUrls?.length) {
          imageUrls = context.turnImageUrls.slice()
        }
        console.log('[tool:create_note]', {
          title: args.title,
          bodyLen: (args.body ?? '').length,
          argImageUrls: Array.isArray(args.image_urls) ? args.image_urls.length : 0,
          turnImageUrls: context?.turnImageUrls?.length ?? 0,
          finalImageUrls: imageUrls.length,
          firstUrl: imageUrls[0] ?? null,
        })
        const note = await createNote(uid, userEmail ?? '', {
          title: args.title,
          content: plainTextToEditorContent(args.body, imageUrls),
          tags: Array.isArray(args.tags) ? args.tags : [],
        })
        const imgSuffix = imageUrls.length > 0 ? ` with ${imageUrls.length} image${imageUrls.length > 1 ? 's' : ''}` : ''
        return {
          result: `Note "${note.title}" saved to Notes${imgSuffix}.`,
          action: { tool: 'create_note', noteId: note.id, noteTitle: note.title },
        }
      } catch (err: any) {
        const msg = err?.message ?? 'unknown error'
        console.error('[tool:create_note] error:', msg, err)
        return {
          result: `Could not create note: ${msg}`,
          action: { tool: 'create_note' },
        }
      }
    }
    case 'append_to_note': {
      try {
        let imageUrls = Array.isArray(args.image_urls)
          ? args.image_urls.filter(isLikelyRealImageUrl)
          : []
        const body = typeof args.body === 'string' ? args.body : ''
        // Safety net: if the LLM called append_to_note without image_urls — or
        // with only hallucinated URLs stripped by isLikelyRealImageUrl — but
        // the user's turn had image context, use that instead. Prevents the
        // "add this image to that note" UX from failing silently.
        if (imageUrls.length === 0 && context?.turnImageUrls?.length) {
          imageUrls = context.turnImageUrls.slice()
        }
        console.log('[tool:append_to_note]', {
          noteIdArg: args.note_id,
          bodyLen: body.length,
          argImageUrls: Array.isArray(args.image_urls) ? args.image_urls.length : 0,
          turnImageUrls: context?.turnImageUrls?.length ?? 0,
          finalImageUrls: imageUrls.length,
          firstUrl: imageUrls[0] ?? null,
        })
        if (!body.trim() && imageUrls.length === 0) {
          console.warn('[tool:append_to_note] empty payload — returning error to LLM')
          return {
            result: "append_to_note failed: no content to append. Pass either `body` (text) or `image_urls` (http(s) URLs). If the user attached an image, copy the url from the [Attached context] block of the user message into image_urls.",
            action: { tool: 'append_to_note' },
          }
        }
        const r = await appendToNote(uid, args.note_id, { body, imageUrls })
        console.log('[tool:append_to_note] success', { noteId: r.id, title: r.title, appendedImages: r.appendedImages })
        const imgSuffix = r.appendedImages > 0
          ? ` with ${r.appendedImages} image${r.appendedImages > 1 ? 's' : ''}`
          : ''
        return {
          result: `Appended${imgSuffix} to note "${r.title}" (note_id: ${r.id}).`,
          action: { tool: 'append_to_note', noteId: r.id, noteTitle: r.title },
        }
      } catch (err: any) {
        const msg = err?.message ?? 'unknown error'
        console.error('[tool:append_to_note] error:', msg, err)
        return {
          result: `Could not append to note: ${msg}`,
          action: { tool: 'append_to_note' },
        }
      }
    }
    case 'create_timeline_event': {
      try {
        const ev = await createTimelineEvent(uid, userEmail ?? '', {
          title: args.title,
          date: args.date,
          description: args.description ?? null,
          category: args.category ?? null,
        })
        return {
          result: `Timeline event "${ev.title}" added for ${ev.date}.`,
          action: { tool: 'create_timeline_event', timelineEventId: ev.id, timelineEventTitle: ev.title },
        }
      } catch (err: any) {
        const msg = err?.message ?? 'unknown error'
        return {
          result: `Could not add timeline event: ${msg}`,
          action: { tool: 'create_timeline_event' },
        }
      }
    }
    default:
      return { result: 'Unknown tool.', action: { tool: 'get_checklist_stats' } }
  }
}
