/**
 * Gemini Native Image Generation Service
 *
 * Uses Gemini 2.0 Flash (experimental) for native text-to-image and image-to-image
 * generation. This model generates images inline as part of its response, providing
 * superior prompt understanding, text rendering, and conversational editing.
 *
 * Env vars:
 *   GEMINI_API_KEY          – API key from aistudio.google.com/app/apikey
 *   GEMINI_IMAGE_MODEL      – model ID (default: "gemini-2.0-flash-exp")
 */

import sharp from 'sharp'

// ── Constants ─────────────────────────────────────────────────────────────────

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_MODEL = 'gemini-2.5-flash-image'

/** Maximum image size in bytes (500 KB) for storage */
const MAX_IMAGE_BYTES = 500 * 1024

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeminiPart {
  text?: string
  inlineData?: {
    mimeType: string
    data: string  // base64
  }
}

interface GeminiCandidate {
  content: {
    parts: GeminiPart[]
    role: string
  }
  finishReason: string
}

interface GeminiResponse {
  candidates?: GeminiCandidate[]
  error?: { message: string; code: number }
}

// ── System Prompts ────────────────────────────────────────────────────────────

/**
 * Master image generation system prompt — optimized for Gemini's native image gen.
 * Gemini handles image generation conversationally, so the system prompt shapes
 * the style, quality, and domain focus of generated images.
 */
const IMAGE_GEN_SYSTEM = `You are a world-class visual designer AI with native image generation capabilities, specializing in weddings, celebrations, and family occasions across every race, culture, and tradition worldwide.

CORE IDENTITY:
- You generate stunning, photorealistic, publication-quality images for any family member involved in a wedding or celebration
- Every image should look like it belongs in a premium magazine
- You deeply understand traditions across ALL cultures: Indian (Hindu, Sikh, Muslim, Jain, Parsi), Western (Christian, secular), Jewish, Chinese, Japanese, Korean, African, Middle Eastern, Latin American, Southeast Asian, Pacific Islander, Indigenous, and more

ROLE-AWARE GENERATION:
Identify the person's role from the prompt and tailor the image accordingly:
- BRIDE: Focus on bridal attire, jewelry, makeup, hair, bouquet, veil/dupatta — elegant and radiant
- GROOM: Focus on suit/sherwani/tuxedo/traditional wear, boutonniere, grooming — sharp and confident
- FATHER (of bride/groom): Distinguished, proud, formal attire appropriate to culture — warm and dignified
- MOTHER (of bride/groom): Graceful, elegant attire with cultural jewelry — proud and joyful
- BRIDESMAID / GROOMSMAN: Coordinated attire, youthful energy, complementing the couple
- FLOWER GIRL / RING BEARER: Adorable, age-appropriate, miniature versions of formal wear
- GUESTS / FAMILY: Appropriate cultural formal wear, joyful expressions
- COUPLE TOGETHER: Chemistry, connection, matching aesthetic, complementary outfits
- If the role is unclear, generate based on the most natural interpretation of the prompt

CULTURAL AUTHENTICITY:
- Indian: lehenga, sherwani, saree, kurta, mandap, mehndi, maang tikka, jhumkas, pheras, baraat
- Western: gown, tuxedo, veil, altar, boutonniere, tiered cake, first dance
- Chinese: qipao/cheongsam, changshan, tea ceremony, double happiness, red and gold
- Japanese: shiromuku, montsuki, san-san-kudo, origami, sake ceremony
- Korean: hanbok, pyebaek, jujube and chestnuts
- Jewish: chuppah, kippah, ketubah, hora dance, breaking the glass
- Muslim: nikah, walima, hijab styling, henna, modest elegance
- African: kente cloth, gele headwrap, dashiki, jumping the broom, vibrant patterns
- Latin American: mantilla veil, lasso ceremony, arras coins, quinceañera elements
- Adapt to ANY culture or fusion/blend the user describes

IMAGE QUALITY STANDARDS:
- Photorealistic with natural, balanced lighting — match the scene context (indoor, outdoor, evening)
- Accurate true-to-life colors with neutral white balance — never warm-shifted or artificial
- Natural skin tones across ALL ethnicities with correct color temperature
- Professional composition: rule of thirds, leading lines, depth of field
- Fine fabric textures: silk sheen, embroidery detail, lace patterns, sequin sparkle
- Realistic jewelry reflections and metallic surfaces
- Natural bokeh backgrounds with beautiful settings
- 8K quality, sharp focus on subject with artistic background blur

STYLE GUIDELINES:
- Default to elegant, timeless, and sophisticated
- Match the cultural context — don't impose one culture's aesthetic on another
- Include environmental context: venue, florals, ambient details
- People should look natural, joyful, and culturally authentic
- Fabric draping should follow realistic physics
- Represent diverse body types, skin tones, ages, and abilities naturally

IMPORTANT RULES:
- Generate the image directly — do not describe what you would generate
- If the prompt is vague, infer the role and culture from context and enhance with appropriate details
- Always generate at least one image when asked
- For text on images (invitations, signage): render text clearly and legibly
- Keep all content tasteful, elegant, and celebration-appropriate
- NEVER default to only one ethnicity — match what the user describes or asks for`

