import { Request, Response } from 'express'

export async function getSpeechToken(_req: Request, res: Response): Promise<void> {
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION

  if (!key || !region) {
    res.status(500).json({ error: 'Azure Speech not configured' })
    return
  }

  try {
    const response = await fetch(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key } }
    )
    const token = await response.text()
    res.json({ token, region })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to fetch speech token' })
  }
}
