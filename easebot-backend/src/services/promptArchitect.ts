import { AzureOpenAI } from 'openai'
import type { Mode } from '../types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PromptArchitectInput {
  userIntent: string
  action: 'generate' | 'edit'
  mode: Mode
  aspectRatio: string
  styleHistory: string[]
  referenceImageBase64?: string
  referenceImageMime?: string
  userProfile?: {
    weddingDate?: string | null
    stylePreferences?: string | null
    budget?: string | number | null
  }
  conversationContext?: string
  groundingContext?: string
  vibeDescriptors?: string[]
}

export interface PromptArchitectOutput {
  expandedPrompt: string
  negativePrompt: string
  styleDescriptors: string[]
  qualityTier: 'low' | 'medium' | 'high'
  suggestedBackground: 'opaque' | 'transparent' | 'auto'
}

// ── System prompt ────────────────────────────────────────────────────────────

const ARCHITECT_SYSTEM_PROMPT = `You are a Visual Prompt Architect — the "thinking engine" for an image generation pipeline. Your job is to REASON through the user's intent and produce a precise, MODERN, visually stunning specification that a non-thinking image model can execute perfectly on the first try.

## YOUR AESTHETIC NORTH STAR
Every image you architect should look like it belongs on:
- A 2025 Pinterest wedding board with 100K+ saves
- A Vogue/Harper's Bazaar wedding editorial spread
- A top-tier wedding photographer's portfolio (think José Villa, Greg Finck, KT Merry)

DEFAULT to modern, clean, aspirational aesthetics. NEVER produce anything that looks dated, cluttered, generic, or stock-photo-like.

## YOUR REASONING PROCESS (execute silently, output only the result):

STEP 1 — INTENT DECOMPOSITION
Break the request into discrete visual elements:
- Primary subject (who/what is the focal point?)
- Secondary elements (background, props, other people?)
- Action/pose (what is happening?)
- Emotional register (joyful, serene, dramatic, playful?)

STEP 2 — SPATIAL PLANNING
Plan the image layout with MODERN composition:
- Clean negative space — don't overcrowd the frame
- Rule of thirds with intentional breathing room
- Clear visual hierarchy — one hero element, supporting elements recede
- Depth: shallow depth of field (f/1.4–2.8) to separate subject from background
- Modern framing: slightly off-center subjects, environmental portraits, editorial crops

STEP 3 — VISUAL SPECIFICATION (MODERN DEFAULTS)
Lighting:
- Golden hour backlighting with lens flare (outdoor)
- Soft diffused window light with gentle shadows (indoor)
- Warm color temperature (3200K–4500K), NEVER flat fluorescent
- Rim lighting to separate subject from background
- AVOID: harsh overhead lighting, flat flash, even shadowless lighting

Camera & Style:
- 85mm f/1.4 portrait lens for people (creamy bokeh)
- 35mm f/1.8 for environmental/venue shots
- Film-inspired color grading: lifted blacks, warm highlights, desaturated midtones
- Think Fuji 400H or Portra 800 film stock look
- AVOID: oversaturated HDR, heavy vignette, dated Lightroom presets

Colors & Mood:
- Modern palettes: dusty rose + sage + terracotta, ivory + champagne + deep green, lavender + slate + gold, black + white + emerald
- Muted, sophisticated tones over bright saturated colors
- Rich texture contrast: matte fabrics against metallic accents, raw natural materials with polished details
- AVOID: neon colors, primary color combos, overly bright/saturated palettes

STEP 4 — CULTURAL GROUNDING
If cultural elements are mentioned:
- Use EXACT traditional names (lehenga choli, not "Indian dress"; chuppah, not "wedding canopy")
- Add authentic ceremonial details BUT styled in a MODERN, elevated way
- Traditional elements should feel contemporary and editorial, not dated or tourist-brochure-like
- Example: a Sabyasachi-style lehenga shot like a Vogue India editorial, not a stock photo
- Blend cultural authenticity with modern styling — think Manish Malhotra meets minimalism

STEP 5 — NEGATIVE CONSTRAINTS
Always include these in negativePrompt:
- old-fashioned, dated, retro, vintage filter, heavy HDR, oversaturated
- stock photo, generic, clipart, cartoon, illustration style
- cluttered background, busy composition, messy framing
- flat lighting, harsh shadows, fluorescent lighting
- low resolution, blurry, grainy, noisy
- distorted faces, hands, or cultural symbols
- text, watermarks, logos, UI elements

STEP 6 — CONSISTENCY CHECK
If style history is provided, match the established palette, lighting, and aesthetic.

## OUTPUT FORMAT:
Return ONLY a JSON object (no markdown, no explanation):
{
  "expandedPrompt": "...",
  "negativePrompt": "...",
  "styleDescriptors": ["descriptor1", "descriptor2"],
  "qualityTier": "high",
  "suggestedBackground": "opaque"
}

- expandedPrompt: Single paragraph, 200-400 words for generation, under 50 words for edits. MUST include specific modern lighting, lens, color grading, and composition direction.
- negativePrompt: Comma-separated list — ALWAYS include "old-fashioned, dated, stock photo, cluttered, flat lighting, oversaturated, HDR"
- styleDescriptors: 3-6 keywords for cross-generation consistency
- qualityTier: "high" for detailed scenes, "medium" for simple, "low" for quick drafts
- suggestedBackground: "transparent" for design elements (invites, logos), else "opaque"

## RULES:
- Never contradict the user's stated intent. Only ADD missing visual details.
- If the user specified a color, use THAT color — but ensure it's styled in a modern, sophisticated way.
- For EDITS: output only the change description, not the full image spec. Keep expandedPrompt under 50 words.
- ALWAYS default to modern over traditional unless the user explicitly asks for traditional/vintage.
- Match the mode context: stylist = high-fashion Vogue editorial | planner = clean minimalist Pinterest | knowledge = culturally authentic but modern editorial | assistant = versatile premium contemporary`

