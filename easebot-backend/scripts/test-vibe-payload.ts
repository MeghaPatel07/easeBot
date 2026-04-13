/**
 * Smoke test: validate a fake Images Hub "Vibe Mode" chat payload against
 * the ChatRequestSchema. Run with:  npx tsx scripts/test-vibe-payload.ts
 */
import { ChatRequestSchema } from '../src/schemas/chat'

const fakePayload = {
  message: 'Show me a mandap in this vibe',
  threadId: 'thread-abc',
  mode: 'planner' as const,
  forceImageGeneration: true,
  preferredAspectRatio: '1536x1024' as const,
  vibeTitle: 'Ivory Mughal Garden',
  vibeDescriptors: ['Ivory', 'Gold', 'Damask', 'Mughal arches'],
}

const result = ChatRequestSchema.safeParse(fakePayload)

if (result.success) {
  console.log('OK — payload parsed successfully')
  console.log(JSON.stringify(result.data, null, 2))
  process.exit(0)
} else {
  console.error('FAIL — payload did not validate')
  console.error(result.error.format())
  process.exit(1)
}
