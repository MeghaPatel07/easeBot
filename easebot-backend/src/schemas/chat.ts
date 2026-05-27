import { z } from 'zod';

/**
 * Maximum length (in characters) of a base64-encoded image payload.
 *
 * Base64 inflates raw bytes by ~4/3 (33% overhead). A 10MB raw image therefore
 * becomes ~13.5MB of base64. We cap at 14_000_000 chars to:
 *   - Allow legitimate high-res photo uploads (most camera JPEGs are <5MB raw)
 *   - Reject obviously-malformed / resource-exhaustion payloads well below the
 *     express body limit (20MB), so zod fails fast with a clean 400 before any
 *     downstream work (vision API call, image edit pipeline) is attempted.
 *
 * Ref: WE-20260527-202 (P1 SECURITY — imageData accepts unbounded string).
 */
export const MAX_IMAGE_BASE64_LEN = 14_000_000;

/**
 * Optional data-URL prefix or pure base64 body. The actual mime type is
 * provided separately via `imageMimeType` — the data-URL prefix here is
 * accepted for compatibility with clients that send `data:image/...;base64,`.
 */
const imageBase64Schema = z
  .string()
  .max(
    MAX_IMAGE_BASE64_LEN,
    `imageBase64 exceeds maximum length of ${MAX_IMAGE_BASE64_LEN} characters`,
  )
  .optional();

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(10000),
  threadId: z.string().optional(),
  mode: z.enum(['planner', 'styler', 'knowledge']).optional(),
  // Canonical field name — matches ChatPayload.imageBase64 used by the
  // controller. Older schema versions exposed this as `imageData`; that name
  // is no longer accepted (see WE-20260527-216 for the rename cleanup).
  imageBase64: imageBase64Schema,
  imageMimeType: z.string().optional(),
  toneSettings: z.record(z.number().min(0).max(100)).optional(),
  language: z.string().max(10).optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).optional(),
  // Vibe Mode — Images Hub payload
  forceImageGeneration: z.boolean().optional(),
  preferredAspectRatio: z.enum(['1024x1024', '1024x1536', '1536x1024', '1024x1792']).optional(),
  vibeTitle: z.string().min(1).max(60).optional(),
  vibeDescriptors: z.array(z.string().min(1).max(40)).max(20).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
