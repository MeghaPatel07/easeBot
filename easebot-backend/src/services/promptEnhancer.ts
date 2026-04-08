/**
 * Image Prompt Enhancer
 * Enriches raw user image prompts with style descriptors, composition hints,
 * and wedding context based on the active mode. Deterministic (no LLM call).
 */

const MODE_STYLE_DESCRIPTORS: Record<string, string> = {
  stylist: 'elegant, high-fashion editorial photography',
  planner: 'clean, organized, professional event photography',
  knowledge: 'classic, traditional, culturally authentic photography',
}

const COMPOSITION_HINTS = 'well-composed, high quality, detailed'
const WEDDING_CONTEXT = 'wedding themed, celebratory atmosphere'
const NEGATIVE_CONSTRAINTS =
  'No text overlays, no watermarks, no distortion, no blurry elements'

/**
 * Enhance a raw user image prompt with style, composition, and wedding context.
 *
 * @param userPrompt - The original prompt from the user
 * @param mode       - The current chat mode (stylist, planner, knowledge, etc.)
 * @returns The enhanced prompt string
 */
export function enhanceImagePrompt(userPrompt: string, mode: string): string {
  const styleDescriptor = MODE_STYLE_DESCRIPTORS[mode] ?? 'beautiful, professional photography'

  const parts = [
    userPrompt.trim(),
    styleDescriptor,
    COMPOSITION_HINTS,
    WEDDING_CONTEXT,
    NEGATIVE_CONSTRAINTS,
  ]

  return parts.join('. ')
}
