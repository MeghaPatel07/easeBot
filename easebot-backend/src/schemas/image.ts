import { z } from 'zod';

export const ImageGenerateSchema = z.object({
  prompt: z.string().min(1).max(5000),
  size: z.enum(['1024x1024', '1024x1536', '1536x1024']).optional(),
  quality: z.enum(['standard', 'hd']).optional(),
  style: z.string().max(100).optional(),
});

export type ImageGenerateRequest = z.infer<typeof ImageGenerateSchema>;
