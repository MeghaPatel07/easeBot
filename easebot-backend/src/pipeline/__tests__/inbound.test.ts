// Tests for the language-from-script fallback in inbound.ts.
// Run: npm run test:langfix

import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import { detectLanguageFromScript } from '../inbound'

test('Gujarati script → gu (not Hindi — the pre-fix bug)', () => {
  // "I want to see the wedding menu" in Gujarati
  assert.equal(detectLanguageFromScript('મારે લગ્નનું મેનુ જોવું છે'), 'gu')
  // Single character
  assert.equal(detectLanguageFromScript('હ'), 'gu')
  // Mixed Gujarati + Latin (Gujarati dominates)
  assert.equal(detectLanguageFromScript('please લગ્ન details'), 'gu')
})

test('Devanagari (Hindi) script → hi', () => {
  assert.equal(detectLanguageFromScript('मुझे शादी की जानकारी चाहिए'), 'hi')
  assert.equal(detectLanguageFromScript('हल्दी'), 'hi')
})

test('Bengali script → bn', () => {
  assert.equal(detectLanguageFromScript('আমি বিয়ে চাই'), 'bn')
})

test('Gurmukhi (Punjabi) script → pa', () => {
  assert.equal(detectLanguageFromScript('ਮੈਨੂੰ ਵਿਆਹ ਚਾਹੀਦਾ'), 'pa')
})

test('Tamil script → ta', () => {
  assert.equal(detectLanguageFromScript('எனக்கு திருமணம் வேண்டும்'), 'ta')
})

test('Telugu script → te', () => {
  assert.equal(detectLanguageFromScript('నాకు వివాహం కావాలి'), 'te')
})

test('Kannada script → kn', () => {
  assert.equal(detectLanguageFromScript('ನನಗೆ ಮದುವೆ ಬೇಕು'), 'kn')
})

test('Malayalam script → ml', () => {
  assert.equal(detectLanguageFromScript('എനിക്ക് വിവാഹം വേണം'), 'ml')
})

test('Arabic script → ar', () => {
  assert.equal(detectLanguageFromScript('أريد الزواج'), 'ar')
})

test('Thai script → th', () => {
  assert.equal(detectLanguageFromScript('ฉันต้องการแต่งงาน'), 'th')
})

test('Hiragana/Katakana (Japanese) → ja, not Chinese', () => {
  assert.equal(detectLanguageFromScript('けっこんしきをしたい'), 'ja')
  assert.equal(detectLanguageFromScript('ウェディング'), 'ja')
})

test('Hangul (Korean) → ko', () => {
  assert.equal(detectLanguageFromScript('결혼식을 원합니다'), 'ko')
})

test('CJK ideograph fallback → zh (when no Hiragana/Hangul)', () => {
  // Pure Han characters without kana → Chinese
  assert.equal(detectLanguageFromScript('我要结婚'), 'zh')
})

test('Pure Latin text → fallback "hi" (parity with pre-fix behavior)', () => {
  // detectLanguageFromScript is only called when hasNonLatinScript was true,
  // but for safety we verify pure-Latin still returns the legacy fallback.
  assert.equal(detectLanguageFromScript('hello world'), 'hi')
  assert.equal(detectLanguageFromScript(''), 'hi')
})

test('Gujarati vs Devanagari: disjoint ranges do not collide', () => {
  // Mixed text with both scripts — Gujarati listed first, Gujarati wins.
  // Not a realistic user input but guards the ordering in the implementation.
  assert.equal(detectLanguageFromScript('હ + म'), 'gu')
})
