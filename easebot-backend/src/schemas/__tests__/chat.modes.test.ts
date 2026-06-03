// Regression tests for WE-20260528-103 (mode contract drift).
//
// Pre-fix the schema enum was `['planner', 'stylist', 'knowledge']` (missing
// `assistant`) and the stream endpoint mounted no validator at all, so
// `POST /api/chat {mode:'assistant'}` returned 400 while
// `POST /api/chat/stream {mode:'stylist-typo'}` returned 200 with a planner
// answer. Both endpoints now share ChatRequestSchema; this test pins the
// canonical mode set and the rejection of unknown values.
//
// Run:  ts-node --transpile-only src/schemas/__tests__/chat.modes.test.ts

import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { ChatRequestSchema } from '../chat'

const ACCEPTED_MODES = ['planner', 'stylist', 'knowledge', 'assistant'] as const
const REJECTED_MODES = ['styler', 'image', 'therapist', 'consultant', 'bogus', ''] as const

for (const m of ACCEPTED_MODES) {
  test(`mode='${m}' is accepted`, () => {
    const result = ChatRequestSchema.safeParse({ message: 'hi', mode: m })
    assert.equal(result.success, true, `expected ${m} to parse cleanly`)
  })
}

for (const m of REJECTED_MODES) {
  test(`mode='${m}' is rejected with a clear enum error`, () => {
    const result = ChatRequestSchema.safeParse({ message: 'hi', mode: m })
    assert.equal(result.success, false, `expected ${m} to fail validation`)
    if (!result.success) {
      const modeIssue = result.error.issues.find(i => i.path.join('.') === 'mode')
      assert.ok(modeIssue, `expected an issue on the mode field for '${m}'`)
    }
  })
}

test("omitting `mode` is accepted (server picks default via detectMode)", () => {
  const result = ChatRequestSchema.safeParse({ message: 'hi' })
  assert.equal(result.success, true, 'expected the field to be optional')
})

test('stream route mounts the same ChatRequestSchema validator as the non-stream route', () => {
  // Catches a regression where the stream endpoint silently swallowed
  // unknown mode values and defaulted to planner — see WE-20260528-103.
  const routeSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'routes', 'chat.ts'),
    'utf-8',
  )
  // Match the /stream line and confirm validateBody(ChatRequestSchema) appears
  // in the middleware chain before the handler arrow function.
  const match = routeSrc.match(/router\.post\(\s*'\/stream'[^)]*\)/s)
  assert.ok(match, 'expected to find router.post(\'/stream\', ...)')
  assert.ok(
    match![0].includes('validateBody(ChatRequestSchema)'),
    'expected /stream route to mount validateBody(ChatRequestSchema)',
  )
})
