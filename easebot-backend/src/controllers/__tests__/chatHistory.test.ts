// QA — WE-20260601-100: the current turn's user message must NOT be duplicated
// into the LLM context.
//
// For logged-in users the frontend persists this turn's user message to
// Firestore BEFORE kicking off the (stream) request, so getChatHistory's
// last-N Firestore recall includes the message we're about to answer; the LLM
// call then appends it again as the live turn. dropDuplicateCurrentTurn (the
// pure helper getChatHistory uses) must collapse that trailing duplicate so the
// current message appears exactly once. No Firebase / Azure network — pure unit.

import { test } from 'node:test'
import * as assert from 'node:assert/strict'

import { dropDuplicateCurrentTurn } from '../chatController'
import type { HistoryMessage } from '../../types'

// ────────────────────────────────────────────────────────────────────────────
// WE-20260601-100: de-dup the current-turn user message
// ────────────────────────────────────────────────────────────────────────────

test('WE-100: drops trailing user message that equals the current turn (turn 1: pure duplicate)', () => {
  // Brand-new thread: frontend persisted the user message before streaming, so
  // the recalled "history" is JUST that message — it must collapse to empty.
  const recalled: HistoryMessage[] = [{ role: 'user', content: 'Plan my sangeet' }]
  const out = dropDuplicateCurrentTurn(recalled, 'Plan my sangeet')
  assert.deepEqual(out, [], 'turn-1 history must contain no prior turns')
})

test('WE-100: keeps only PRIOR turns and drops the duplicated current turn', () => {
  const recalled: HistoryMessage[] = [
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Hello! How can I help?' },
    { role: 'user', content: 'Plan my sangeet' }, // <- current turn, persisted before stream
  ]
  const out = dropDuplicateCurrentTurn(recalled, 'Plan my sangeet')
  assert.deepEqual(out, [
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Hello! How can I help?' },
  ])
  // The current message must appear ZERO times in history (it is re-appended by
  // the LLM call as the live turn → exactly once overall).
  assert.equal(
    out.filter(m => m.role === 'user' && m.content === 'Plan my sangeet').length,
    0,
    'current user message must not appear in history',
  )
})

test('WE-100: tolerant to surrounding whitespace on either side', () => {
  const recalled: HistoryMessage[] = [
    { role: 'assistant', content: 'prev' },
    { role: 'user', content: '  Plan my sangeet  ' },
  ]
  const out = dropDuplicateCurrentTurn(recalled, 'Plan my sangeet')
  assert.deepEqual(out, [{ role: 'assistant', content: 'prev' }])
})

test('WE-100: does NOT drop when the trailing message differs from the current turn', () => {
  // Guard against over-trimming: a genuinely prior user turn that merely is the
  // most recent recalled message must be preserved.
  const recalled: HistoryMessage[] = [
    { role: 'assistant', content: 'Sure!' },
    { role: 'user', content: 'What about catering?' },
  ]
  const out = dropDuplicateCurrentTurn(recalled, 'Plan my sangeet')
  assert.deepEqual(out, recalled, 'a non-matching prior turn must be retained')
})

test('WE-100: does NOT drop when the trailing message is an assistant turn', () => {
  const recalled: HistoryMessage[] = [
    { role: 'user', content: 'Plan my sangeet' },
    { role: 'assistant', content: 'Here is a plan…' },
  ]
  const out = dropDuplicateCurrentTurn(recalled, 'Plan my sangeet')
  assert.deepEqual(out, recalled, 'must only ever drop a trailing USER message')
})

test('WE-100: no-op when current message is undefined / empty / whitespace (guest path)', () => {
  const recalled: HistoryMessage[] = [{ role: 'user', content: 'Plan my sangeet' }]
  assert.deepEqual(dropDuplicateCurrentTurn(recalled, undefined), recalled)
  assert.deepEqual(dropDuplicateCurrentTurn(recalled, ''), recalled)
  assert.deepEqual(dropDuplicateCurrentTurn(recalled, '   '), recalled)
})

test('WE-100: empty recalled history stays empty', () => {
  assert.deepEqual(dropDuplicateCurrentTurn([], 'anything'), [])
})

test('WE-100: only the LAST occurrence is dropped, not earlier identical turns', () => {
  // If the user genuinely asked the same thing earlier, that earlier turn is real
  // history and must survive; only the trailing (just-persisted) copy is removed.
  const recalled: HistoryMessage[] = [
    { role: 'user', content: 'Plan my sangeet' },
    { role: 'assistant', content: 'Done.' },
    { role: 'user', content: 'Plan my sangeet' },
  ]
  const out = dropDuplicateCurrentTurn(recalled, 'Plan my sangeet')
  assert.deepEqual(out, [
    { role: 'user', content: 'Plan my sangeet' },
    { role: 'assistant', content: 'Done.' },
  ])
})

// WE-20260601-450 (tool-results pass must use effectiveHistory) is covered by
// the sibling file toolPassHistory.test.ts.
