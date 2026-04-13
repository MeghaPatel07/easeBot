import { z } from 'zod';

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(10000),
  threadId: z.string().optional(),
  mode: z.enum(['planner', 'styler', 'knowledge']).optional(),
  imageData: z.string().optional(),
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
