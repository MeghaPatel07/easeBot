import express from 'express'
import cors from 'cors'
import chatRouter from './routes/chat'
import transcribeRouter from './routes/transcribe'
import imageRouter from './routes/image'
import calendarRouter from './routes/calendar'
import checklistsRouter from './routes/checklists'
import ttsRouter from './routes/tts'
import { getSpeechToken } from './controllers/speechTokenController'

const app = express()

app.use(cors({ origin: true }))
app.use(express.json({ limit: '10mb' }))

app.use('/api/chat', chatRouter)
app.use('/api/transcribe', transcribeRouter)
app.use('/api/generate-image', imageRouter)
app.use('/api/calendar', calendarRouter)
app.use('/api/checklists', checklistsRouter)
app.use('/api/tts', ttsRouter)
app.get('/api/speech-token', getSpeechToken)
app.get('/api/health', (_req, res) => res.status(200).json({ status: 'ok', service: 'easebot-backend' }))

export { app }
