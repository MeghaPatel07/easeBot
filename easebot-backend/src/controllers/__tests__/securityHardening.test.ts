// Consolidated security-hardening controller tests (2026-06-01).
//
//   WE-20260527-1006  feedback: reject body-supplied userId that mismatches the
//                     authenticated token; never trust body userId.
//   WE-20260527-1003  /share/:shareId: scrub PII (ownerEmail, lastEditedBy,
//                     ownerId, collaborators, collaboratorEmails).
//
// Technique: seed require.cache with a fake `lib/firebaseAdmin` BEFORE importing
// the controllers, so no Firebase network / credentials are needed.
//
// Run: npx ts-node --transpile-only src/controllers/__tests__/securityHardening.test.ts

import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import * as path from 'path'

// ── Mock firebaseAdmin ──────────────────────────────────────────────────────
const writtenDocs: Array<Record<string, unknown>> = []
const adminPath = path.resolve(__dirname, '..', '..', 'lib', 'firebaseAdmin.ts')
require.cache[adminPath] = {
  id: adminPath,
  filename: adminPath,
  loaded: true,
  children: [],
  exports: {
    adminAuth: {},
    adminDb: {
      collection: (_name: string) => ({
        add: async (doc: Record<string, unknown>) => {
          writtenDocs.push(doc)
          return { id: 'fake-doc-id' }
        },
      }),
    },
    adminApp: {},
  },
} as unknown as NodeModule

// FieldValue.serverTimestamp() is called by the feedback controller — stub it.
const fsPath = require.resolve('firebase-admin/firestore')
const realFs = require('firebase-admin/firestore')
require.cache[fsPath] = {
  id: fsPath,
  filename: fsPath,
  loaded: true,
  children: [],
  exports: { ...realFs, FieldValue: { serverTimestamp: () => '__ts__' } },
} as unknown as NodeModule

const origErr = console.error
console.error = () => {}

import { handleCreateFeedback } from '../feedbackController'
import { scrubSharedNote } from '../notesController'

// ── Fake req/res ────────────────────────────────────────────────────────────
function makeRes(): any {
  return {
    statusCode: null,
    body: undefined,
    status(c: number) { this.statusCode = c; return this },
    json(b: unknown) { this.body = b; return this },
  }
}

// ── WE-20260527-1006 feedback userId binding ────────────────────────────────
test('feedback: body userId matching the token uid is accepted', async () => {
  writtenDocs.length = 0
  const req: any = {
    user: { uid: 'u-1' },
    headers: {},
    body: { feedback: 'this is long enough feedback', userId: 'u-1' },
  }
  const res = makeRes()
  await handleCreateFeedback(req, res)
  assert.equal(res.statusCode, 201)
  assert.equal(writtenDocs.length, 1)
  assert.equal(writtenDocs[0].userId, 'u-1', 'stored uid is the token uid')
})

test('feedback: body userId DIFFERENT from token uid is rejected 403', async () => {
  writtenDocs.length = 0
  const req: any = {
    user: { uid: 'u-1' },
    headers: {},
    body: { feedback: 'this is long enough feedback', userId: 'victim-uid' },
  }
  const res = makeRes()
  await handleCreateFeedback(req, res)
  assert.equal(res.statusCode, 403, 'must reject impersonation attempt')
  assert.equal(writtenDocs.length, 0, 'nothing written on mismatch')
})

test('feedback: guest (no token) supplying a userId is rejected 403', async () => {
  writtenDocs.length = 0
  const req: any = {
    user: undefined,
    headers: {},
    body: { feedback: 'this is long enough feedback', userId: 'someone-else' },
  }
  const res = makeRes()
  await handleCreateFeedback(req, res)
  assert.equal(res.statusCode, 403, 'a guest may not claim any uid')
  assert.equal(writtenDocs.length, 0)
})

test('feedback: guest with no userId succeeds and stores userId=null', async () => {
  writtenDocs.length = 0
  const req: any = {
    user: undefined,
    headers: { 'user-agent': 'ua' },
    body: { feedback: 'this is long enough feedback' },
  }
  const res = makeRes()
  await handleCreateFeedback(req, res)
  assert.equal(res.statusCode, 201)
  assert.equal(writtenDocs[0].userId, null)
  assert.equal(writtenDocs[0].isGuest, true)
})

test('feedback: authed user with no body userId stores the token uid', async () => {
  writtenDocs.length = 0
  const req: any = {
    user: { uid: 'u-9' },
    headers: {},
    body: { feedback: 'this is long enough feedback' },
  }
  const res = makeRes()
  await handleCreateFeedback(req, res)
  assert.equal(res.statusCode, 201)
  assert.equal(writtenDocs[0].userId, 'u-9')
})

// ── WE-20260527-1003 shared-note PII scrub ──────────────────────────────────
test('scrubSharedNote: strips owner/collaborator PII, keeps renderable fields', () => {
  const full = {
    id: 'note-1',
    title: 'Our Wedding Plan',
    content: '[{"type":"p","text":"hi"}]',
    icon: '💍',
    coverImage: null,
    tags: ['a'],
    publicAccess: { enabled: true, permission: 'view', shareId: 'sid' },
    publicShareId: 'sid',
    wordCount: 42,
    ownerEmail: 'owner@example.com',
    ownerId: 'owner-uid',
    lastEditedBy: 'editor@example.com',
    collaborators: ['c-uid-1'],
    collaboratorEmails: ['friend@example.com'],
  }
  const safe = scrubSharedNote(full)

  // PII removed
  assert.equal('ownerEmail' in safe, false)
  assert.equal('ownerId' in safe, false)
  assert.equal('lastEditedBy' in safe, false)
  assert.equal('collaborators' in safe, false)
  assert.equal('collaboratorEmails' in safe, false)
  const serialized = JSON.stringify(safe)
  assert.ok(!serialized.includes('owner@example.com'))
  assert.ok(!serialized.includes('editor@example.com'))
  assert.ok(!serialized.includes('friend@example.com'))

  // Renderable content preserved
  assert.equal(safe.title, 'Our Wedding Plan')
  assert.equal(safe.content, full.content)
  assert.equal(safe.wordCount, 42)
  assert.equal(safe.publicAccess.enabled, true)
})

process.on('exit', () => { console.error = origErr })
