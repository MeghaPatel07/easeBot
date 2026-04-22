/**
 * PostHog analytics wrapper. All FE tracking goes through this module.
 * See docs/PostHog-EVENTS.md for the event taxonomy contract.
 */
import posthog, { PostHog } from 'posthog-js'

type EventName =
  | 'signup_started'
  | 'signup_completed'
  | 'signup_failed'
  | 'login_completed'
  | 'login_failed'
  | 'logout'
  | 'password_reset_requested'
  | 'password_reset_otp_verified'
  | 'password_reset_completed'
  | 'phone_otp_sent'
  | 'phone_otp_verified'
  | 'phone_otp_failed'
  | 'phone_otp_resent'
  | 'phone_device_mismatch_shown'
  | 'unverified_account_recovery_shown'
  | 'google_link_to_password_completed'
  | 'verification_method_chosen'
  | 'first_message_sent'
  | 'mode_selected'
  | 'guest_prompt_hit'
  | 'message_sent'
  | 'quick_prompt_clicked'
  | 'occasion_chip_selected'
  | 'help_me_decide_clicked'
  | 'stop_generation_clicked'
  | 'regenerate_clicked'
  | 'continue_generating_clicked'
  | 'tone_modifier_applied'
  | 'message_downloaded'
  | 'message_converted_to_table'
  | 'message_feedback_submitted'
  | 'chat_reset'
  | 'keyboard_shortcuts_shown'
  | 'quota_exceeded'
  | 'tool_error_shown'
  | 'stream_aborted_client'
  | 'voice_input_used'
  | 'voice_recording_started'
  | 'voice_recording_cancelled'
  | 'voice_permission_denied'
  | 'transcription_failed'
  | 'tts_closed'
  | 'tts_failed'
  | 'voice_preset_selected'
  | 'image_uploaded'
  | 'image_deleted_from_chat'
  | 'vibe_submitted'
  | 'custom_vibe_created'
  | 'gallery_filter_applied'
  | 'gallery_image_viewed'
  | 'note_created'
  | 'note_edited'
  | 'note_deleted'
  | 'note_favorited'
  | 'note_duplicated'
  | 'note_restored_from_trash'
  | 'note_shared'
  | 'note_comment_added'
  | 'note_template_applied'
  | 'note_paywall_shown'
  | 'folder_created'
  | 'note_moved_to_folder'
  | 'note_conflict_detected'
  | 'note_conflict_resolved'
  | 'note_draft_restored'
  | 'note_image_uploaded'
  | 'note_saved_explicit'
  | 'note_formatting_applied'
  | 'note_slash_command_used'
  | 'note_block_widget_used'
  | 'note_font_size_changed'
  | 'note_ai_command_invoked'
  | 'message_liked'
  | 'message_copied'
  | 'tts_played'
  | 'product_saved'
  | 'image_downloaded'
  | 'image_copied'
  | 'image_link_copied'
  | 'image_shared_to_social'
  | 'checklist_created'
  | 'checklist_item_toggled'
  | 'checklist_item_added'
  | 'checklist_item_deleted'
  | 'checklist_deleted'
  | 'checklist_shared'
  | 'timeline_event_created'
  | 'timeline_event_edited'
  | 'timeline_event_deleted'
  | 'planner_view_opened'
  | 'reminder_created'
  | 'reminder_edited'
  | 'reminder_dismissed'
  | 'reminder_snoozed'
  | 'thread_pinned'
  | 'thread_archived'
  | 'thread_deleted'
  | 'thread_renamed'
  | 'thread_tags_updated'
  | 'thread_searched'
  | 'thread_shared_link_created'
  | 'thread_shared_copied'
  | 'thread_shared_social'
  | 'thread_shared_native'
  | 'shared_thread_viewed'
  | 'ai_note_created'
  | 'ai_note_appended'
  | 'ai_checklist_created'
  | 'ai_checklist_item_edited'
  | 'ai_checklist_item_marked_done'
  | 'ai_timeline_event_created'
  | 'ai_reminder_created'
  | 'message_edited'
  | 'theme_toggled'
  | 'paywall_shown'
  | 'paywall_dismissed'
  | 'paywall_cta_clicked'
  | 'cap_hit_banner_shown'
  | 'guest_upgrade_clicked'
  | 'plan_viewed'
  | 'plan_selected'
  | 'token_meter_warning'
  | 'billing_cycle_toggled'
  | 'currency_overridden'
  | 'topup_clicked'
  | 'pricing_faq_opened'
  | 'upgrade_flow_opened'
  | 'upgrade_flow_abandoned'
  | 'downgrade_flow_opened'
  | 'downgrade_completed'
  | 'already_subscribed_banner_shown'
  | 'checkout_started'
  | 'checkout_form_validation_failed'
  | 'payu_redirect_started'
  | 'payment_abandoned'
  | 'payment_success_page_viewed'
  | 'payment_failure_page_viewed'
  | 'invoice_downloaded'
  | 'billing_portal_opened'
  | 'settings_opened'
  | 'settings_tab_switched'
  | 'ai_behavior_changed'
  | 'personalization_saved'
  | 'notification_pref_changed'
  | 'data_export_requested'
  | 'account_deleted'
  | 'analytics_consent_changed'
  | 'invite_partner_sent'
  | 'invite_partner_accepted'
  | 'feedback_submitted'
  | 'help_page_viewed'
  | 'firestore_subscription_failed'
  | 'network_offline'

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? '/ingest'
const ENABLED = import.meta.env.VITE_POSTHOG_ENABLED === 'true'

