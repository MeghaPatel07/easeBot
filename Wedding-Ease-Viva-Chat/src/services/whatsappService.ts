import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'

export interface WhatsAppMessageParams {
  to: string
  text: string
  imageUrl: string | null
}

/**
 * Minimal WhatsApp helper — wraps the Firebase callable `sendWhatsAppMessage`.
 * The cloud function already exists in production; we only call it.
 */
export class WhatsAppService {
  /**
   * Send a WhatsApp message via the `sendWhatsAppMessage` callable.
   * @param phoneNumber Digit-only phone (e.g. "916353817704") — caller should format first.
   * @param message     Message body.
   * @param imageUrl    Optional image URL.
   */
  static async sendWhatsAppMessage(
    phoneNumber: string,
    message: string,
    imageUrl: string | null = null,
  ): Promise<unknown> {
    const sendWhatsAppMessageFn = httpsCallable<WhatsAppMessageParams, unknown>(
      functions,
      'sendWhatsAppMessage',
    )
    const result = await sendWhatsAppMessageFn({
      to: phoneNumber,
      text: message,
      imageUrl,
    })
    return result.data
  }

  /**
   * Normalize a phone number to digits only, stripping `+`, spaces, and leading zeroes.
   * If exactly 10 digits and not starting with 91, defaults to adding the 91 country code.
   */
  static formatPhoneNumber(phoneNumber: string): string {
    if (!phoneNumber) return ''
    let cleaned = phoneNumber.replace(/\D/g, '')
    if (cleaned.startsWith('0')) cleaned = cleaned.substring(1)
    if (cleaned.length === 10 && !cleaned.startsWith('91')) cleaned = '91' + cleaned
    return cleaned
  }
}
