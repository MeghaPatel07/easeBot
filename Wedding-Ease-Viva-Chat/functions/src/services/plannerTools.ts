/**
 * OpenAI function/tool definitions for the Planner Agent.
 * These are passed to the LLM so it can call structured actions.
 */
import * as admin from 'firebase-admin'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'

const db = admin.firestore()
import {
  createChecklist,
  editChecklistItem,
  toggleItemDone,
  getChecklistStats,
  getChecklistCount,
} from './checklistService'
import { webSearch, formatSearchResults } from './webSearch'
import type { ToolAction } from '../types'

// ── Web search tool (available to all modes) ─────────────────────────────────

export const WEB_SEARCH_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      'Search the web for real-time, up-to-date information. Use this when the user asks about: current vendor prices, local wedding venues/vendors/services, availability, recent trends, reviews, "near me" queries, or any question where current data would improve the answer. Always prefer searching over guessing when the answer might have changed recently.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'The search query. Be specific — include location, budget range, or wedding-specific keywords for best results.',
        },
      },
      required: ['query'],
    },
  },
}

// ── Planner-specific tools ────────────────────────────────────────────────────

export const PLANNER_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_checklist',
      description: 'Save a checklist to the user\'s planner. Call this when the user says "save this", "create a checklist", or asks you to persist a list of tasks. Include due dates when mentioned or when reasonable deadlines can be inferred (e.g. "Book venue by June 15").',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'A short title for the checklist, e.g. "Haldi Ceremony Checklist"' },
          items: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of task strings to save',
          },
          due_dates: {
            type: 'array',
            items: { type: ['string', 'null'] },
            description: 'Optional array of ISO date strings (YYYY-MM-DD) for each item. Use null for items without a deadline. Must be same length as items array.',
          },
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
          checklist_id: { type: 'string', description: 'The ID of the checklist' },
          item_id: { type: 'string', description: 'The ID of the item to edit' },
          new_text: { type: 'string', description: 'The new text for the item' },
        },
        required: ['checklist_id', 'item_id', 'new_text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_as_done',
      description: 'Toggle the completed status of a checklist item. Call this when the user says they finished a task.',
      parameters: {
        type: 'object',
        properties: {
          checklist_id: { type: 'string', description: 'The ID of the checklist' },
          item_id: { type: 'string', description: 'The ID of the item to mark as done' },
        },
        required: ['checklist_id', 'item_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_checklist_stats',
      description: 'Get a summary of the user\'s planning progress — how many tasks are To-Do vs. Completed. Call this when the user asks "How am I doing?" or wants a progress summary.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
]

export interface ToolCallResult {
  toolName: string
  result: string
  action: ToolAction
}

/**
 * Execute a single tool call from the LLM and return a plain-text result
 * to feed back into the second LLM call.
 */
export async function executeToolCall(
  uid: string,
  toolName: string,
  args: Record<string, any>,
  isPremium: boolean
): Promise<ToolCallResult> {
  switch (toolName) {
    case 'create_checklist': {
      // Storage governance: tier-based checklist cap (PRICING_PRD §4)
      const { resolveTier: rt, getLimits: gl } = await import('../config/tierConfig')
      const profileSnap = await db.collection('users').doc(uid).get()
      const tier = rt(profileSnap.exists ? profileSnap.data() as any : null)
      const maxCl = gl(tier).maxChecklists
      if (maxCl !== null) {
        const count = await getChecklistCount(uid)
        if (count >= maxCl) {
          return {
            toolName,
            result: 'STORAGE_LIMIT_REACHED',
            action: { tool: 'create_checklist' },
          }
        }
      }
      const checklist = await createChecklist(uid, args.title, args.items, args.due_dates)
      return {
        toolName,
        result: `Checklist "${checklist.title}" created with ${checklist.items.length} items. ID: ${checklist.id}`,
        action: { tool: 'create_checklist', checklistId: checklist.id },
      }
    }

    case 'edit_checklist_item': {
      await editChecklistItem(uid, args.checklist_id, args.item_id, args.new_text)
      return {
        toolName,
        result: `Item updated to: "${args.new_text}"`,
        action: { tool: 'edit_checklist_item', checklistId: args.checklist_id, itemId: args.item_id },
      }
    }

    case 'mark_as_done': {
      const completed = await toggleItemDone(uid, args.checklist_id, args.item_id)
      return {
        toolName,
        result: `Item marked as ${completed ? 'completed' : 'incomplete'}.`,
        action: { tool: 'mark_as_done', checklistId: args.checklist_id, itemId: args.item_id },
      }
    }

    case 'get_checklist_stats': {
      const stats = await getChecklistStats(uid)
      return {
        toolName,
        result: `Planning stats: ${stats.todo} To-Do, ${stats.completed} Completed, ${stats.total} total tasks.`,
        action: { tool: 'get_checklist_stats' },
      }
    }

    case 'web_search': {
      const results = await webSearch(args.query)
      return {
        toolName,
        result: formatSearchResults(results),
        action: { tool: 'web_search', searchQuery: args.query },
      }
    }

    default:
      return {
        toolName,
        result: 'Unknown tool.',
        action: { tool: 'get_checklist_stats' },
      }
  }
}
