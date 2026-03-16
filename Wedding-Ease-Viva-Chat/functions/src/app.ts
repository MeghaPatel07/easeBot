import express from 'express'
import cors from 'cors'
import chatRouter from './routes/chat'
import transcribeRouter from './routes/transcribe'

const app = express()

// CORS — allow all origins (Firebase handles auth via Bearer token)
app.use(cors({ origin: true }))
app.use(express.json({ limit: '10mb' }))  // 10mb for audio base64 payloads

// Routes
app.use('/chat', chatRouter)
app.use('/transcribe', transcribeRouter)

// Health check
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }))

export { app }
