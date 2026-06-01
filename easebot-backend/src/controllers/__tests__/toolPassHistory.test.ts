// QA — WE-20260601-450: the non-stream tool-results pass must feed
// `effectiveHistory` (the summarized/effective conversation view) — NOT the raw
// full `history`.
//
// The bug was an asymmetry between the two handlers: the STREAMING handler
// already passed `effectiveHistory` to its tool-results pass, while the
// NON-STREAM handler passed raw `history`, so a single tool-using turn saw one
// conversation shape on pass 1 and a larger un-summarized shape on pass 2
// (trajectory incoherence + summarization defeated + token bloat).
//
// This is a "which variable is passed" bug, so we guard the fixed shape
// directly against the controller source: both passes in both handlers must
// reference `effectiveHistory`, and raw `history` must never flow into the
// tool-results pass again. No Firebase / Azure network.

import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'chatController.ts'),
  'utf8',
)

/**
 * Extract the first argument of a function call in source.
 * `callToken` must include the opening paren so `callAzureAI(` is not matched by
 * `callAzureAIWithToolResults(` etc.
 */
function firstArgOfCall(source: string, callToken: string): string {
  assert.ok(callToken.endsWith('('), 'callToken must end with "("')
  const idx = source.indexOf(callToken)
  assert.notEqual(idx, -1, `expected a call to ${callToken} in chatController.ts`)
  const after = source.slice(idx + callToken.length)
  // First argument runs up to the first comma at paren-depth 0.
  let depth = 0
  for (let i = 0; i < after.length; i++) {
    const c = after[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) {
      return after.slice(0, i).trim().replace(/^\s*\n/, '').trim()
    }
  }
  throw new Error(`could not parse first arg of ${callToken}`)
}

test('WE-450: non-stream tool-results pass (callAzureAIWithToolResults) uses effectiveHistory', () => {
  const arg = firstArgOfCall(SRC, 'callAzureAIWithToolResults(')
  assert.equal(arg, 'effectiveHistory',
    'non-stream tool pass must pass effectiveHistory (summarized view), not raw history')
})

test('WE-450: streaming tool-results pass already uses effectiveHistory (symmetry)', () => {
  const arg = firstArgOfCall(SRC, 'streamCallAzureAIWithToolResults(')
  assert.equal(arg, 'effectiveHistory',
    'streaming tool pass must pass effectiveHistory (it always has — this guards symmetry)')
})

test('WE-450: first-pass calls also use effectiveHistory in both handlers', () => {
  // Sanity: the first pass of each handler feeds effectiveHistory, so passes 1
  // and 2 share an identical conversation shape within a turn.
  assert.equal(firstArgOfCall(SRC, 'callAzureAI('), 'effectiveHistory')
  assert.equal(firstArgOfCall(SRC, 'streamCallAzureAI('), 'effectiveHistory')
})

test('WE-450: callAzureAIWithToolResults is never invoked with raw `history`', () => {
  // Belt-and-braces: ensure no remaining `callAzureAIWithToolResults(\n history,`
  // (or single-line variant) re-introduces the bug.
  assert.equal(
    /callAzureAIWithToolResults\(\s*history\s*,/.test(SRC),
    false,
    'raw history must not flow into the non-stream tool pass',
  )
})
