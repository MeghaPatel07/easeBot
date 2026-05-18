// Firebase Admin SDK initialization (singleton).
//
// Credential resolution order:
//   1. FIREBASE_SERVICE_ACCOUNT_JSON  — full service-account JSON as a string
//   2. GOOGLE_APPLICATION_CREDENTIALS  — file path (handled natively by applicationDefault)
//   3. applicationDefault()            — falls back; logs a warning if nothing is configured
//
// The Admin SDK bypasses Firestore security rules; per-user authorization MUST
// be enforced in controllers via `req.user.uid`, never trusted from request bodies.
import * as fs from 'fs'
import * as path from 'path'
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

function buildApp(): App {
  if (getApps().length > 0) return getApp()

  const projectId = process.env.FIREBASE_PROJECT_ID
  const credentialsPath = path.resolve(__dirname, '../../../wedding-ease-dc99a-firebase-adminsdk-hp8cd-2136a8a0c3.json')

  // 1. Load credentials from direct file path
  if (fs.existsSync(credentialsPath)) {
    try {
      const credentialsJson = fs.readFileSync(credentialsPath, 'utf8')
      const parsed = JSON.parse(credentialsJson)
      return initializeApp({
        credential: cert(parsed),
        projectId: parsed.project_id ?? projectId,
      })
    } catch (err) {
      console.error(
        '[firebaseAdmin] Failed to load credentials from file path; falling back to applicationDefault().',
        err instanceof Error ? err.message : err,
      )
    }
  } else {
    console.warn(
      '[firebaseAdmin] Credentials file not found at',
      credentialsPath,
    )
  }

  // 2. Fallback to GOOGLE_APPLICATION_CREDENTIALS env var
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn(
      '[firebaseAdmin] No GOOGLE_APPLICATION_CREDENTIALS set. ' +
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
