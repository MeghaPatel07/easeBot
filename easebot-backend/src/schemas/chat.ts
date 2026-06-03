import { z } from 'zod';

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(10000),
  threadId: z.string().optional(),
  // Canonical mode set — must match `Mode` in src/types.ts and the cases handled
  // in src/controllers/chatController.ts (buildSystemPrompt, getToolsForMode) +
  // src/modeRouter.ts (detectMode). 'assistant' is the implicit fallback when
  // no mode is sent — it is also accepted explicitly so the client union
  // (`'planner' | 'stylist' | 'knowledge' | 'assistant'`) and the server enum
  // agree (WE-20260528-103). `therapist` / `consultant` stay disabled until
  // EXECUTION_PLAN §0 guardrail #7 is lifted.
  mode: z.enum(['planner', 'stylist', 'knowledge', 'assistant']).optional(),
  imageData: z.string().optional(),
  imageMimeType: z.string().optional(),
  toneSettings: z.record(z.number().min(0).max(100)).optional(),
  language: z.string().max(10).optional(),
  history: z.array(z.object({
    // SECURITY (WE-20260527-211 / CWE-1336): client-supplied history MUST NOT
    // include 'system' messages. They would be spread verbatim into the LLM
    // messages list after the legitimate system prompt and let an
    // unauthenticated guest inject a fake system directive (prompt injection).
    // See also defense-in-depth filter in chatController.getChatHistory.
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
  // Vibe Mode — Images Hub payload
  forceImageGeneration: z.boolean().optional(),
  preferredAspectRatio: z.enum(['1024x1024', '1024x1536', '1536x1024', '1024x1792']).optional(),
  vibeTitle: z.string().min(1).max(60).optional(),
  vibeDescriptors: z.array(z.string().min(1).max(40)).max(20).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
