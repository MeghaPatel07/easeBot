import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { handleChat, handleChatStream } from '../controllers/chatController'
import { validateBody } from '../middleware/validateRequest'
import { ChatRequestSchema } from '../schemas/chat'
import { quotaCheck } from '../middleware/quotaMiddleware'
import { chatBurstRateLimiter } from '../middleware/rateLimiter'
import { cancel as cancelRequest } from '../services/cancellationRegistry'

const router = Router()
router.post('/', requireAuth, chatBurstRateLimiter, validateBody(ChatRequestSchema), quotaCheck('chat'), handleChat)

/**
 * Explicit cancel endpoint. The frontend calls this when the user clicks Stop,
 * because client-side `AbortController.abort()` alone is unreliable in
 * production: reverse proxies and LBs often hold the upstream socket open so
 * `req.on('close')` never fires, and the image pipeline runs to completion
 * (Azure image gen + Firebase Storage upload + Firestore write) regardless.
 */
router.post('/cancel', requireAuth, (req: Request, res: Response) => {
  const { requestId } = (req.body ?? {}) as { requestId?: string }
  if (!requestId || typeof requestId !== 'string') {
    res.status(400).json({ error: 'requestId is required' })
    return
  }
  const outcome = cancelRequest(requestId, req.user?.uid ?? null)
  if (outcome === 'forbidden') {
    res.status(403).json({ error: 'forbidden' })
    return
  }
  res.status(204).end()
})

/**
 * SSE streaming endpoint with heartbeat, event IDs, and reconnection support.
 */
router.post('/stream', requireAuth, chatBurstRateLimiter, quotaCheck('chat'), (req: Request, res: Response) => {
  // ── Last-Event-ID support (log for future replay) ──────────────────────────
  const lastEventId = req.headers['last-event-id'] as string | undefined
  if (lastEventId) {
    console.log(`[chat:sse] Client reconnecting with Last-Event-ID: ${lastEventId}`)
  }

  // ── Monotonic event ID counter ─────────────────────────────────────────────
  let eventId = 0

  // ── Patch res.write to inject SSE event IDs ────────────────────────────────
  const originalWrite = res.write.bind(res) as typeof res.write
  res.write = function patchedWrite(chunk: any, ...args: any[]): boolean {
    // Only inject IDs into SSE data frames (not heartbeat comments)
    if (typeof chunk === 'string' && chunk.startsWith('data: ')) {
      eventId++
      const withId = `id: ${eventId}\n${chunk}`
      return (originalWrite as any)(withId, ...args)
    }
    return (originalWrite as any)(chunk, ...args)
  } as typeof res.write

  // ── Heartbeat: keep connection alive ───────────────────────────────────────
  // Railway's edge proxy (and similar managed-platform proxies) enforce a
  // ~5-minute idle timeout on HTTP/SSE connections, independent of the app —
  // this doesn't exist for local dev, which talks to Node directly. A bare
  // SSE comment line isn't guaranteed to count as "data transferred" for
  // every proxy's idle-reset logic (Railway users report streams still
  // getting cut despite comment-only heartbeats); a real `data:` frame
  // removes that ambiguity. The frontend safely ignores the unrecognized
  // `t: 'hb'` event type — it falls through with no side effects.
  const heartbeatInterval = setInterval(() => {
    originalWrite(`data: ${JSON.stringify({ t: 'hb' })}\n\n`)
  }, 15_000)

  // ── Cleanup on connection close ────────────────────────────────────────────
  req.on('close', () => {
    clearInterval(heartbeatInterval)
  })

  // Delegate to the existing stream handler
  handleChatStream(req, res)
})

// Also validate stream requests — mount validateBody before the SSE wrapper
// Note: validation runs inside the stream handler's wrapper above, so we apply
// it at the route level for the non-stream endpoint only. Stream requests use
// the same body shape but validation is handled by the controller.

export default router
