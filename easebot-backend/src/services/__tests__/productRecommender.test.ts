import * as dotenv from 'dotenv'
dotenv.config()

import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import { maybeRecommendProducts } from '../productRecommender'

test('Product Recommender - Decor should NOT trigger recommendations', async () => {
  const result = await maybeRecommendProducts({
    userMessage: 'Can you suggest some floral mandap ideas?',
    mode: 'stylist',
    requestedMode: undefined,
    turnNumber: 3,
    threadId: 'test-thread',
    history: [
      { role: 'user', content: 'What should I wear?' },
      { role: 'assistant', content: 'I recommend a traditional saree.' },
      { role: 'user', content: 'And for jewelry?' },
      { role: 'assistant', content: 'A gold necklace would look great.' }
    ]
  })
  assert.equal(result, null)
})

test('Product Recommender - Bridal Lehenga on Turn 1 should NOT trigger recommendations', async () => {
  const result = await maybeRecommendProducts({
    userMessage: 'What are some styling tips for my red bridal lehenga?',
    mode: 'stylist',
    requestedMode: undefined,
    turnNumber: 1,
    threadId: 'test-thread',
    history: []
  })
  assert.equal(result, null)
})

test('Product Recommender - Bridal Lehenga on Turn 2 should NOT trigger recommendations', async () => {
  const result = await maybeRecommendProducts({
    userMessage: 'Should I wear a red saree or lehenga?',
    mode: 'stylist',
    requestedMode: undefined,
    turnNumber: 2,
    threadId: 'test-thread',
    history: [
      { role: 'user', content: 'What accessories do you suggest?' }
    ]
  })
  assert.equal(result, null)
})

test('Product Recommender - Bridal Lehenga on Turn 3 with 3 consecutive allowed queries should trigger recommendations', async () => {
  const result = await maybeRecommendProducts({
    userMessage: 'What are some red lehenga options?',
    mode: 'stylist',
    requestedMode: undefined,
    turnNumber: 3,
    threadId: 'test-thread',
    history: [
      { role: 'user', content: 'What styling tips do you have for a bridal lehenga?' },
      { role: 'assistant', content: 'I recommend a velvet lehenga with a heavy borders.' },
      { role: 'user', content: 'What jewelry matches a bridal lehenga?' },
      { role: 'assistant', content: 'A simple emerald choker set matches perfectly.' }
    ]
  })
  assert.ok(result !== null)
  assert.ok(result!.products.length > 0)
})

test('Product Recommender - Non-consecutive stream (broken by venue) should NOT trigger recommendations', async () => {
  const result = await maybeRecommendProducts({
    userMessage: 'What invitation cards do you recommend?',
    mode: 'stylist',
    requestedMode: undefined,
    turnNumber: 3,
    threadId: 'test-thread',
    history: [
      { role: 'user', content: 'What accessories do you suggest?' },
      { role: 'assistant', content: 'I recommend a necklace.' },
      { role: 'user', content: 'What are some good venues in Mumbai?' },
      { role: 'assistant', content: 'Here are some premium banquets.' }
    ]
  })
  assert.equal(result, null)
})

test('Product Recommender - Explicit "show me products for the saree" on Turn 1 SHOULD bypass gating', async () => {
  const result = await maybeRecommendProducts({
    userMessage: 'show me the products for the saree',
    mode: 'stylist',
    requestedMode: undefined,
    turnNumber: 1,
    threadId: 'test-thread-explicit-1',
    history: []
  })
  assert.ok(result !== null)
  assert.ok(result!.products.length > 0)
})

test('Product Recommender - Explicit "give me the catalogue" on Turn 1 SHOULD bypass gating', async () => {
  const result = await maybeRecommendProducts({
    userMessage: 'give me the catalogue for lehengas',
    mode: 'stylist',
    requestedMode: undefined,
    turnNumber: 1,
    threadId: 'test-thread-explicit-2',
    history: []
  })
  assert.ok(result !== null)
  assert.ok(result!.products.length > 0)
})

test('Product Recommender - Explicit ask for decor (no product noun) on Turn 1 should still NOT bypass gating', async () => {
  const result = await maybeRecommendProducts({
    userMessage: 'show me some mandap decoration ideas',
    mode: 'stylist',
    requestedMode: undefined,
    turnNumber: 1,
    threadId: 'test-thread-explicit-3',
    history: []
  })
  assert.equal(result, null)
})

test('Product Recommender - "Can I see matching accessories for this?" after a sherwani ask SHOULD bypass gating', async () => {
  const result = await maybeRecommendProducts({
    userMessage: 'Can I see matching accessories for this?',
    mode: 'stylist',
    requestedMode: undefined,
    turnNumber: 3,
    threadId: 'test-thread-explicit-4',
    previousAssistantText: 'Here is the visual of an ivory sherwani with a traditional cut, designed for a marriage ceremony.',
    previousUserText: 'color: ivory, traditional cut, for marriage',
    history: []
  })
  assert.ok(result !== null)
  assert.ok(result!.products.length > 0)
})

test('Product Recommender - "Can you suggest accessories for a regal look?" SHOULD bypass gating (suggest = explicit ask)', async () => {
  const result = await maybeRecommendProducts({
    userMessage: 'Can you suggest accessories for a regal look?',
    mode: 'stylist',
    requestedMode: undefined,
    turnNumber: 1,
    threadId: 'test-thread-explicit-6',
    history: []
  })
  assert.ok(result !== null)
  assert.ok(result!.products.length > 0)
})

test('Product Recommender - bare "suggest" with no product/catalogue noun should NOT bypass gating', async () => {
  const result = await maybeRecommendProducts({
    userMessage: 'Can you suggest what colors would look elegant for a spring wedding?',
    mode: 'stylist',
    requestedMode: undefined,
    turnNumber: 1,
    threadId: 'test-thread-explicit-7',
    history: []
  })
  assert.equal(result, null)
})

test('Product Recommender - bare "outfit" is anchored to occasion context, not searched alone', async () => {
  const result = await maybeRecommendProducts({
    userMessage: 'Help me style my looks — suggest outfit ideas for my wedding functions.',
    mode: 'stylist',
    requestedMode: undefined,
    turnNumber: 1,
    threadId: 'test-thread-explicit-8',
    history: []
  })
  assert.ok(result !== null)
  assert.ok(result!.products.length > 0)
  // The bug this guards against: a bare "outfit" search surfaced a wall-decor
  // mirror panel. None of the returned names/descriptions should be decor.
  const decorRe = /\b(mirror panel|wall decor|decoration panel|centerpiece|mandap)\b/i
  for (const p of result!.products) {
    assert.ok(!decorRe.test(p.name), `unexpected decor item returned: ${p.name}`)
  }
})

test('Product Recommender - "show me products for accessories for this" anchors to the garment from context', async () => {
  const result = await maybeRecommendProducts({
    userMessage: 'show me products for accessories for this',
    mode: 'stylist',
    requestedMode: undefined,
    turnNumber: 4,
    threadId: 'test-thread-explicit-5',
    previousAssistantText: 'For a traditional ivory sherwani, accessories can truly elevate the look: a matching safa, a pearl necklace, and ivory juttis.',
    previousUserText: 'Can I see matching accessories for this?',
    history: []
  })
  assert.ok(result !== null)
  assert.ok(result!.products.length > 0)
})
