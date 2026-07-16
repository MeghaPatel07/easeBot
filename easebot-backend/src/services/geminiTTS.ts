

const GEMINI_TTS_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent'

/** Build a WAV file Buffer from raw 16-bit PCM data */
function pcmToWav(pcmBuffer: Buffer, sampleRate = 24000, channels = 1, bitDepth = 16): Buffer {
  const byteRate = sampleRate * channels * (bitDepth / 8)
  const blockAlign = channels * (bitDepth / 8)
  const dataSize = pcmBuffer.length
  const headerSize = 44
  const wav = Buffer.alloc(headerSize + dataSize)

  // RIFF chunk
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + dataSize, 4)
  wav.write('WAVE', 8)

  // fmt sub-chunk
  wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16)           // sub-chunk size
  wav.writeUInt16LE(1, 20)            // PCM = 1
  wav.writeUInt16LE(channels, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(byteRate, 28)
  wav.writeUInt16LE(blockAlign, 32)
  wav.writeUInt16LE(bitDepth, 34)

  // data sub-chunk
  wav.write('data', 36)
  wav.writeUInt32LE(dataSize, 40)
  pcmBuffer.copy(wav, 44)

  return wav
}

export interface TTSOptions {
  text: string
  voiceName?: string   // Gemini voice name e.g. 'Kore', 'Aoede', 'Puck'
  language?: string    // BCP-47 hint injected as instruction e.g. 'gu', 'hi'
}

// Map language codes to full names for the instruction
const LANG_NAMES: Record<string, string> = {
  hi: 'Hindi', gu: 'Gujarati', es: 'Spanish', fr: 'French',
  ar: 'Arabic', pt: 'Portuguese', de: 'German', zh: 'Chinese',
  ja: 'Japanese', ko: 'Korean', ru: 'Russian', it: 'Italian',
}

export async function generateSpeech(options: TTSOptions): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

  const { text, voiceName = 'Kore', language } = options

  // Prepend a language instruction when non-English so Gemini TTS uses the right phonetics
  let speakText = text
  if (language && language !== 'en' && language !== 'auto') {
    const langName = LANG_NAMES[language] ?? language
    speakText = `<speak_language>${langName}</speak_language>\n${text}`
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: speakText }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName }
        }
      }
    }
  }

  const res = await fetch(`${GEMINI_TTS_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini TTS API error ${res.status}: ${err}`)
  }

  const json = await res.json() as any
  const audioData: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
  if (!audioData) throw new Error('No audio data in Gemini TTS response')

  const pcmBuffer = Buffer.from(audioData, 'base64')
  return pcmToWav(pcmBuffer)
}
