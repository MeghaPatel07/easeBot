import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'
import { getStorage } from 'firebase/storage'

// VITE_FIREBASE_ENV only ever matters locally — deployed (Vercel) builds
// should never set it, so a missing/typo'd value always resolves to prod.
const firebaseEnv = import.meta.env.VITE_FIREBASE_ENV === 'dev' ? 'dev' : 'prod'

const firebaseConfig = firebaseEnv === 'dev'
  ? {
      apiKey: import.meta.env.VITE_FIREBASE_DEV_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_DEV_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_DEV_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_DEV_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_DEV_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_DEV_APP_ID,
    }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    }

const app = initializeApp(firebaseConfig)

// Non-prod builds (local dev) log the active project so it's obvious in
// devtools whether this instance is pointed at dev or prod Firebase — Vercel
// deployments always run prod, so this should only ever print dev locally.
if (!import.meta.env.PROD) {
  console.log(`[firebase] project: ${firebaseConfig.projectId} (${firebaseEnv})`)
}

export const auth = getAuth(app)
// `ignoreUndefinedProperties: true` so writes don't throw when a document
// carries an undefined field (e.g. older messages without `mode`, or a
// product with an unset optional field). Without this flag addDoc / setDoc
// fails on any undefined, which has broken the chat-share flow before.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true })
export const functions = getFunctions(app)
export const storage = getStorage(app)

export default app
