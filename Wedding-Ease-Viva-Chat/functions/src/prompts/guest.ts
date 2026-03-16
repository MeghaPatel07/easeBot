/**
 * Compact prompt used for unauthenticated (guest) users.
 * Covers all modes in ~55 tokens vs ~200 tokens for the full per-mode prompts.
 * Keeps responses short to minimise token spend on unverified users.
 */
export function getGuestPrompt(): string {
  return `You are Viva, a wedding AI assistant. Answer wedding questions concisely—planning, style, budget, vendors, traditions, or emotional support. Be warm and practical. Keep replies short (2-4 sentences or a brief list). No lengthy introductions.`
}
