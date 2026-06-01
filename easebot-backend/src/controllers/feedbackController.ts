import { Request, Response } from 'express'
import { z } from 'zod'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../lib/firebaseAdmin'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const feedbackSchema = z.object({
  feedback: z.string().trim().min(10, 'Feedback must be at least 10 characters').max(5000, 'Feedback too long'),
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .max(320)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  type: z.enum(['bug', 'suggestion', 'praise', 'other']).optional(),
  isGuest: z.boolean().optional(),
  userAgent: z.string().max(1000).optional(),
  path: z.string().max(500).optional(),
  // Accepted only so we can REJECT a mismatch with the authenticated token —
  // the stored userId is always derived from req.user, never trusted from the
  // body (WE-20260527-1006). A client may legitimately echo its own uid here.
  userId: z.string().max(128).optional(),
})

export async function handleCreateFeedback(req: Request, res: Response): Promise<void> {
  const parsed = feedbackSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: parsed.error.errors,
    })
    return
  }

  const { feedback, email, type, isGuest, userAgent, path, userId: bodyUserId } = parsed.data
  const uid = req.user?.uid ?? null

  // WE-20260527-1006: never trust a body-supplied userId. If the caller sends
  // one, it MUST match the authenticated token's uid. Reject otherwise so an
  // attacker can't attribute feedback to another account. A guest (no token)
  // may not claim any uid at all.
  if (bodyUserId !== undefined && bodyUserId !== uid) {
    res.status(403).json({ success: false, error: 'userId does not match authenticated user' })
    return
  }

  try {
    const doc = {
      feedback,
      email: email ?? null,
      type: type ?? 'other',
      isGuest: isGuest === true || !uid,
      userId: uid,
      userAgent: userAgent ?? req.headers['user-agent'] ?? null,
      path: path ?? null,
      status: 'new',
      createdAt: FieldValue.serverTimestamp(),
    }
    const ref = await adminDb.collection('feedback').add(doc)
    res.status(201).json({ success: true, id: ref.id })
  } catch (err) {
    console.error('[feedbackController] write failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ success: false, error: 'Failed to save feedback' })
  }
}
