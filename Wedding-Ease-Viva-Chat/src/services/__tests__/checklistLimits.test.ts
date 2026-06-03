// Tests for the checklist tier-cap policy (WE-20260601-103).
// Proves the free-tier "max 5 checklists" cap is enforced consistently — the
// manual creation path used to bypass it (only the AI tool path enforced it).
// Run from Wedding-Ease-Viva-Chat:
//   node --experimental-strip-types --test src/services/__tests__/checklistLimits.test.ts
// Uses node:test — zero new deps.

import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import { checkChecklistLimit, ChecklistLimitError } from '../checklistLimits.ts'

// ── Free tier: hard cap of 5 ────────────────────────────────────────────────

test('free: allows creating up to the 5th checklist (counts 0..4)', () => {
  const free = { plan: 'free' }
  for (let count = 0; count < 5; count++) {
    const r = checkChecklistLimit(free, count)
    assert.equal(r.allowed, true, `count=${count} should be allowed`)
    assert.equal(r.tier, 'free')
    assert.equal(r.max, 5)
    assert.equal(r.message, undefined)
  }
})

test('free: BLOCKS the 6th checklist (already has 5)', () => {
  const r = checkChecklistLimit({ plan: 'free' }, 5)
  assert.equal(r.allowed, false, '6th manual checklist on free tier must be blocked')
  assert.equal(r.tier, 'free')
  assert.equal(r.max, 5)
  assert.ok(r.message, 'a cap-hit message must be surfaced')
  assert.match(r.message!, /Free plan is limited to 5 checklists/i)
  assert.match(r.message!, /Upgrade to Pro/i)
})

test('free: stays blocked beyond the cap (count > 5)', () => {
  const r = checkChecklistLimit({ plan: 'free' }, 9)
  assert.equal(r.allowed, false)
})

// ── No-profile / guest defaults ─────────────────────────────────────────────

test('null profile resolves to guest (cap 0) and is blocked at 0', () => {
  const r = checkChecklistLimit(null, 0)
  assert.equal(r.tier, 'guest')
  assert.equal(r.max, 0)
  assert.equal(r.allowed, false)
})

test('profile with no plan/tier and isPremium=false resolves to free', () => {
  const r = checkChecklistLimit({ isPremium: false }, 5)
  assert.equal(r.tier, 'free')
  assert.equal(r.allowed, false)
})

// ── Pro / Pro Max: unlimited ────────────────────────────────────────────────

test('pro: unlimited — allowed even with 6, 50, 999 checklists', () => {
  for (const count of [0, 5, 6, 50, 999]) {
    const r = checkChecklistLimit({ plan: 'pro' }, count)
    assert.equal(r.allowed, true, `pro count=${count} should be allowed`)
    assert.equal(r.tier, 'pro')
    assert.equal(r.max, null, 'pro cap should be null (unlimited)')
    assert.equal(r.message, undefined)
  }
})

test('promax: unlimited — allowed past the free cap', () => {
  const r = checkChecklistLimit({ plan: 'promax' }, 100)
  assert.equal(r.allowed, true)
  assert.equal(r.tier, 'promax')
  assert.equal(r.max, null)
})

// ── Tier resolution prefers tierMirror over isPremium ───────────────────────
// Guards the secondary finding: a pro/promax user whose isPremium flag is unset
// must NOT be wrongly limited (cap keys on resolved tier, not isPremium).

test('tierMirror=promax with isPremium=false is still unlimited', () => {
  const r = checkChecklistLimit({ tierMirror: 'promax', isPremium: false }, 6)
  assert.equal(r.tier, 'promax')
  assert.equal(r.allowed, true, 'isPremium=false must not override a pro/promax tier')
})

test('isPremium=true (legacy, no plan field) maps to pro and is unlimited', () => {
  const r = checkChecklistLimit({ isPremium: true }, 6)
  assert.equal(r.tier, 'pro')
  assert.equal(r.allowed, true)
})

// ── ChecklistLimitError carries the message ─────────────────────────────────

test('ChecklistLimitError exposes code/tier/max and message from a verdict', () => {
  const verdict = checkChecklistLimit({ plan: 'free' }, 5)
  const err = new ChecklistLimitError(verdict)
  assert.equal(err.code, 'CHECKLIST_LIMIT_REACHED')
  assert.equal(err.tier, 'free')
  assert.equal(err.max, 5)
  assert.equal(err.message, verdict.message)
  assert.ok(err instanceof Error)
})
