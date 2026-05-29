// Unit tests for inputSanitizer middleware — WE-20260528-203
// Run from easebot-backend/:
//   npx ts-node --transpile-only src/middleware/__tests__/inputSanitizer.test.ts
// or:
//   npm run test:sanitizer
//
// Uses Node's built-in node:test runner + assert — zero new deps.

import { test } from 'node:test'
import * as assert from 'node:assert/strict'

import {
  inputSanitizer,
  __sanitizeObjectForTests,
  __sanitizeStringForTests,
} from '../inputSanitizer'

// ────────────────────────────────────────────────────────────────────────────
// Primary regression — the bug the ticket filed.

test('history[].content has NUL bytes / BEL / ANSI ESC stripped (WE-20260528-203)', () => {
  const body = {
    message: 'hi',
    history: [
      { role: 'user', content: 'NUL\x00 BEL\x07 evil \x1B[31mRED\x1B[0m end' },
    ],
  }
  __sanitizeObjectForTests(body)
  const content = (body.history[0] as { content: string }).content
  assert.equal(
    content,
    'NUL BEL evil [31mRED[0m end',
    'NUL (0x00), BEL (0x07), ESC (0x1B) must all be stripped',
  )
  assert.ok(!content.includes('\x00'), 'no NUL bytes survive')
  assert.ok(!content.includes('\x1B'), 'no ESC bytes survive')
  assert.ok(!content.includes('\x07'), 'no BEL bytes survive')
})

test('vibeTitle with ANSI ESC sequence is sanitized', () => {
  const body = {
    vibeTitle: '\x1B[2J\x1B[Hclear-screen attack',
  }
  __sanitizeObjectForTests(body)
  assert.equal(body.vibeTitle, '[2J[Hclear-screen attack')
  assert.ok(!(body.vibeTitle as string).includes('\x1B'))
})

test('vibeDescriptors[] string elements are sanitized in-place', () => {
  const body = {
    vibeDescriptors: ['romantic\x00', 'mod\x1Bern', 'classic'],
  }
  __sanitizeObjectForTests(body)
  assert.deepEqual(body.vibeDescriptors, ['romantic', 'modern', 'classic'])
})

test('base64 field imageData is left untouched even when it contains bytes that LOOK like control chars', () => {
  // Real base64 alphabet is [A-Za-z0-9+/=] — no control bytes. But if a client
  // ever sends a non-strict base64 payload containing ESC etc., we must NOT
  // mutate it because that breaks decoding for the LLM image pipeline.
  const original = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII='
  const body = {
    message: 'check this image',
    imageData: original,
    imageBase64: original,
    audioBase64: original,
  }
  __sanitizeObjectForTests(body)
  assert.equal(body.imageData, original, 'imageData must be byte-for-byte identical')
  assert.equal(body.imageBase64, original, 'imageBase64 must be byte-for-byte identical')
  assert.equal(body.audioBase64, original, 'audioBase64 must be byte-for-byte identical')
})

// ────────────────────────────────────────────────────────────────────────────
// Coverage for the other fields the old allowlist silently skipped.

test('imageMimeType, language, threadId all get sanitized (formerly bypassed)', () => {
  const body = {
    imageMimeType: 'image/png\x00',
    language: 'en\x1B',
    threadId: 'thr_abc\x07123',
  }
  __sanitizeObjectForTests(body)
  assert.equal(body.imageMimeType, 'image/png')
  assert.equal(body.language, 'en')
  assert.equal(body.threadId, 'thr_abc123')
})

test('deeply nested user-controlled strings get sanitized', () => {
  const body = {
    userPersonalization: {
      partnerNames: {
        first: 'Alice\x00',
        second: '\x1BBob',
      },
      toneSettings: {
        formality: 'casual\x07',
      },
    },
  }
  __sanitizeObjectForTests(body)
  const up = body.userPersonalization as Record<string, Record<string, string>>
  assert.equal(up.partnerNames.first, 'Alice')
  assert.equal(up.partnerNames.second, 'Bob')
  assert.equal(up.toneSettings.formality, 'casual')
})

// ────────────────────────────────────────────────────────────────────────────
// Whitespace preservation — tabs / newlines / CR must survive.

test('printable whitespace (tab, newline, CR) survives sanitization', () => {
  const v = 'line1\nline2\tindented\r\nline3'
  assert.equal(__sanitizeStringForTests(v), v)
})

test('Unicode / emoji / non-Latin scripts survive sanitization', () => {
  const v = 'नमस्ते 🎉 café Ωmega'
  assert.equal(__sanitizeStringForTests(v), v)
})

test('leading/trailing whitespace is trimmed', () => {
  assert.equal(__sanitizeStringForTests('  hello  '), 'hello')
})

// ────────────────────────────────────────────────────────────────────────────
// Non-string leaves are untouched.

test('numbers, booleans, null are left untouched', () => {
  const body = {
    message: 'ok\x00',
    count: 42,
    flag: true,
    nullable: null,
    nested: { num: 3.14, bool: false },
  }
  __sanitizeObjectForTests(body)
  assert.equal(body.message, 'ok')
  assert.equal(body.count, 42)
  assert.equal(body.flag, true)
  assert.equal(body.nullable, null)
  assert.equal((body.nested as Record<string, unknown>).num, 3.14)
  assert.equal((body.nested as Record<string, unknown>).bool, false)
})

// ────────────────────────────────────────────────────────────────────────────
// Express middleware shape.

test('middleware no-ops when req.body is missing or non-object', () => {
  let nextCalled = 0
  const next = (): void => { nextCalled += 1 }
  // Body missing
  inputSanitizer({ body: undefined } as never, {} as never, next)
  // Body is a string (e.g. raw text)
  inputSanitizer({ body: 'raw text\x00' } as never, {} as never, next)
  // Body is null
  inputSanitizer({ body: null } as never, {} as never, next)
  assert.equal(nextCalled, 3, 'next() called for all three')
})

test('middleware mutates req.body in place and calls next exactly once', () => {
  const req = {
    body: {
      message: 'hello\x00',
      history: [{ role: 'user', content: 'nul\x00here' }],
    },
  }
  let nextCalled = 0
  inputSanitizer(req as never, {} as never, () => { nextCalled += 1 })
  assert.equal(nextCalled, 1)
  assert.equal(req.body.message, 'hello')
  assert.equal((req.body.history[0] as { content: string }).content, 'nulhere')
})
