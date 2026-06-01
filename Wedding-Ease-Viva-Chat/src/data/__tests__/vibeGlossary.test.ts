// Pure-function tests for vibeGlossary.ts (term matcher used by GlossaryText).
// Run from Wedding-Ease-Viva-Chat:
//   node --experimental-strip-types --test src/data/__tests__/vibeGlossary.test.ts
// Uses node:test — zero new deps.

import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  findGlossaryTerms,
  lookupGlossaryTerm,
  VIBE_GLOSSARY,
} from '../vibeGlossary.ts'

// ── findGlossaryTerms ────────────────────────────────────────────────────────

test('findGlossaryTerms: matches a single term in a subtitle', () => {
  const terms = findGlossaryTerms('Maroon brocade, marigold, palace heritage')
  assert.equal(terms.length, 1)
  assert.equal(terms[0].term, 'brocade')
})

test('findGlossaryTerms: is plural-tolerant (jaalis → jaali, jharokhas → jharokha)', () => {
  const jaali = findGlossaryTerms('carved marble jaalis and arches')
  assert.equal(jaali.length, 1)
  assert.equal(jaali[0].term, 'jaali')

  const jharokha = findGlossaryTerms('carved sandstone jharokhas and lattices')
  assert.equal(jharokha.length, 1)
  assert.equal(jharokha[0].term, 'jharokha')
})

test('findGlossaryTerms: is case-insensitive', () => {
  const terms = findGlossaryTerms('CHIAROSCURO lighting and Zari embroidery')
  const found = terms.map((t) => t.term).sort()
  assert.deepEqual(found, ['chiaroscuro', 'zari'])
})

test('findGlossaryTerms: finds multiple distinct terms, de-duplicated, first-seen order', () => {
  const terms = findGlossaryTerms('damask textiles, marble jaalis, more damask')
  assert.deepEqual(terms.map((t) => t.term), ['damask', 'jaali'])
})

test('findGlossaryTerms: ignores punctuation around words', () => {
  const terms = findGlossaryTerms('palette with (filigree), and lehenga.')
  const found = terms.map((t) => t.term).sort()
  assert.deepEqual(found, ['filigree', 'lehenga'])
})

test('findGlossaryTerms: does NOT match a glossary key embedded in a larger word', () => {
  // "zari" must not match inside "bizarre"; "macrame" must not match "macramerie"
  assert.deepEqual(findGlossaryTerms('a bizarre scene'), [])
})

test('findGlossaryTerms: returns empty array for plain copy with no jargon', () => {
  assert.deepEqual(findGlossaryTerms('Soft ivory and gold tones with arched windows'), [])
})

test('findGlossaryTerms: handles empty / falsy input', () => {
  assert.deepEqual(findGlossaryTerms(''), [])
})

// ── lookupGlossaryTerm ───────────────────────────────────────────────────────

test('lookupGlossaryTerm: resolves an exact descriptor chip', () => {
  const entry = lookupGlossaryTerm('Damask')
  assert.ok(entry)
  assert.equal(entry?.term, 'damask')
})

test('lookupGlossaryTerm: resolves a plural descriptor', () => {
  const entry = lookupGlossaryTerm('jharokhas')
  assert.ok(entry)
  assert.equal(entry?.term, 'jharokha')
})

test('lookupGlossaryTerm: returns null for an unknown token', () => {
  assert.equal(lookupGlossaryTerm('chandeliers'), null)
})

// ── data integrity ───────────────────────────────────────────────────────────

test('VIBE_GLOSSARY: every entry has a non-empty term and definition', () => {
  for (const [key, entry] of Object.entries(VIBE_GLOSSARY)) {
    assert.equal(key, key.toLowerCase(), `key "${key}" must be lower-cased`)
    assert.ok(entry.term.length > 0, `entry "${key}" missing term`)
    assert.ok(
      entry.definition.length >= 10,
      `entry "${key}" definition too short`,
    )
    // Definitions should end with a period (full sentence, readable).
    assert.ok(entry.definition.endsWith('.'), `entry "${key}" definition should end with a period`)
  }
})
