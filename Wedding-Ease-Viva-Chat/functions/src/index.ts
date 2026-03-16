import 'dotenv/config'
import * as admin from 'firebase-admin'
import { app } from './app'

// Initialise Firebase Admin SDK once
// Requires GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account JSON
admin.initializeApp()

const PORT = process.env.PORT ?? 3001

app.listen(PORT, () => {
  console.log(`[server] WeddingEase backend running on http://localhost:${PORT}`)
})
