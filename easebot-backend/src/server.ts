import 'dotenv/config'
import { app } from './app'

const PORT = process.env.PORT ?? 3001

app.listen(PORT, () => {
  console.log(`[easebot] Server running on http://localhost:${PORT}`)
  console.log(`[easebot] Speech & Translation pipeline: ${process.env.ENABLE_SPEECH_TRANSLATION === 'true' ? 'ON' : 'OFF'}`)
})
