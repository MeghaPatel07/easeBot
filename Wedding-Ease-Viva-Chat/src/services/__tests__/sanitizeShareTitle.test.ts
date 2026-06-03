// Security-focused unit tests for sanitizeShareTitle() — WE-20260528-107.
// Run from Wedding-Ease-Viva-Chat:
//   node --experimental-strip-types --test src/services/__tests__/sanitizeShareTitle.test.ts
// Uses node:test — zero new deps.
//
// We import the helper through a tiny re-export shim so the test does not pull
// in firebase/firestore (which has DOM globals + ESM resolution issues under
// node:test). sanitizeShareTitle is a pure function; the shim isolates it.

import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import { sanitizeShareTitle } from './sanitizeShareTitle.shim.ts'

// ── HTML injection ──────────────────────────────────────────────────────────

test('strips <img onerror> attribute payloads', () => {
  const out = sanitizeShareTitle('<img src=x onerror=alert(1)>')
  assert.equal(out, '')
})

test('strips <script> tags AND keeps inner text (parens also dropped as belt-and-suspenders)', () => {
  // Belt-and-suspenders sweep drops stray `()` too so that a residual markdown-link
  // fragment can never leak. Inner text `alert(1)` collapses to `alert1` — that's
  // fine: title text is rendered as a plain text node either way.
  const out = sanitizeShareTitle('<script>alert(1)</script>')
  assert.equal(out, 'alert1')
})

test('strips anchor tags pointing at javascript: URIs', () => {
  const out = sanitizeShareTitle('<a href="javascript:alert(1)">Click</a>')
  assert.equal(out, 'Click')
})

// ── Markdown link injection ─────────────────────────────────────────────────

test('collapses [label](javascript:url) to just the label', () => {
  const out = sanitizeShareTitle('[Pwned](javascript:alert(1))')
  assert.equal(out, 'Pwned')
})

test('collapses nested-looking [label](url) variants', () => {
  const out = sanitizeShareTitle('See [here](https://evil.example.com/x?y=z) for details')
  assert.equal(out, 'See here for details')
})

// ── Belt-and-suspenders ─────────────────────────────────────────────────────

test('drops stray < and > that survive both passes', () => {
  const out = sanitizeShareTitle('Trip to Bali <3')
  // ‘<3’ becomes ‘3’ because we strip stray < and >; acceptable per ticket-note.
  assert.equal(out, 'Trip to Bali 3')
})

// ── Length + trim + null-safety ─────────────────────────────────────────────

test('trims surrounding whitespace', () => {
  const out = sanitizeShareTitle('   wedding planning   ')
  assert.equal(out, 'wedding planning')
})

test('caps length at 80 characters', () => {
  const long = 'A'.repeat(200)
  const out = sanitizeShareTitle(long)
  assert.equal(out.length, 80)
  assert.equal(out, 'A'.repeat(80))
})

test('handles null and undefined input without throwing', () => {
  assert.equal(sanitizeShareTitle(null), '')
  assert.equal(sanitizeShareTitle(undefined), '')
  assert.equal(sanitizeShareTitle(''), '')
})
