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
