import { initializeApp, getApps } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

// FIREBASE_ENV only ever matters locally — deployed (Railway) instances
// should never set it, so a missing/typo'd value always resolves to prod.
const firebaseEnv = process.env.FIREBASE_ENV === 'dev' ? 'dev' : 'prod'

const firebaseConfig = firebaseEnv === 'dev'
  ? {
      apiKey:            process.env.FIREBASE_API_KEY_DEV,
      authDomain:        process.env.FIREBASE_AUTH_DOMAIN_DEV,
      projectId:         process.env.FIREBASE_PROJECT_ID_DEV,
      storageBucket:     process.env.FIREBASE_STORAGE_BUCKET_DEV,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID_DEV,
      appId:             process.env.FIREBASE_APP_ID_DEV,
    }
  : {
      apiKey:            process.env.FIREBASE_API_KEY,
      authDomain:        process.env.FIREBASE_AUTH_DOMAIN,
      projectId:         process.env.FIREBASE_PROJECT_ID,
      storageBucket:     process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId:             process.env.FIREBASE_APP_ID,
    }

const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export const db = getFirestore(firebaseApp)
