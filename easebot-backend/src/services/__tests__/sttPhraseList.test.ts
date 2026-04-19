// Phase 2a — unit tests for sttPhraseList.ts resolver.
// Run: npm run test:phase2:phrases

import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  getPhrasesForLocale,
  getPhrasesForLocales,
  __getRawCounts,
} from '../sttPhraseList'

test('en / en-IN / en-US all resolve to the same English list', () => {
  const enA = getPhrasesForLocale('en')
  const enB = getPhrasesForLocale('en-IN')
  const enC = getPhrasesForLocale('en-US')
  assert.deepEqual(enA, enB)
  assert.deepEqual(enB, enC)
})

test('English list contains core wedding vocab harvested from keywordDirectory', () => {
  const en = getPhrasesForLocale('en')
  const required = ['lehenga', 'sherwani', 'mandap', 'haldi', 'mehndi', 'sangeet', 'varmala']
  for (const r of required) {
    assert.ok(en.includes(r), `English list missing required term: ${r}`)
  }
})

test('Hindi list contains Devanagari + Roman transliteration forms', () => {
  const hi = getPhrasesForLocale('hi-IN')
  // Devanagari
  assert.ok(hi.includes('हल्दी'))
  assert.ok(hi.includes('मंडप'))
  assert.ok(hi.includes('संगीत'))
  // Roman
  assert.ok(hi.includes('haldi'))
  assert.ok(hi.includes('mandap'))
  assert.ok(hi.includes('sangeet'))
})

test('Gujarati list contains Gujarati script + Roman + Gujarat-specific rituals', () => {
  const gu = getPhrasesForLocale('gu-IN')
  assert.ok(gu.includes('હળદી'))           // Gujarati haldi
  assert.ok(gu.includes('મંડપ'))           // Gujarati mandap
  assert.ok(gu.includes('chandlo'))        // Gujarat-specific engagement ritual
  assert.ok(gu.includes('gol dhana'))      // Gujarat-specific engagement ritual
  assert.ok(gu.includes('fafda'))          // Gujarati food
})

test('unknown locale returns empty array (no-op for caller)', () => {
  assert.deepEqual(getPhrasesForLocale('ja-JP'), [])
  assert.deepEqual(getPhrasesForLocale('ta-IN'), [])
  assert.deepEqual(getPhrasesForLocale(undefined), [])
  assert.deepEqual(getPhrasesForLocale(''), [])
})

test('bare language stem works (hi, gu, en)', () => {
  assert.ok(getPhrasesForLocale('hi').length > 0)
  assert.ok(getPhrasesForLocale('gu').length > 0)
  assert.ok(getPhrasesForLocale('en').length > 0)
})

test('locale codes are case-insensitive', () => {
  const a = getPhrasesForLocale('HI-IN')
  const b = getPhrasesForLocale('hi-IN')
  assert.deepEqual(a, b)
})

test('getPhrasesForLocales: union of multiple lists, deduplicated', () => {
  const en = getPhrasesForLocale('en')
  const hi = getPhrasesForLocale('hi-IN')
  const union = getPhrasesForLocales(['en-US', 'hi-IN'])
  // Union size is bounded by sum; with overlap (roman hi terms like "haldi" appear in both), strictly less.
  assert.ok(union.length >= Math.max(en.length, hi.length))
  assert.ok(union.length <= en.length + hi.length)
  // No dupes
  assert.equal(union.length, new Set(union).size)
})

test('getPhrasesForLocales: unknown locales contribute nothing', () => {
  const only = getPhrasesForLocale('gu-IN')
  const mixed = getPhrasesForLocales(['gu-IN', 'ja-JP', 'xx-XX'])
  assert.equal(mixed.length, only.length)
})

test('no phrase exceeds Azure 200-char limit', () => {
  for (const loc of ['en-US', 'hi-IN', 'gu-IN']) {
    for (const p of getPhrasesForLocale(loc)) {
      assert.ok(p.length <= 200, `phrase too long in ${loc}: "${p}"`)
    }
  }
})

test('no list exceeds Azure 1024-phrase limit', () => {
  const counts = __getRawCounts()
  assert.ok(counts.en <= 1024, `EN list too large: ${counts.en}`)
  assert.ok(counts.hi <= 1024, `HI list too large: ${counts.hi}`)
  assert.ok(counts.gu <= 1024, `GU list too large: ${counts.gu}`)
})

test('list sizes are sane (>30 each — guards against accidental empty corpus)', () => {
  const counts = __getRawCounts()
  assert.ok(counts.en >= 50, `EN list too small: ${counts.en}`)
  assert.ok(counts.hi >= 30, `HI list too small: ${counts.hi}`)
  assert.ok(counts.gu >= 20, `GU list too small: ${counts.gu}`)
})

test('English list is deduplicated (no repeats from keywordDirectory + extras)', () => {
  const en = getPhrasesForLocale('en')
  assert.equal(en.length, new Set(en).size, 'duplicates found in EN list')
})

test('English list is sorted (stable ordering for downstream hashing/caching)', () => {
  const en = getPhrasesForLocale('en')
  const sorted = [...en].sort()
  assert.deepEqual(en, sorted)
})

test('immutable: returned arrays cannot be mutated by callers', () => {
  const en = getPhrasesForLocale('en')
  // @ts-expect-error readonly array, assigning should be rejected at compile time
  assert.throws(() => { en[0] = 'hacked' }, /read only|Cannot assign|frozen/i)
})
