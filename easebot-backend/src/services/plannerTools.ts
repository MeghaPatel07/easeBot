import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import {
  createChecklist, editChecklistItem, toggleItemDone,
  getChecklistStats, getChecklistCount,
} from './checklistService'
import type { ToolAction, CalendarEvent } from '../types'

export const PLANNER_TOOLS: ChatCompletionTool[] = [
  {
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
  },
  {
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
  },
  {
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
  },
  {
    type: 'function',
    function: {
      name: 'get_checklist_stats',
      description: "Get the user's planning progress summary. Call when user asks 'How am I doing?' or wants a progress overview.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_reminder',
      description: "Save a calendar reminder or appointment. Call this when the user wants to set a reminder, save a date, schedule an appointment, or remember an upcoming event.",
      parameters: {
        type: 'object',
        properties: {
          title:       { type: 'string', description: 'Short event title, e.g. "Haldi Ceremony"' },
          date:        { type: 'string', description: 'Date in YYYY-MM-DD format' },
          time:        { type: 'string', description: 'Optional time in HH:MM 24h format' },
          description: { type: 'string', description: 'Optional extra details about the event' },
        },
        required: ['title', 'date'],
      },
    },
  },
]

export interface ToolCallOutcome {
  result: string
  action: ToolAction
  calendarEvent?: CalendarEvent
}

export async function executeToolCall(
  uid: string,
  toolName: string,
  args: Record<string, any>,
  isPremium: boolean
): Promise<ToolCallOutcome> {
  switch (toolName) {
    case 'create_checklist': {
      // No storage limit — allow unlimited checklists for all users
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
    case 'save_reminder': {
      const calendarEvent: CalendarEvent = {
        title: args.title,
        date: args.date,
        ...(args.time        ? { time: args.time }               : {}),
        ...(args.description ? { description: args.description } : {}),
      }
      return {
        result: `Reminder saved: "${args.title}" on ${args.date}${args.time ? ' at ' + args.time : ''}.`,
        action: { tool: 'save_reminder' },
        calendarEvent,
      }
    }
    default:
      return { result: 'Unknown tool.', action: { tool: 'get_checklist_stats' } }
  }
}
