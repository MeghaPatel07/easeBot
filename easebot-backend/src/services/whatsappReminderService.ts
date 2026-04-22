/**
 * WhatsApp helper for reminder notifications — Wasender API adapter.
 *
 * Wasender (wasenderapi.com) uses an unofficial WhatsApp session, so we send
 * freeform text messages — no HSM template approval needed. The reminder body
 * is built inline from the title/date/description.
 *
 * Env vars:
 *   WASENDER_API_KEY       (required) — bearer token from Wasender dashboard
 *   WASENDER_API_URL       (optional) — override endpoint for self-hosted /
 *                                       alt versions. Defaults to the public API.
 *
 * Dry-run mode: if WASENDER_API_KEY is unset, log and return without throwing.
 */

import { capture as phCapture } from '../lib/posthog'

interface SendWhatsAppArgs {
  phone: string
  title: string
  humanFormattedDate: string
  description?: string | null
}

const DEFAULT_WASENDER_ENDPOINT = 'https://wasenderapi.com/api/send-message'

/**
 * Normalize a phone number the same way the frontend does:
 *   - strip every non-digit character
 *   - drop a single leading 0
 *   - if 10 digits remain and there's no country code, prepend 91 (India)
 */
export function normalizePhoneNumber(raw: string): string {
  let digits = (raw || '').replace(/\D+/g, '')
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 10) digits = '91' + digits
  return digits
}

function buildReminderText(args: SendWhatsAppArgs): string {
  const lines = [
    '⏰ Reminder from WeddingEase',
    '',
    args.title,
    `📅 ${args.humanFormattedDate}`,
  ]
  if (args.description && args.description.trim().length > 0) {
    lines.push('', args.description.trim())
  }
  lines.push('', 'Open your planner: https://theweddingbot.ai/chat')
  return lines.join('\n')
}

export async function sendWhatsAppReminder(
  args: SendWhatsAppArgs,
): Promise<void> {
  const apiKey = process.env.WASENDER_API_KEY
  if (!apiKey) {
    console.warn(
      '[whatsappReminderService] WASENDER_API_KEY not set, skipping (dry-run mode)',
    )
    return
  }

  const url = process.env.WASENDER_API_URL || DEFAULT_WASENDER_ENDPOINT
  const to = normalizePhoneNumber(args.phone)
  if (!to) throw new Error('WhatsApp send failed: empty phone number')

  const text = buildReminderText(args)

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: `+${to}`, text }),
    })
  } catch (err) {
    phCapture('system', 'whatsapp_reminder_failed', {
      error: err instanceof Error ? err.name : 'network_error',
    })
    throw err
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    phCapture('system', 'whatsapp_reminder_failed', {
      error: `wasender_${res.status}`,
    })
    throw new Error(`Wasender API error ${res.status}: ${body}`)
  }
}
