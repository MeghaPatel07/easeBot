import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import {
  createChecklist, editChecklistItem, toggleItemDone,
  getChecklistStats,
} from './checklistService'
import { createReminderDoc } from './reminderService'
import { createNote } from './notesService'
import { createTimelineEvent } from './timelineService'
import { humanizeLeadTime } from '../utils/dateTime'
import { plainTextToEditorContent } from '../utils/noteContent'
import type { ToolAction } from '../types'

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
    description: 'Update the text of a specific task in a checklist.',
    parameters: {
      type: 'object',
      properties: {
        checklist_id: { type: 'string' },
        item_id: { type: 'string' },
        new_text: { type: 'string' },
      },
      required: ['checklist_id', 'item_id', 'new_text'],
    },
  },
}

export const MARK_AS_DONE_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'mark_as_done',
    description: "Toggle completed status of a checklist item. Call when user says they finished a task.",
    parameters: {
      type: 'object',
      properties: {
        checklist_id: { type: 'string' },
        item_id: { type: 'string' },
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
    description: "Save a free-form note to the user's Notes tab. Call this when the user asks you to 'save a note', 'write this down', 'capture this idea', or wants to persist non-checklist prose (tips, inspiration, vendor notes, decisions).",
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short note title, e.g. "Florist Meeting Notes"' },
        body:  { type: 'string', description: 'Full note content as plain text or light markdown' },
        tags:  { type: 'array', items: { type: 'string' }, description: 'Optional tags for organization' },
      },
      required: ['title', 'body'],
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

export async function executeToolCall(
  uid: string,
  toolName: string,
  args: Record<string, any>,
  _isPremium: boolean,
  userEmail?: string | null,
): Promise<ToolCallOutcome> {
  switch (toolName) {
    case 'create_checklist': {
      const checklist = await createChecklist(uid, args.title, args.items)
      return {
        result: `Checklist "${checklist.title}" saved with ${checklist.items.length} items. ID: ${checklist.id}`,
        action: {
          tool: 'create_checklist',
          checklistId: checklist.id,
          checklistTitle: checklist.title,
          checklistItems: checklist.items.map(i => i.text),
        },
      }
    }
    case 'edit_checklist_item': {
      await editChecklistItem(uid, args.checklist_id, args.item_id, args.new_text)
      return {
        result: `Item updated to: "${args.new_text}"`,
        action: { tool: 'edit_checklist_item', checklistId: args.checklist_id, itemId: args.item_id },
      }
    }
    case 'mark_as_done': {
      const completed = await toggleItemDone(uid, args.checklist_id, args.item_id)
      return {
        result: `Item marked as ${completed ? 'completed ✅' : 'incomplete'}.`,
        action: { tool: 'mark_as_done', checklistId: args.checklist_id, itemId: args.item_id },
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
        const { channel } = await createReminderDoc({
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
          action: { tool: 'create_reminder' },
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
        const note = await createNote(uid, userEmail ?? '', {
          title: args.title,
          content: plainTextToEditorContent(args.body),
          tags: Array.isArray(args.tags) ? args.tags : [],
        })
        return {
          result: `Note "${note.title}" saved to Notes.`,
          action: { tool: 'create_note', noteId: note.id, noteTitle: note.title },
        }
      } catch (err: any) {
        const msg = err?.message ?? 'unknown error'
        return {
          result: `Could not create note: ${msg}`,
          action: { tool: 'create_note' },
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
