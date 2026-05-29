// Unit tests for modeRouter.ts intent classifier.
// Run: ts-node --transpile-only src/__tests__/modeRouter.test.ts

import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import { detectMode } from '../modeRouter'

// ---------- WE-20260527-352: cultural-item terms route to knowledge ----------

test('WE-20260527-352: "what is the meaning of the mangalsutra" classifies as knowledge', () => {
  const mode = detectMode('What is the meaning of the mangalsutra in Hindu weddings?')
  assert.equal(mode, 'knowledge')
})

test('WE-20260527-352: "tell me about haldi ceremony" classifies as knowledge', () => {
  const mode = detectMode('Tell me about the haldi ceremony')
  assert.equal(mode, 'knowledge')
})

test('WE-20260527-352: "what is sindoor" classifies as knowledge', () => {
  const mode = detectMode('What is sindoor and why is it applied?')
  assert.equal(mode, 'knowledge')
})

test('WE-20260527-352: "meaning of varmala" classifies as knowledge', () => {
  const mode = detectMode('Can you explain the meaning of varmala?')
  assert.equal(mode, 'knowledge')
})

test('WE-20260527-352: "significance of mangni" classifies as knowledge', () => {
  const mode = detectMode('What is the significance of the mangni ritual?')
  assert.equal(mode, 'knowledge')
})

test('WE-20260527-352: pure styling query about a lehenga still routes to stylist', () => {
  // Regression: cultural-item additions must not steal styling queries.
  const mode = detectMode('What color lehenga should I wear for sangeet — bohemian vibe?')
  // Mixed: stylist (color/lehenga/vibe/sangeet-as-knowledge-token...) — but
  // "what" alone is not in the boost list; "what color" is not a knowledge
  // intent stem. Stylist tokens dominate.
  assert.equal(mode, 'stylist')
})

// ---------- WE-20260527-360: 'what is' intent boost beats planner ----------

test('WE-20260527-360: "what is the mangni ceremony schedule" prefers knowledge over planner', () => {
  // 'schedule' is planner, 'mangni' + 'what is' should win for knowledge.
  const mode = detectMode('What is the mangni ceremony schedule?')
  assert.equal(mode, 'knowledge')
})

test('WE-20260527-360: "tell me about the wedding planning timeline tradition" prefers knowledge', () => {
  // 'planning' + 'timeline' are planner; 'tell me about' + 'tradition' should boost knowledge.
  const mode = detectMode('Tell me about the wedding planning timeline tradition')
  assert.equal(mode, 'knowledge')
})

test('WE-20260527-360: "meaning of booking a mandap" prefers knowledge', () => {
  // 'booking' is planner; 'meaning of' + 'mandap' should keep knowledge winning.
  const mode = detectMode('What is the meaning of booking a mandap?')
  assert.equal(mode, 'knowledge')
})

test('WE-20260527-360: pure planner query without knowledge intent stays planner', () => {
  // Regression: knowledge boost must NOT fire when there is no intent stem.
  const mode = detectMode('I need a checklist of vendors to book for my wedding')
  assert.equal(mode, 'planner')
})

test('WE-20260527-360: "when should I book the venue" stays planner', () => {
  // Regression: 'when' is a planner token, no 'what is' — should NOT flip to knowledge.
  // "when" alone is NOT in the knowledge intent boost.
  const mode = detectMode('When should I book the venue?')
  assert.equal(mode, 'planner')
})

// ---------- Existing behavior preserved ----------

test('Existing: pure stylist query routes to stylist', () => {
  const mode = detectMode('I want a romantic bohemian palette for my decor')
  assert.equal(mode, 'stylist')
})

test('Existing: pure planner query routes to planner', () => {
  const mode = detectMode('Give me a checklist of vendors to book')
  assert.equal(mode, 'planner')
})

test('Existing: pure knowledge query routes to knowledge', () => {
  const mode = detectMode('What is the history of Indian wedding etiquette?')
  assert.equal(mode, 'knowledge')
})

test('Existing: empty / unrelated text falls back to assistant', () => {
  assert.equal(detectMode('hello there friend'), 'assistant')
  assert.equal(detectMode(''), 'assistant')
})
