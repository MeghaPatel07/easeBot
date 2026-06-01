// chatSendErrors.ts — a small error taxonomy for the chat send / stream path.
//
// Before this, useChat.sendMessage funnelled every non-AbortError into a single
// generic "Something went wrong. Please try again." bubble (WE-20260601-300/303).
// That collapse hid four distinct, separately-recoverable failures:
//
//   • offline / network drop      → fetch rejects with a TypeError, no Response
//   • request/stream timeout       → backend accepts then stalls (no SSE chunks)
//   • rate-limited (429)           → upstream throttling, retry-after applies
//   • response too long (400)      → payload exceeds the model/context window
//   • missing stream body          → res.body was null (no readable stream)
//
// This module centralises the typed errors thrown by functionsService and the
// pure `classifySendError` mapper that useChat uses to pick copy + behaviour.
// Everything here is dependency-free and unit-tested via node:test.

/** Thrown when no chunk arrives within the idle window, or the overall ceiling
 *  is exceeded, and the stream is aborted by our watchdog (not the user). */
export class StreamTimeoutError extends Error {
  readonly code = 'stream_timeout' as const
  constructor(message = 'The response stalled.') {
    super(message)
    this.name = 'StreamTimeoutError'
  }
}

/** Thrown when the device is offline (or a fetch rejects with a network-level
 *  TypeError carrying no HTTP Response). */
export class OfflineError extends Error {
  readonly code = 'offline' as const
  constructor(message = 'You appear to be offline.') {
    super(message)
    this.name = 'OfflineError'
  }
}

/** Thrown when the SSE response arrived but carried no readable body. */
export class NoStreamError extends Error {
  readonly code = 'no_stream' as const
  constructor(message = 'The server did not return a response stream.') {
    super(message)
    this.name = 'NoStreamError'
  }
}

/** HTTP-status-carrying error so the classifier can split 429 / 400-too-long
 *  out of the generic !res.ok bucket. */
