/**
 * observability — structured event logger for the pricing rollout.
 *
 * Emits one-line JSON to stdout with a fixed envelope. A downstream
 * collector (stackdriver, datadog, etc.) can filter by `event`.
 *
 * This is a log-only helper. It does NOT write to Firestore, because the
 * whole point of Sprint 4 observability is to stay out of the hot path.
 */

export type ObservabilityEvent =
  | 'payment_initiate'
  | 'payment_webhook_received'
  | 'payment_success'
  | 'payment_failure'
  | 'subscription_transition'
  | 'subscription_cancel'
  | 'subscription_reactivate'
  | 'subscription_upgrade'
  | 'subscription_downgrade'
  | 'subscription_period_end'
  | 'token_cap_hit_daily'
  | 'token_cap_hit_monthly'
  | 'guest_limit_hit'
  | 'topup_purchased'
  | 'invoice_rendered'
  | 'chat_burst_flag'
  | 'guest_signup'
  | 'free_upgrade_pro'
  | 'pro_upgrade_promax'
  | 'payment.webhook.side_effect_failed'
  | 'payment.webhook.transition_conflict'
  | 'payment.hash.mismatch'
  | 'subscription.credit_consumed'
  | 'subscription.invoice_queue_failed'
  | 'subscription.scheduler.tick'
  | 'invoice.render_failed'
  | 'invoice.authz_denied'

export function emit(
  event: ObservabilityEvent,
  attrs: Record<string, unknown> = {},
): void {
  try {
    const line = JSON.stringify({
      kind: 'obs',
      event,
      ts: new Date().toISOString(),
      ...attrs,
    })
    // eslint-disable-next-line no-console
    console.log(line)
  } catch {
    // Never throw from the observability path.
  }
}
