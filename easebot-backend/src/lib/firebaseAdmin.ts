// Firebase Admin SDK initialization (singleton).
//
// Credential resolution order (each suffixed by _DEV instead when
// FIREBASE_ENV=dev — see buildApp below):
//   1. FIREBASE_SERVICE_ACCOUNT_JSON  — full service-account JSON as a string
//   2. FIREBASE_SERVICE_ACCOUNT_PATH  — file path to a service-account JSON file
//   3. GOOGLE_APPLICATION_CREDENTIALS  — file path (handled natively by applicationDefault)
//   4. applicationDefault()            — falls back; logs a warning if nothing is configured
//
// The Admin SDK bypasses Firestore security rules; per-user authorization MUST
// be enforced in controllers via `req.user.uid`, never trusted from request bodies.
import {
  initializeApp,
  cert,
  applicationDefault,
  getApps,
  getApp,
  type App,
} from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'

function buildApp(): App {
  if (getApps().length > 0) return getApp()

  // Same rule as lib/firebase.ts: FIREBASE_ENV is local-only. Deployed
  // (Railway) instances never set it, so a missing value always means prod.
  const firebaseEnv = process.env.FIREBASE_ENV === 'dev' ? 'dev' : 'prod'
  const projectId = firebaseEnv === 'dev'
    ? process.env.FIREBASE_PROJECT_ID_DEV
    : process.env.FIREBASE_PROJECT_ID

  // 1. Inline JSON via env var
  const inlineJson = firebaseEnv === 'dev'
    ? process.env.FIREBASE_SERVICE_ACCOUNT_JSON_DEV
    : process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (inlineJson && inlineJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(inlineJson)
      return initializeApp({
        credential: cert(parsed),
        projectId: parsed.project_id ?? projectId,
      })
    } catch (err) {
      console.error(
        '[firebaseAdmin] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON; falling back to applicationDefault().',
        err instanceof Error ? err.message : err,
      )
    }
  }

  // 2. File path via env var — reads the key straight off disk, no inlining needed.
  const servicePath = firebaseEnv === 'dev'
    ? process.env.FIREBASE_SERVICE_ACCOUNT_PATH_DEV
    : process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  if (servicePath && servicePath.trim().length > 0) {
    try {
      const parsed = JSON.parse(readFileSync(servicePath, 'utf-8'))
      return initializeApp({
        credential: cert(parsed),
        projectId: parsed.project_id ?? projectId,
      })
    } catch (err) {
      console.error(
        `[firebaseAdmin] Failed to read/parse service account at ${servicePath}; falling back to applicationDefault().`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  // 3 + 4. GOOGLE_APPLICATION_CREDENTIALS file path is consumed by applicationDefault().
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn(
      '[firebaseAdmin] No FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS set. ' +
        'Falling back to applicationDefault(). Admin operations will fail until credentials are provided.',
    )
  }

  try {
    return initializeApp({
      credential: applicationDefault(),
      projectId,
    })
  } catch (err) {
    console.error(
      '[firebaseAdmin] applicationDefault() initialization failed. Initializing without credentials — Admin SDK calls will fail at runtime.',
      err instanceof Error ? err.message : err,
    )
    return initializeApp({ projectId })
  }
}

export const adminApp: App = buildApp()
export const adminAuth: Auth = getAuth(adminApp)
export const adminDb: Firestore = getFirestore(adminApp)
