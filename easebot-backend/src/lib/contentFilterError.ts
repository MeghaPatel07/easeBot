// WE-20260527-353 — brand-agnostic content-filter detector.
//
// When Azure OpenAI's content management policy blocks a prompt (adversarial
// injection attempts, hate-speech triggers, etc.) the SDK throws an APIError
// whose message string leaks both the upstream provider name ("Azure OpenAI")
// and a Microsoft documentation URL. Bubbling that to the client is:
//   1. a security smell (reveals our LLM vendor + their docs URL),
//   2. confusing UX (HTTP 500 for what is logically a 400/422),
//   3. unbranded — does not invite the user back into wedding planning.
//
// This helper classifies an error as a content-filter event using two
// independent signals (SDK error code OR message substring) and produces the
// safe, brand-agnostic canned refusal the user will see.
//
// Used by chatController for both the non-stream (HTTP 422 JSON) and stream
// (SSE 200 with `t:"c"` + `t:"d"`) handlers — see the handler `catch` blocks.
//
// NOTE on the message substring matcher: the case-insensitive checks for
// "response was filtered" / "content management policy" / "content_filter" /
// the Microsoft fwlink host are deliberately broad and overlap. We accept
// false positives over false negatives — leaking the Azure error string is a
// P0 user-visible regression; surfacing the canned refusal on an unrelated
// error is recoverable (user retries, server logs preserve the raw error).

/** Substrings (lowercased) that uniquely identify a content-filter error. */
const FILTER_MESSAGE_SIGNALS: readonly string[] = [
  'response was filtered',
  'content management policy',
  'content_filter',
  'go.microsoft.com/fwlink/?linkid=2198766',
  'jailbreak',
  'responsibleaipolicyviolation',
]

/**
 * Returns true if the error appears to be an upstream content-policy filter
 * event we should map to a canned refusal. Matches on either:
 *   - SDK `code === 'content_filter'` (preferred, set by Azure on APIError)
 *   - a known substring in the error message (fallback for SDK versions /
 *     proxies that strip the code field)
 */
export function isContentFilterError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: unknown; message?: unknown }

  if (typeof e.code === 'string' && e.code.toLowerCase() === 'content_filter') {
    return true
  }

  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : ''
  if (!msg) return false
  return FILTER_MESSAGE_SIGNALS.some((sig) => msg.includes(sig))
}

/**
 * The single canned refusal returned to the user when their prompt trips the
 * upstream content filter. Brand-agnostic, redirects to wedding planning, no
 * provider name, no documentation URL, no HTTP status code.
 *
 * Kept as a function so future personalization (locale, mode-aware wording)
 * can be threaded in without changing call sites.
 */
export function getContentFilterRefusalText(): string {
  return "I'm not able to respond to that — let's stay on wedding planning. What were you working on?"
}