export class HttpStatusError extends Error {
  readonly code = 'http_status' as const
  readonly status: number
  readonly retryAfterMs?: number
  constructor(status: number, message?: string, retryAfterMs?: number) {
    super(message ?? `Request failed: ${status}`)
    this.name = 'HttpStatusError'
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

export type SendErrorKind =
  | 'offline'
  | 'timeout'
  | 'no-stream'
  | 'rate-limited'
  | 'too-long'
  | 'aborted'
  | 'quota'
  | 'generic'

export interface ClassifiedSendError {
  kind: SendErrorKind
  /** User-facing bubble/toast copy. */
  message: string
  /** Whether the failed send can be retried verbatim (same payload). */
  recoverable: boolean
  /** For rate-limited: suggested wait before retry, if the server told us. */
  retryAfterMs?: number
}

/**
 * Pure mapper from a thrown error to a classified, user-facing send error.
 * Order matters: the most specific typed errors are checked first, then the
 * network-level TypeError / offline heuristic, then the generic fallback.
 *
 * `isOnline` is injected (defaults to navigator.onLine when available) so the
 * function stays pure and testable in a non-browser test runner.
 */
export function classifySendError(
  err: unknown,
  isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true,
): ClassifiedSendError {
  const e = err as { name?: string; code?: string; status?: number; message?: string; retryAfterMs?: number }

  // User pressed Stop — handled separately upstream, but classify defensively.
  if (e?.name === 'AbortError' && isOnline) {
    return { kind: 'aborted', message: 'Response stopped.', recoverable: true }
  }

  // Our watchdog aborted a stalled stream. An AbortError while offline is also
  // treated as a network failure (the abort was a symptom, not a user action).
  if (e?.code === 'stream_timeout') {
    return {
      kind: 'timeout',
      message: 'The response stalled. Tap Retry to try again.',
      recoverable: true,
    }
  }

  // Explicit offline, OR a network-level fetch TypeError with no HTTP response,
  // OR navigator reports we're offline.
  const isNetworkTypeError =
    e?.name === 'TypeError' &&
    typeof e?.message === 'string' &&
    /failed to fetch|networkerror|load failed|network request failed/i.test(e.message)
  if (e?.code === 'offline' || !isOnline || isNetworkTypeError) {
    return {
      kind: 'offline',
      message: "You appear to be offline. Your message is saved — we'll retry when you're back online.",
      recoverable: true,
    }
  }

  if (e?.code === 'no_stream') {
    return {
      kind: 'no-stream',
      message: "The server didn't send a response. Tap Retry to try again.",
      recoverable: true,
    }
  }

  if (e?.code === 'http_status' && typeof e?.status === 'number') {
    if (e.status === 429) {
      return {
        kind: 'rate-limited',
        message: "You're sending messages a little too quickly. Give it a moment, then tap Retry.",
        recoverable: true,
        retryAfterMs: e.retryAfterMs,
      }
    }
    if (e.status === 413 || e.status === 400) {
      return {
        kind: 'too-long',
        message: 'That message was too long to process. Try shortening it and sending again.',
        recoverable: false,
      }
    }
  }

  // Quota (402) is handled with bespoke per-reason copy in useChat; surface a
  // safe default here so the taxonomy is total.
  if (e?.code === 'quota_exceeded') {
    return { kind: 'quota', message: e.message || 'Quota exceeded.', recoverable: false }
  }

  return { kind: 'generic', message: 'Something went wrong. Please try again.', recoverable: true }
}

/**
 * StreamWatchdog (WE-20260601-303) — manages the idle + overall timers and a
 * chained AbortController so a stalled SSE stream is force-aborted and surfaced
 * as a StreamTimeoutError instead of pinning the UI on the typing skeleton.
 *
 * Extracted from streamChatMessage so the timer/abort logic is unit-testable in
 * a non-browser runner (the streaming function itself pulls in firebase).
 *
 *   const wd = new StreamWatchdog(idleMs, overallMs, userSignal)
 *   wd.armIdle()            // call before fetch, then on every chunk
 *   ... fetch with wd.signal ...
 *   if (wd.timedOut) throw new StreamTimeoutError()
 *   wd.clear()              // in finally
 */
export class StreamWatchdog {
  readonly controller = new AbortController()
  private idleTimer: ReturnType<typeof setTimeout> | undefined
  private overallTimer: ReturnType<typeof setTimeout> | undefined
  private _timedOut = false
  private readonly onUserAbort = () => this.controller.abort()

  constructor(
    private readonly idleMs: number,
    private readonly overallMs: number,
    private readonly userSignal?: AbortSignal,
  ) {
    if (userSignal) {
      if (userSignal.aborted) this.controller.abort()
      else userSignal.addEventListener('abort', this.onUserAbort, { once: true })
    }
    this.overallTimer = setTimeout(() => this.trip(), this.overallMs)
  }

  get signal(): AbortSignal {
    return this.controller.signal
  }

  /** True when an idle/overall timeout (not a user Stop) aborted the stream. */
  get timedOut(): boolean {
    return this._timedOut
  }

  private trip(): void {
    this._timedOut = true
    this.controller.abort()
  }

  /** (Re)start the idle timer — call before fetch and on every received chunk. */
  armIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.trip(), this.idleMs)
  }

  /** Release all timers + the user-abort listener. Safe to call multiple times. */
  clear(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    if (this.overallTimer) clearTimeout(this.overallTimer)
    this.idleTimer = undefined
    this.overallTimer = undefined
    if (this.userSignal) this.userSignal.removeEventListener('abort', this.onUserAbort)
  }
}

/**
 * Parse a Retry-After header (seconds or HTTP-date) into milliseconds.
 * Returns undefined for absent/unparseable values. Pure + testable.
 */
export function parseRetryAfterMs(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined
  const trimmed = headerValue.trim()
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000
  }
  const dateMs = Date.parse(trimmed)
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now()
    return delta > 0 ? delta : 0
  }
  return undefined
}
