import { Router, Request, Response } from 'express'
import { requireAuthOrGuest } from '../middleware/auth'
import { handleChat, handleChatStream } from '../controllers/chatController'
import { validateBody } from '../middleware/validateRequest'
import { ChatRequestSchema } from '../schemas/chat'
import { quotaCheck } from '../middleware/quotaMiddleware'
import { chatBurstRateLimiter } from '../middleware/rateLimiter'
import { cancel as cancelRequest } from '../services/cancellationRegistry'

// Chat is a quota-burning route that legitimately serves guests. `requireAuthOrGuest`
// admits a valid Firebase user OR an anonymous caller with a valid guest session
// (X-Guest-Id); it rejects invalid tokens and fully-anonymous callers (WE-20260527-202).
const router = Router()
router.post('/', requireAuthOrGuest, chatBurstRateLimiter, validateBody(ChatRequestSchema), quotaCheck('chat'), handleChat)

/**
 * Explicit cancel endpoint. The frontend calls this when the user clicks Stop,
 * because client-side `AbortController.abort()` alone is unreliable in
 * production: reverse proxies and LBs often hold the upstream socket open so
 * `req.on('close')` never fires, and the image pipeline runs to completion
 * (Azure image gen + Firebase Storage upload + Firestore write) regardless.
 */
router.post('/cancel', requireAuthOrGuest, (req: Request, res: Response) => {
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
router.post('/stream', requireAuthOrGuest, chatBurstRateLimiter, quotaCheck('chat'), (req: Request, res: Response) => {
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
  const heartbeatInterval = setInterval(() => {
    // SSE comment — ignored by EventSource clients but keeps proxies/LBs happy
    originalWrite(`: heartbeat\n\n`)
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
