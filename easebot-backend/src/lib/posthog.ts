/**
 * PostHog Node wrapper. Backend is source of truth for payments, tokens, tool calls.
 * See docs/PostHog-EVENTS.md for the event taxonomy contract.
 */
import { PostHog } from 'posthog-node'

const KEY = process.env.POSTHOG_PROJECT_KEY
const HOST = process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com'
const ENABLED = process.env.POSTHOG_ENABLED === 'true'

let client: PostHog | null = null

export function initPostHog(): PostHog | null {
  if (!ENABLED || !KEY) {
    console.log('[posthog] disabled (POSTHOG_ENABLED !== true or missing key)')
    return null
  }
  if (client) return client
  client = new PostHog(KEY, {
    host: HOST,
    flushAt: 20,
    flushInterval: 10_000,
    requestTimeout: 5_000,
  })
  console.log('[posthog] initialised')
  return client
}

type EventName =
  | 'otp_verified'
  | 'stream_started'
  | 'stream_completed'
  | 'stream_errored'
  | 'image_generated'
  | 'image_generation_failed'
  | 'transcription_failed'
  | 'tts_failed'
  | 'tool_invoked'
  | 'token_exhausted'
  | 'payu_initiated'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'subscription_renewed'
  | 'subscription_renewal_failed'
  | 'subscription_expired'
  | 'whatsapp_reminder_sent'
  | 'whatsapp_reminder_failed'
  | 'invoice_generated'
  | 'conversation_summarized'
  | 'circuit_breaker_opened'
  | 'llm_call_completed'
  | 'guest_cleanup_run'

/** Capture an event. `distinctId` should be the authenticated user id or the
 *  anonymous x-ph-distinct-id header from the client. Never throws. */
export function capture(
  distinctId: string,
  event: EventName,
  properties: Record<string, unknown> = {},
): void {
  if (!client) return
  try {
    client.capture({ distinctId, event, properties })
  } catch (err) {
    console.warn('[posthog] capture failed', err)
  }
}

/** Set user properties (`$set`). Never throws. */
export function identify(
  distinctId: string,
  properties: Record<string, unknown>,
): void {
  if (!client) return
  try {
    client.identify({ distinctId, properties })
  } catch (err) {
    console.warn('[posthog] identify failed', err)
  }
}

/** Evaluate a feature flag server-side. Falls back to `defaultValue`. */
export async function isFeatureEnabled(
  flagKey: string,
  distinctId: string,
  defaultValue = false,
): Promise<boolean> {
  if (!client) return defaultValue
  try {
    const v = await client.isFeatureEnabled(flagKey, distinctId)
    return v ?? defaultValue
  } catch {
    return defaultValue
  }
}

export async function shutdownPostHog(): Promise<void> {
  if (!client) return
  try {
    await client.shutdown()
    client = null
  } catch (err) {
    console.warn('[posthog] shutdown failed', err)
  }
}

export function getPostHogClient(): PostHog | null {
  return client
}