// ── Build user prompt for architect ──────────────────────────────────────────

function buildArchitectUserPrompt(input: PromptArchitectInput): string {
  const parts: string[] = []

  if (input.vibeDescriptors && input.vibeDescriptors.length > 0) {
    parts.push(
      `REQUIRED STYLE CONSTRAINTS (the user has locked in a wedding vibe — these descriptors MUST be honored in the expanded prompt and styleDescriptors output): ${input.vibeDescriptors.join(', ')}`
    )
  }

  parts.push(`ACTION: ${input.action}`)
  parts.push(`USER INTENT: ${input.userIntent}`)
  parts.push(`MODE: ${input.mode}`)
  parts.push(`ASPECT RATIO: ${input.aspectRatio}`)

  if (input.styleHistory.length > 0) {
    parts.push(`STYLE HISTORY (maintain consistency): ${input.styleHistory.join(', ')}`)
  }

  if (input.groundingContext) {
    parts.push(`DOMAIN CONTEXT: ${input.groundingContext}`)
  }

  if (input.userProfile) {
    const profile: string[] = []
    if (input.userProfile.weddingDate) profile.push(`Wedding date: ${input.userProfile.weddingDate}`)
    if (input.userProfile.stylePreferences) profile.push(`Style: ${input.userProfile.stylePreferences}`)
    if (input.userProfile.budget) profile.push(`Budget: ${input.userProfile.budget}`)
    if (profile.length > 0) parts.push(`USER PROFILE: ${profile.join(' | ')}`)
  }

  if (input.conversationContext) {
    parts.push(`RECENT CONTEXT: ${input.conversationContext}`)
  }

  return parts.join('\n')
}

// ── Default fallback output ──────────────────────────────────────────────────

function buildFallbackOutput(input: PromptArchitectInput): PromptArchitectOutput {
  const vibeSuffix = input.vibeDescriptors && input.vibeDescriptors.length > 0
    ? ` Locked wedding vibe style constraints that MUST be reflected: ${input.vibeDescriptors.join(', ')}.`
    : ''
  return {
    expandedPrompt: `${input.userIntent}.${vibeSuffix} Modern editorial photography, soft golden-hour backlighting, shallow depth of field at f/1.8, film-inspired color grading with warm highlights and lifted blacks, clean minimalist composition, aspirational Pinterest-worthy aesthetic.`,
    negativePrompt: 'old-fashioned, dated, stock photo, cluttered, flat lighting, oversaturated, HDR, blurry, distorted, watermark, cartoon, generic',
    styleDescriptors: input.vibeDescriptors ? [...input.vibeDescriptors].slice(0, 20) : [],
    qualityTier: 'high',
    suggestedBackground: 'opaque',
  }
}

// ── Main function ────────────────────────────────────────────────────────────

export async function expandWithPromptArchitect(
  input: PromptArchitectInput
): Promise<PromptArchitectOutput> {
  // Kill switch
  if (process.env.ENABLE_PROMPT_ARCHITECT === 'false') {
    return buildFallbackOutput(input)
  }

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT
  const apiKey = process.env.AZURE_OPENAI_API_KEY
  const deployment = process.env.AZURE_DEPLOYMENT_NAME ?? 'gpt-4o'

  if (!endpoint || !apiKey) {
    console.warn('[promptArchitect] No Azure credentials, using fallback')
    return buildFallbackOutput(input)
  }

  try {
    const client = new AzureOpenAI({
      endpoint,
      apiKey,
      deployment,
      apiVersion: '2024-08-01-preview',
    })

    const userPrompt = buildArchitectUserPrompt(input)

    // Build messages with optional vision input
    const userContent: any = input.referenceImageBase64
      ? [
          { type: 'text' as const, text: userPrompt },
          {
            type: 'image_url' as const,
            image_url: {
              url: `data:${input.referenceImageMime || 'image/png'};base64,${input.referenceImageBase64}`,
              detail: 'low' as const, // low = fast + cheap, enough for context
            },
          },
        ]
      : userPrompt

    const completion = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: 'system', content: ARCHITECT_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 800,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content
    if (!raw) {
      console.warn('[promptArchitect] Empty response, using fallback')
      return buildFallbackOutput(input)
    }

    const parsed = JSON.parse(raw) as Partial<PromptArchitectOutput>

    // Validate and fill defaults
    return {
      expandedPrompt: parsed.expandedPrompt || buildFallbackOutput(input).expandedPrompt,
      negativePrompt: parsed.negativePrompt || 'blurry, distorted, watermark, low quality',
      styleDescriptors: Array.isArray(parsed.styleDescriptors) ? parsed.styleDescriptors.slice(0, 20) : [],
      qualityTier: ['low', 'medium', 'high'].includes(parsed.qualityTier ?? '') ? parsed.qualityTier! : 'high',
      suggestedBackground: ['opaque', 'transparent', 'auto'].includes(parsed.suggestedBackground ?? '') ? parsed.suggestedBackground! : 'opaque',
    }
  } catch (err) {
    console.error('[promptArchitect] Error, using fallback:', err)
    return buildFallbackOutput(input)
  }
}