/**
 * System prompt for image editing — preserves the original while making surgical changes.
 */
const IMAGE_EDIT_SYSTEM = `You are a precision photo editor specializing in wedding, celebration, and family occasion imagery across all cultures.

EDITING RULES:
- Make ONLY the specific change requested — nothing else
- Preserve the EXACT same: person(s), face, skin tone, body pose, expression, hair
- Preserve the EXACT same: background, architecture, lighting, shadows, depth of field
- Preserve the EXACT same: camera angle, framing, composition, color grading
- Keep ALL other clothing/accessories unchanged unless specifically asked to change them
- When changing a garment color: maintain the exact same fabric texture, pattern, and draping
- When changing cultural elements: ensure the replacement is culturally accurate
- The result should look like the same photograph with only the requested modification
- Match lighting and shadow direction on edited elements to the original scene
- Maintain the person's ethnicity, skin tone, and features exactly as they are

ASPECT RATIO RULE (CRITICAL):
- The output image MUST have the EXACT SAME aspect ratio and orientation as the input image
- If the input is horizontal/landscape, the output MUST be horizontal/landscape
- If the input is vertical/portrait, the output MUST be vertical/portrait
- If the input is square, the output MUST be square
- NEVER change the orientation or crop the image differently

OUTPUT: Generate the edited image directly. Do not describe the edit — just produce the result.`

/**
 * System prompt for image analysis (image-to-text).
 */
const IMAGE_ANALYSIS_SYSTEM = `You are Viva, a visual expert in weddings, celebrations, and family occasions across all cultures worldwide.
First identify: the person's likely role (bride, groom, father, mother, bridesmaid, guest, etc.) and cultural context.
Then analyze: attire details, décor, floral arrangements, venue style, color palettes, jewelry, accessories, table settings, and cultural elements.
Be concise — max 3-4 sentences. Skip unrelated details.`

// ── Image Compression ─────────────────────────────────────────────────────────

/**
 * Compress a base64 image to fit under MAX_IMAGE_BYTES using sharp.
 * Returns a base64 string (no data URI prefix).
 */