let ready = false

export function initAnalytics(): PostHog | null {
  if (import.meta.env.DEV) {
    ;(window as unknown as { posthog: PostHog }).posthog = posthog
    ;(window as unknown as { __phDebug: { enabled: boolean; key: string | undefined; host: string } }).__phDebug = {
      enabled: ENABLED,
      key: KEY,
      host: HOST,
    }
  }
  if (!ENABLED || !KEY) return null
  if (ready) return posthog
  posthog.init(KEY, {
    api_host: HOST,
    ui_host: 'https://us.posthog.com',
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: false,
    // Replay is opt-in per session (see startReplay). This flag only prevents
    // the SDK from auto-starting recording on init — startSessionRecording()
    // still works when we explicitly call it.
    disable_session_recording: true,
    person_profiles: 'identified_only',
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask],[data-ph-mask] *',
      // Block screenshot capture inside these selectors (useful for card inputs)
      blockSelector: '[data-ph-block],input[type=password]',
    },
    loaded: (ph) => {
      if (!sessionStorage.getItem('ph_session_start')) {
        sessionStorage.setItem('ph_session_start', String(Date.now()))
      }
      if (import.meta.env.DEV) ph.debug(false)
    },
  })
  ready = true
  return posthog
}

/**
 * Decide whether to record this session, then start recording if so.
 *
 * Cost-control rules (see docs/PostHog-EVENTS.md §7):
 *   - Paying users: 100%
 *   - Checkout page: 100%
 *   - Everyone else: 10% (deterministic per-session)
 *   - Minimum duration gate handled inside posthog-js via session_recording config
 */
export function startReplay(opts: {
  isPaying: boolean
  route?: string
}): void {
  if (!ENABLED || !ready) return
  const forceOn = opts.isPaying || (opts.route ?? '').includes('/checkout')
  let shouldRecord = forceOn
  if (!forceOn) {
    // Deterministic per-session sample so the same session either records fully
    // or not at all (prevents partial replays).
    const key = 'ph_replay_sample'
    let s = sessionStorage.getItem(key)
    if (s === null) {
      s = Math.random() < 0.1 ? '1' : '0'
      sessionStorage.setItem(key, s)
    }
    shouldRecord = s === '1'
  }
  try {
    if (shouldRecord) posthog.startSessionRecording()
    else posthog.stopSessionRecording?.()
  } catch {}
}

/** Fire-and-forget event capture. Never throws. */
export function track(event: EventName, props: Record<string, unknown> = {}): void {
  if (!ENABLED || !ready) return
  try {
    posthog.capture(event, props)
  } catch {
    /* swallow — analytics must never break UX */
  }
}

/** Identify a user. Call on login/signup with the Firebase UID. */
export function identify(
  userId: string,
  properties: Record<string, unknown> = {},
): void {
  if (!ENABLED || !ready) return
  try {
    posthog.identify(userId, properties)
  } catch {}
}

/** Link an anonymous distinct_id to the now-known user id (on signup). */
export function alias(newUserId: string): void {
  if (!ENABLED || !ready) return
  try {
    posthog.alias(newUserId)
  } catch {}
}

/** Clear identity on logout. */
export function reset(): void {
  if (!ENABLED || !ready) return
  try {
    posthog.reset()
  } catch {}
}

/** Merge super properties onto every subsequent event. */
export function register(props: Record<string, unknown>): void {
  if (!ENABLED || !ready) return
  try {
    posthog.register(props)
  } catch {}
}

/** Set properties on the user profile (`$set`). */
export function setUserProperties(props: Record<string, unknown>): void {
  if (!ENABLED || !ready) return
  try {
    posthog.setPersonProperties(props)
  } catch {}
}

/** Current distinct_id — pass to backend via x-ph-distinct-id header. */
export function getDistinctId(): string | null {
  if (!ENABLED || !ready) return null
  try {
    return posthog.get_distinct_id()
  } catch {
    return null
  }
}

/**
 * Feature flag read. Returns `defaultValue` when analytics is disabled or the
 * flag hasn't loaded yet. Flags are evaluated client-side off the bootstrapped
 * cache (see PostHog project → Feature flags → Bootstrap).
 */
export function isFeatureEnabled(flagKey: string, defaultValue = false): boolean {
  if (!ENABLED || !ready) return defaultValue
  try {
    const v = posthog.isFeatureEnabled(flagKey)
    return v === undefined ? defaultValue : v
  } catch {
    return defaultValue
  }
}

/** Variant value for a multivariate flag. Returns `defaultValue` if unset. */
export function getFeatureFlag(
  flagKey: string,
  defaultValue: string | boolean = false,
): string | boolean {
  if (!ENABLED || !ready) return defaultValue
  try {
    const v = posthog.getFeatureFlag(flagKey)
    return v === undefined ? defaultValue : v
  } catch {
    return defaultValue
  }
}

export { posthog }