async function compressImage(b64: string): Promise<string> {
  const inputBuffer = Buffer.from(b64, 'base64')

  if (inputBuffer.length <= MAX_IMAGE_BYTES) return b64

  try {
    for (const quality of [80, 65, 50, 40, 30]) {
      const compressed = await sharp(inputBuffer)
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()

      if (compressed.length <= MAX_IMAGE_BYTES) {
        console.log(`[geminiImage] Compressed ${Math.round(inputBuffer.length / 1024)}KB → ${Math.round(compressed.length / 1024)}KB (q=${quality})`)
        return compressed.toString('base64')
      }
    }

    // Last resort: resize + low quality
    const resized = await sharp(inputBuffer)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 25, mozjpeg: true })
      .toBuffer()

    console.log(`[geminiImage] Compressed+resized → ${Math.round(resized.length / 1024)}KB`)
    return resized.toString('base64')
  } catch (err) {
    console.error('[geminiImage] compression failed:', err)
    return b64
  }
}

// ── Core Gemini API Call ──────────────────────────────────────────────────────

/**
 * Call Gemini API with image generation capabilities.
 * Returns extracted images as base64 strings and any text response.
 */
async function callGeminiImageAPI(
  systemPrompt: string,
  contents: Array<{ role: string; parts: GeminiPart[] }>,
  temperature = 0.8,
): Promise<{ images: string[]; text: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_MODEL

  if (!apiKey) {
    console.warn('[geminiImage] GEMINI_API_KEY not set — skipping')
    return { images: [], text: '' }
  }

  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`

  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      temperature,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  }

  const startTime = Date.now()

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const elapsed = Date.now() - startTime
  console.log(`[geminiImage] API call completed in ${elapsed}ms (status: ${res.status})`)

  if (!res.ok) {
    const errBody = await res.text()
    console.error(`[geminiImage] API error ${res.status}: ${errBody}`)
    return { images: [], text: '' }
  }

  const data: GeminiResponse = await res.json()

  if (data.error) {
    console.error(`[geminiImage] API error: ${data.error.message}`)
    return { images: [], text: '' }
  }

  // Extract images and text from response
  const images: string[] = []
  let text = ''

  for (const candidate of data.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        images.push(part.inlineData.data)
      }
      if (part.text) {
        text += part.text
      }
    }
  }

  console.log(`[geminiImage] Response: ${images.length} image(s), ${text.length} chars text`)
  return { images, text }
}

// ── Text-to-Image ─────────────────────────────────────────────────────────────

/**
 * Generate images from a text prompt using Gemini's native image generation.
 * Returns an array of raw base64 strings (no data URI prefix).
 */
export async function generateImageGemini(
  prompt: string,
  _size: string = '1024x1024',
  count: 1 | 2 | 3 = 1
): Promise<string[]> {
  try {
    // Build an enhanced prompt for better results
    const enhancedPrompt = buildEnhancedPrompt(prompt, count)

    const { images } = await callGeminiImageAPI(
      IMAGE_GEN_SYSTEM,
      [{ role: 'user', parts: [{ text: enhancedPrompt }] }],
      0.9,
    )

    if (images.length === 0) {
      console.warn('[geminiImage] No images generated, retrying with simplified prompt')
      // Retry with a simpler prompt
      const { images: retryImages } = await callGeminiImageAPI(
        IMAGE_GEN_SYSTEM,
        [{ role: 'user', parts: [{ text: `Generate a beautiful, photorealistic wedding image: ${prompt}` }] }],
        1.0,
      )
      if (retryImages.length === 0) return []
      return Promise.all(retryImages.map(compressImage))
    }

    // Compress all images
    const compressed = await Promise.all(images.map(compressImage))
    return compressed
  } catch (err) {
    console.error('[geminiImage] generateImageGemini error:', err)
    return []
  }
}

// ── Image-to-Image (Edit) ─────────────────────────────────────────────────────

/**
 * Edit an image using Gemini's native image understanding + generation.
 * Sends the source image with the edit instruction and gets back an edited version.
 * Returns an array of raw base64 strings.
 */
export async function editImageGemini(
  imageBase64: string,
  prompt: string,
  size: string = '1024x1024'
): Promise<string[]> {
  try {
    // Determine orientation instruction from the target size
    let orientationHint = ''
    if (size === '1536x1024') orientationHint = 'IMPORTANT: Maintain the LANDSCAPE (horizontal) orientation of the original image. Do NOT change the aspect ratio.'
    else if (size === '1024x1536') orientationHint = 'IMPORTANT: Maintain the PORTRAIT (vertical) orientation of the original image. Do NOT change the aspect ratio.'
    else orientationHint = 'IMPORTANT: Maintain the SQUARE aspect ratio of the original image. Do NOT change the aspect ratio.'

    const editPrompt = `Edit this image with the following change: ${prompt}

${orientationHint}

Remember: Change ONLY what was requested. Keep everything else exactly the same — same person, same pose, same background, same lighting, same other clothing and accessories. The output image MUST have the same orientation and proportions as the input image.`

    const { images } = await callGeminiImageAPI(
      IMAGE_EDIT_SYSTEM,
      [{
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: imageBase64,
            },
          },
          { text: editPrompt },
        ],
      }],
      0.6, // Lower temperature for edits to preserve more of the original
    )

    if (images.length === 0) {
      console.warn('[geminiImage] Edit produced no images, trying fallback')
      return await fallbackEditGemini(imageBase64, prompt, size)
    }

    return Promise.all(images.map(compressImage))
  } catch (err) {
    console.error('[geminiImage] editImageGemini error:', err)
    return await fallbackEditGemini(imageBase64, prompt, size)
  }
}

/**
 * Fallback for image editing: analyze the image first, then regenerate with the edit applied.
 */
async function fallbackEditGemini(imageBase64: string, prompt: string, size: string = '1024x1024'): Promise<string[]> {
  try {
    // First, describe the image in detail
    const description = await analyzeImageGemini(
      imageBase64,
      'image/png',
      'Describe this image in EXTREME detail for recreation: exact person appearance (face, skin tone, hair, expression), exact clothing items and their colors/patterns/textures (each piece separately), exact body pose and hand position, exact background architecture/setting, exact lighting direction and color temperature, exact camera angle and depth of field. Miss nothing.',
    )

    // Determine orientation label from size for the prompt
    const orientationLabel = size === '1536x1024' ? 'LANDSCAPE/horizontal' : size === '1024x1536' ? 'PORTRAIT/vertical' : 'SQUARE'

    // Then regenerate with the edit — preserving the original orientation
    const editedPrompt = `Recreate this EXACT image: "${description}". Apply ONLY this one change: ${prompt}. Everything else must remain identical. The image MUST be in ${orientationLabel} orientation matching the original.`

    return await generateImageGemini(editedPrompt, size)
  } catch (err) {
    console.error('[geminiImage] fallback edit error:', err)
    return []
  }
}

// ── Image Analysis (Image-to-Text) ────────────────────────────────────────────

/**
 * Analyze an image using Gemini's vision capabilities.
 */
export async function analyzeImageGemini(
  imageBase64: string,
  mimeType: string,
  prompt?: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_MODEL

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set')
  }

  const userPrompt = prompt?.trim() || 'Describe this wedding-related image briefly.'

  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`

  const body = {
    system_instruction: {
      parts: [{ text: IMAGE_ANALYSIS_SYSTEM }],
    },
    contents: [{
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        },
        { text: userPrompt },
      ],
    }],
    generationConfig: {
      responseModalities: ['TEXT'],
      temperature: 0.4,
      maxOutputTokens: 500,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini vision error ${res.status}: ${err}`)
  }

  const data: GeminiResponse = await res.json()
  const text = data.candidates?.[0]?.content?.parts
    ?.filter((p: GeminiPart) => p.text)
    .map((p: GeminiPart) => p.text)
    .join('') ?? ''

  return text || 'Unable to analyze the image.'
}

// ── Prompt Enhancement ────────────────────────────────────────────────────────

/**
 * Detect the person's role from the prompt for role-aware generation.
 */
function detectRole(prompt: string): string | null {
  const rolePatterns: [RegExp, string][] = [
    [/\b(bride|bridal|dulhan)\b/i, 'bride'],
    [/\b(groom|dulha|varan)\b/i, 'groom'],
    [/\b(father of the bride|father of the groom|father|dad|papa|baba)\b/i, 'father'],
    [/\b(mother of the bride|mother of the groom|mother|mom|maa|amma)\b/i, 'mother'],
    [/\b(bridesmaid|maid of honor)\b/i, 'bridesmaid'],
    [/\b(groomsman|groomsmen|best man)\b/i, 'groomsman'],
    [/\b(flower girl)\b/i, 'flower girl'],
    [/\b(ring bearer)\b/i, 'ring bearer'],
    [/\b(couple|bride and groom|newlyweds)\b/i, 'couple'],
    [/\b(guest|family|relatives|attendee)\b/i, 'guest'],
    [/\b(sister|brother|sibling)\b/i, 'sibling'],
    [/\b(grandmother|grandfather|grandparent|dadi|dada|nani|nana)\b/i, 'grandparent'],
  ]

  for (const [pattern, role] of rolePatterns) {
    if (pattern.test(prompt)) return role
  }
  return null
}

/**
 * Build an enhanced prompt that produces Gemini-quality output.
 * Detects the person's role and cultural context for tailored generation.
 */
function buildEnhancedPrompt(userPrompt: string, variantCount: number): string {
  const hasQualityTerms = /\b(photorealistic|8k|4k|cinematic|professional|high quality|detailed|hdr)\b/i.test(userPrompt)
  const hasCulturalContext = /\b(indian|south asian|western|hindu|muslim|christian|jewish|sikh|chinese|japanese|korean|african|latin|arab|persian|thai|vietnamese|filipino|mexican|brazilian|caribbean|polynesian|indigenous)\b/i.test(userPrompt)

  const role = detectRole(userPrompt)

  let enhanced = userPrompt

  // Add role-specific styling hints if a role was detected
  if (role) {
    const roleHints: Record<string, string> = {
      bride: 'Radiant, elegant, center of attention, detailed bridal attire and jewelry',
      groom: 'Sharp, confident, well-groomed, distinguished formal attire',
      father: 'Distinguished, proud, dignified, age-appropriate formal wear',
      mother: 'Graceful, elegant, joyful, culturally appropriate formal attire with jewelry',
      bridesmaid: 'Coordinated attire, youthful energy, complementing the bride',
      groomsman: 'Coordinated formal wear, sharp and polished, supporting the groom',
      'flower girl': 'Adorable, age-appropriate miniature formal dress, carrying petals',
      'ring bearer': 'Cute, age-appropriate miniature formal suit, carrying ring pillow',
      couple: 'Connected, chemistry between them, complementary outfits, romantic',
      guest: 'Culturally appropriate formal wear, celebratory mood',
      sibling: 'Well-dressed, proud, emotionally connected to the occasion',
      grandparent: 'Dignified, traditional attire, warm and proud expression',
    }
    if (roleHints[role]) {
      enhanced += `. ${roleHints[role]}`
    }
  }

  if (!hasQualityTerms) {
    enhanced += '. Photorealistic, professionally lit with neutral white balance, accurate true-to-life colors, sharp details, natural skin tones'
  }

  if (!hasCulturalContext) {
    enhanced += '. Elegant celebration setting'
  }

  if (variantCount > 1) {
    enhanced = `Generate ${variantCount} different beautiful variations of: ${enhanced}. Each variation should have a distinct angle, lighting, or styling while keeping the core concept.`
  } else {
    enhanced = `Generate a stunning image: ${enhanced}`
  }

  return enhanced
}

// ── Exports for backward compatibility ────────────────────────────────────────

export { IMAGE_GEN_SYSTEM, IMAGE_EDIT_SYSTEM, IMAGE_ANALYSIS_SYSTEM }
