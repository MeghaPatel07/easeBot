# PRD: Azure Agentic Image Generation Pipeline

**Author:** Krish | **Date:** 2026-04-10 | **Status:** Draft v3
**Inspiration:** Gemini's natively multimodal pipeline architecture

---

## 1. Problem Statement

The current image generation flow has two weaknesses:

1. **Single-pass prompting** — GPT-4o decides to invoke `generate_image`, writes the prompt itself, and sends it directly to the image model. There is no dedicated reasoning step to expand, ground, or refine the prompt. The LLM is simultaneously managing conversation, tool selection, AND prompt authoring — resulting in prompts that are too brief and miss visual details.

2. **Gemini dependency** — the primary image engine is Google's Gemini 2.5 Flash, with Azure gpt-image-1 as a fallback. This creates a cross-vendor dependency, complicates auth (API key for Gemini, separate API key for Azure), and means the fallback path (gpt-image-1) produces noticeably lower quality — especially for face preservation during edits (79.5% fidelity vs Gemini's ~85%).

### What Gemini Does Better (And How We'll Match It)

Gemini's architecture has six stages that make its image generation superior. Our pipeline must replicate each one using Azure-native components:

| Gemini Stage | What it does | Our Azure equivalent | PRD Section |
|---|---|---|---|
| **Multimodal Encoding** | Text + reference images become shared tokens — model "sees" both as the same language | GPT-4o vision sees user images + GPT-Image-1.5 accepts multi-image input with `input_fidelity` | §4.3 |
| **Thinking Mode** | Internal reasoning expands prompts, decomposes complex instructions before any pixels are drawn | **Prompt Architect** — dedicated GPT-4o call that reasons, decomposes, and expands | §4.2 |
| **Search Grounding** | Google Search verifies real-world objects, landmarks, cultural elements for accuracy | **Wedding Knowledge Grounding** — inject domain-specific cultural/tradition context from mode prompts | §4.4 |
| **MoE Cross-Modal Attention** | Expert neurons for lighting, anatomy, text rendering fire selectively; text tokens attend to image tokens | **Structured prompt sections** — Prompt Architect outputs tagged sections (LIGHTING, ANATOMY, TEXT) so GPT-Image-1.5 can attend to each | §4.2 |
| **Subject Consistency** | Identity preservation across reference photos using dedicated pathway | GPT-Image-1.5 `input_fidelity: "high"` (89.96%) + **multi-image compositing** for reference-based generation | §4.7 |
| **Post-Processing (SynthID, upscale)** | Resolution upscaling to 4K + invisible watermark + safety filters | **Azure Content Safety** (automatic) + **sharp upscaling** for high-res output + C2PA metadata | §4.9 |

---

## 2. Proposed Solution: Azure-Native Agentic Pipeline

Replace the entire Gemini-primary / Azure-fallback chain with a **single Azure-native pipeline** that replicates Gemini's six-stage architecture:

- **GPT-4o** — conversational LLM + Thinking/Reasoning engine (existing deployment)
- **GPT-Image-1.5** — primary image generation with face preservation + inpainting (new deployment)
- **GPT-Image-1** — fallback if GPT-Image-1.5 is unavailable (existing deployment)

### Why GPT-Image-1.5 over Gemini

| Capability | Gemini 2.5 Flash | GPT-Image-1.5 |
|---|---|---|
| Face preservation | ~85% | **89.96%** |
| Prompt alignment | ~88% | **91.2%** |
| Diagram/flowchart gen | ~90% | **96.9%** |
| Native inpainting | Yes (basic) | **Yes (advanced, with `input_fidelity` control)** |
| Multi-image compositing | Yes (up to 14 refs) | **Yes (up to 5 refs with high fidelity)** |
| Speed vs gpt-image-1 | N/A | **4x faster** |
| Cost vs gpt-image-1 | N/A | **~20% lower** |
| Partial image streaming | No | **Yes (`partial_images: 0-3`)** |
| Transparent backgrounds | No | **Yes (`background: "transparent"`)** |
| Text rendering in images | Good | **96.9% accuracy on diagrams** |

---

## 3. Full Pipeline Architecture (Gemini-Competitive)

```
User Message + Optional Reference Image(s)
    │
    ▼
┌──────────────────────────────────────────────────────┐
│ STAGE 1: MULTIMODAL ENCODING                         │
│ GPT-4o (Azure) — Conversational Pass                 │
│                                                      │
│ • Text input tokenized                               │
│ • Reference image(s) encoded via vision (if present) │
│ • Unified understanding: text intent + visual context │
│ • Decides: tool_call generate_image                  │
│ • Passes: brief intent + image tokens to next stage  │
└────────┬─────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│ STAGE 2: THINKING MODE (Prompt Architect)            │
│ GPT-4o (Azure) — Dedicated Reasoning Pass            │
│                                                      │
│ INPUT:                                               │
│ • Brief intent from Stage 1                          │
│ • User-attached image (base64, if present)           │
│ • Mode context (stylist/planner/knowledge)           │
│ • Style history (accumulated descriptors)            │
│ • User profile (wedding date, preferences)           │
│ • Conversation context (recent summary)              │
│                                                      │
│ REASONING:                                           │
│ • Instruction decomposition (break complex → steps)  │
│ • Spatial planning (layout, zones, focal points)     │
│ • Cultural verification (authentic details)          │
│ • Negative constraint identification (what to avoid) │
│ • Style consistency check (match prior generations)  │
│                                                      │
│ OUTPUT: Structured visual specification (200-400w)   │
└────────┬─────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│ STAGE 3: DOMAIN GROUNDING                            │
│ (Injected into Prompt Architect context)             │
│                                                      │
│ Gemini uses Google Search for real-world grounding.  │
│ We use WEDDING DOMAIN GROUNDING instead:             │
│                                                      │
│ • Mode-specific knowledge injection:                 │
│   - stylist → fabric types, designer references,     │
│     seasonal trends, silhouette vocabulary            │
│   - planner → layout conventions, event flow,        │
│     table arrangement terminology                    │
│   - knowledge → cultural ceremony details,           │
│     traditional garment names, ritual elements       │
│ • User profile grounding:                            │
│   - Wedding date → seasonal lighting/florals         │
│   - Style preferences → palette + aesthetic          │
│   - Budget tier → material quality descriptors       │
│ • Algolia product grounding (stylist mode):           │
│   - Real product names, colors, prices from catalog  │
│   - Grounds the image in purchasable reality         │
└────────┬─────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│ STAGE 4: IMAGE GENERATION (Core)                     │
│ GPT-Image-1.5 (Azure) — Primary                     │
│                                                      │
│ Text-to-Image:                                       │
│ • Expanded prompt from Prompt Architect              │
│ • quality: "high" | size: auto | background: opaque  │
│                                                      │
│ Image-to-Image (Edit):                               │
│ • Source image + edit instruction                     │
│ • input_fidelity: "high" (face preservation)         │
│ • Up to 5 reference images with high fidelity        │
│                                                      │
│ Multi-Image Compositing (NEW):                       │
│ • Multiple source images → single output             │
│ • "Combine this venue with this color palette"       │
│ • "Put this outfit on this person"                   │
│                                                      │
│ Text Rendering:                                      │
│ • Invitations, save-the-dates, seating charts        │
│ • 96.9% accuracy on text/diagrams                    │
│                                                      │
│ Streaming:                                           │
│ • partial_images: 2 → progressive render via SSE     │
│                                                      │
│ FALLBACK: GPT-Image-1 (existing) if 1.5 unavailable │
└────────┬─────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│ STAGE 5: SUBJECT CONSISTENCY ENGINE                  │
│                                                      │
│ Gemini has internal identity preservation pathways.  │
│ We replicate this with:                              │
│                                                      │
│ A. Per-image: input_fidelity: "high"                 │
│    → 89.96% face preservation on edits               │
│                                                      │
│ B. Per-session: Style Memory (accumulated)           │
│    → Color palette, aesthetic, cultural context       │
│      carried across all images in conversation       │
│                                                      │
│ C. Per-user: Profile-based style anchoring           │
│    → User's saved style preferences, wedding theme   │
│      injected into every Prompt Architect call        │
│                                                      │
│ D. Cross-image: Reference image chain                │
│    → Previously generated image URLs stored in       │
│      session; available as reference for next gen    │
│    → "Make another one like this but for the groom"  │
└────────┬─────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│ STAGE 6: POST-PROCESSING & SAFETY                    │
│                                                      │
│ A. Resolution Enhancement (NEW)                      │
│    • If quality: "high" + user is premium:            │
│      sharp upscale to 2048px (2x) with lanczos       │
│    • Preserves detail while matching Gemini's         │
│      "up to 4K" output claim                         │
│                                                      │
│ B. Format Optimization                               │
│    • WebP for chat display (smaller, faster load)    │
│    • PNG for downloads/storage (lossless)            │
│    • Transparent PNG for design elements             │
│                                                      │
│ C. Azure Content Safety (automatic)                  │
│    • Built into GPT-Image-1.5 API                    │
│    • Replaces Gemini's safety filters                │
│                                                      │
│ D. C2PA Metadata (automatic)                         │
│    • Azure's equivalent of SynthID                   │
│    • Provenance tracking for AI-generated images     │
│                                                      │
│ E. Compression for Storage                           │
│    • Existing sharp pipeline: quality cascade         │
│      92 → 85 → 78 → 70 → resize if still > 2MB     │
└────────┬─────────────────────────────────────────────┘
         ▼
   Final Image Output → Storage → Frontend
```

---

## 4. Technical Component Details

### 4.1 Models & Deployments

| Role | Model | Deployment | Endpoint | Status |
|---|---|---|---|---|
| Conversational LLM | GPT-4o | `gpt-4o` | `weddingease.openai.azure.com` | Existing |
| Prompt Architect | GPT-4o (same) | `gpt-4o` | `weddingease.openai.azure.com` | Existing |
| Image Generator (primary) | **GPT-Image-1.5** | `gpt-image-1-5` | `shilp-mnhdqxja-swedencentral` | **New — deploy required** |
| Image Generator (fallback) | GPT-Image-1 | `gpt-image-1` | `shilp-mnhdqxja-swedencentral` | Existing |
| Image Analysis / Vision | GPT-4o | `gpt-4o` | `weddingease.openai.azure.com` | Existing |

### 4.2 Prompt Architect — "Thinking Mode" Equivalent

This is the most critical new component. Gemini's internal "Thinking Mode" reasons through complex instructions before generating. We replicate this with a dedicated GPT-4o call.

**Input:**
```typescript
interface PromptArchitectInput {
  userIntent: string            // Brief prompt from IMAGE_TOOL call
  action: 'generate' | 'edit'
  mode: Mode                    // stylist, planner, knowledge, etc.
  aspectRatio: ImageSize
  styleHistory: string[]        // Accumulated style descriptors from session
  referenceImageBase64?: string  // User-attached image (for vision-aware expansion)
  referenceImageMime?: string
  userProfile?: {
    weddingDate?: string
    stylePreferences?: string
    budget?: string
  }
  conversationContext?: string   // Recent conversation summary
  groundingContext?: string      // Domain knowledge from mode + Algolia products
}
```

**Output:**
```typescript
interface PromptArchitectOutput {
  expandedPrompt: string        // 200-400 word structured visual specification
  negativePrompt: string        // What to explicitly AVOID (Gemini does this internally)
  styleDescriptors: string[]    // Extracted for cross-generation consistency
  qualityTier: 'low' | 'medium' | 'high'
  suggestedBackground: 'opaque' | 'transparent' | 'auto'
}
```

**System Prompt (Thinking Mode Replication):**

```
You are a Visual Prompt Architect — the "thinking engine" for an image generation
pipeline. Your job is to REASON through the user's intent and produce a precise
visual specification that a non-thinking image model (GPT-Image-1.5) can execute
perfectly on the first try.

You replicate what Gemini's internal Thinking Mode does: decompose, expand, ground,
and structure the prompt BEFORE any pixels are drawn.

## YOUR REASONING PROCESS (execute silently, output only the result):

STEP 1 — INTENT DECOMPOSITION
Break the user's request into discrete visual elements:
- Primary subject (who/what is the focal point?)
- Secondary elements (background, props, other people?)
- Action/pose (what is happening?)
- Emotional register (joyful, serene, dramatic, playful?)

STEP 2 — SPATIAL PLANNING
Plan the image layout:
- Composition structure (rule of thirds, centered, symmetrical, diagonal?)
- Depth layers (foreground, midground, background — what goes where?)
- Focal point and eye flow
- If multi-panel/mood board: define each zone and its content

STEP 3 — VISUAL SPECIFICATION
For each element, specify:
- Lighting: direction (45° key, rim, backlit), color temperature (warm/cool),
  quality (soft diffused, hard dramatic), time of day if outdoor
- Camera: lens (85mm portrait, 35mm wide, 50mm standard), depth of field
  (shallow f/1.8 vs deep f/11), angle (eye-level, low hero, overhead flat-lay)
- Textures: fabric weave (silk charmeuse, raw cotton, heavy brocade), metal
  finish (brushed gold, polished silver, oxidized copper), floral detail
  (petal count, arrangement style, stem visibility)
- Color: exact palette (not just "red" — "deep burgundy with warm undertones"),
  grading (warm film, cool editorial, neutral documentary), saturation level

STEP 4 — CULTURAL GROUNDING
If cultural elements are mentioned or implied:
- Use EXACT traditional names (lehenga choli, not "Indian dress"; chuppah,
  not "wedding canopy"; hanbok, not "Korean outfit")
- Add authentic ceremonial details (sindoor, mangalsutra, mehndi patterns,
  kente cloth patterns, specific floral garlands like varmala/jai mala)
- Match regional variations (Rajasthani vs Bengali vs Punjabi wedding aesthetics)
- Reference specific textile traditions (Banarasi silk, Kanjeevaram, Paithani)

STEP 5 — NEGATIVE CONSTRAINTS
Identify what should NOT appear:
- No unrelated objects or anachronistic elements
- No text unless explicitly requested
- No watermarks, logos, or UI elements
- No distortion of faces, hands, or cultural symbols
- No culturally inappropriate mixing of traditions

STEP 6 — CONSISTENCY CHECK
If style history is provided:
- Match the established color palette
- Maintain consistent lighting direction and quality
- Preserve the aesthetic register (editorial vs candid vs artistic)
- Keep cultural context consistent

## OUTPUT FORMAT:

Return ONLY a JSON object (no markdown, no explanation):
{
  "expandedPrompt": "...",
  "negativePrompt": "...",
  "styleDescriptors": ["descriptor1", "descriptor2"],
  "qualityTier": "high",
  "suggestedBackground": "opaque"
}

- expandedPrompt: Single paragraph, 200-400 words, vivid and precise
- negativePrompt: Comma-separated list of things to avoid
- styleDescriptors: 3-6 keywords for cross-generation consistency
- qualityTier: "high" for detailed scenes, "medium" for simple, "low" for quick drafts
- suggestedBackground: "transparent" for design elements (invites, logos), else "opaque"

## RULES:
- Never contradict the user's stated intent. Only ADD missing visual details.
- If the user specified a color, use THAT color. Don't "improve" their choices.
- For EDITS: output only the change description, not the full image spec.
  Keep expandedPrompt under 50 words for edits.
- Match the mode context:
  stylist = high-fashion editorial | planner = clean organized |
  knowledge = culturally authentic | assistant = versatile premium
```

### 4.3 Multimodal Encoding — Vision-Aware Expansion

Gemini processes text and images in a unified token space. Our Prompt Architect replicates this by **receiving the user's attached image via GPT-4o vision** when available.

**Current gap:** The Prompt Architect in PRD v2 only received text. If the user says "change the dress color to red" while attaching a photo, the Architect had no visual context about the original dress.

**v3 upgrade:** When `referenceImageBase64` is present, the Prompt Architect call includes it as a vision input:

```typescript
// In promptArchitect.ts
const messages = [
  { role: 'system', content: ARCHITECT_SYSTEM_PROMPT },
  {
    role: 'user',
    content: referenceImageBase64
      ? [
          { type: 'text', text: architectUserPrompt },
          { type: 'image_url', image_url: {
            url: `data:${referenceImageMime};base64,${referenceImageBase64}`,
            detail: 'low'  // low detail = fast + cheap, enough for context
          }},
        ]
      : architectUserPrompt,
  },
]
```

This gives the Architect visual context to write better edit prompts — it can see the actual fabric texture, lighting direction, and skin tone before specifying the edit.

### 4.4 Domain Grounding — Wedding Knowledge Injection

Gemini uses Google Search to ground prompts in reality. We don't need web search — but we DO need **domain-specific grounding** for wedding accuracy.

**Grounding sources (injected into Prompt Architect context):**

```typescript
interface GroundingContext {
  // From mode-specific prompts (already exist in src/prompts/)
  modeKnowledge: string         // Cultural, stylistic, or planning context

  // From user profile (already fetched in chatController)
  seasonalContext?: string      // "Winter wedding → warm lighting, rich textures, fur accents"
  budgetTier?: string           // "Premium → luxury materials, designer references"
  culturalContext?: string      // "Hindu Gujarati → garba, chaniya choli, dandiya"

  // From Algolia products (stylist mode, already integrated)
  productContext?: string       // "Available: Sabyasachi Mukherjee Lehenga in Maroon, $3,200"
}
```

**How it's built (in `handleImageToolCall`):**

```typescript
function buildGroundingContext(mode: Mode, userProfile: UserProfileContext | null): string {
  const parts: string[] = []

  // Seasonal grounding from wedding date
  if (userProfile?.weddingDate) {
    const month = new Date(userProfile.weddingDate).getMonth()
    if (month >= 11 || month <= 1) parts.push('Winter wedding: warm golden lighting, rich velvet/brocade textures, deep jewel tones, evergreen/pine accents, candlelit ambiance')
    else if (month >= 2 && month <= 4) parts.push('Spring wedding: soft natural light, pastel florals, light fabrics, cherry blossom/lavender accents, garden setting feel')
    else if (month >= 5 && month <= 7) parts.push('Summer wedding: bright golden-hour light, airy fabrics, tropical florals, outdoor/beach vibes, vibrant colors')
    else parts.push('Autumn wedding: warm amber light, rustic textures, burgundy/burnt orange palette, harvest florals, cozy layered fabrics')
  }

  // Budget-tier grounding
  if (userProfile?.budget) {
    const budget = Number(userProfile.budget)
    if (budget > 50000) parts.push('Luxury tier: designer labels, premium fabrics (raw silk, organza, tulle), crystal/diamond accents, editorial quality')
    else if (budget > 20000) parts.push('Mid-range: quality fabrics, tasteful details, elegant but not ostentatious')
    else parts.push('Budget-conscious: creative styling, DIY-friendly aesthetics, meaningful over expensive')
  }

  // Style preference grounding
  if (userProfile?.stylePreferences) {
    parts.push(`User style: ${userProfile.stylePreferences}`)
  }

  return parts.join('. ')
}
```

### 4.5 Integration Point: `chatController.ts`

The `handleImageToolCall()` function now has three new steps:

```
Current:
  args.prompt → buildEnhancedPrompt() → generateImageGemini/Azure

Proposed:
  args.prompt
    → buildGroundingContext(mode, userProfile)          ← Stage 3: Domain Grounding
    → expandWithPromptArchitect(GPT-4o, grounding,     ← Stage 2: Thinking Mode
        referenceImage, styleHistory)
    → generateImageAzure(GPT-Image-1.5, negativePrompt) ← Stage 4: Generation
    → postProcess(upscale, format, compress)             ← Stage 6: Post-Processing
```

### 4.6 Multi-Turn Style Memory — Subject Consistency Engine

Gemini maintains subject consistency via internal identity pathways. We build this at the application layer with three tiers:

**Tier 1 — Per-Image Consistency (GPT-Image-1.5 native)**
```typescript
// For edits: input_fidelity preserves the source subject
{ input_fidelity: 'high' }  // 89.96% face preservation
```

**Tier 2 — Per-Session Consistency (Style Memory)**
```typescript
// Accumulated across all image generations in a conversation
interface StyleMemory {
  descriptors: string[]          // ["burgundy palette", "editorial", "South Indian"]
  colorPalette: string[]         // ["#8B0000", "#FFD700", "#FFFFF0"]
  aestheticRegister: string      // "editorial" | "candid" | "artistic" | "documentary"
  culturalContext: string        // "Tamil Brahmin wedding" (once established, persists)
  lastGeneratedImageUrl: string  // For iterative reference
}
```

The style memory is:
- **Built** by extracting descriptors from each Prompt Architect output
- **Carried** via `ChatPayload.styleMemory` (frontend stores and sends back)
- **Injected** into the next Prompt Architect call as context

**Tier 3 — Per-User Consistency (Profile-Based)**
```typescript
// From Firestore user profile (persists across sessions)
{
  weddingDate: '2026-12-15',
  stylePreferences: 'modern minimalist with Indian fusion',
  budget: 45000,
  // NEW fields:
  colorPalette: ['dusty rose', 'sage green', 'gold'],
  culturalBackground: 'Gujarati Hindu',
  aestheticPreference: 'editorial',
}
```

### 4.7 Edit Pipeline — Multi-Image Compositing

Gemini accepts up to 14 reference images. GPT-Image-1.5 supports up to 5 with high fidelity. This unlocks new edit capabilities beyond simple "change the color":

| Use Case | How It Works |
|---|---|
| **"Put this outfit on this person"** | Image A (person) + Image B (outfit) → composited output |
| **"Combine this venue with this color palette"** | Image A (venue) + Image B (palette reference) → recolored venue |
| **"Make a mood board from these"** | Images A-D → single mood board layout |
| **"Match the style of this photo"** | Image A (reference style) + text prompt → new image in that style |

**API call for multi-image compositing:**
```typescript
{
  model: 'gpt-image-1-5',
  prompt: expandedPrompt,
  image: [sourceImage1, sourceImage2],  // Multiple inputs
  input_fidelity: 'high',
  n: 1,
  quality: 'high',
}
```

**IMAGE_TOOL update** — add `reference_images` parameter:
```typescript
// In IMAGE_TOOL function definition
reference_images: {
  type: 'array',
  items: { type: 'string' },
  description: 'URLs of previously generated images to use as style/subject reference. Use when user says "like the previous one" or "match that style".',
  maxItems: 4,
}
```

### 4.8 Text Rendering Pipeline

Gemini has a dedicated text rendering pathway for accurate spelling. GPT-Image-1.5 achieves 96.9% on diagrams. We leverage this for wedding-specific text outputs:

**When the Prompt Architect detects text content** (invitations, seating charts, save-the-dates, timelines):

```typescript
// Prompt Architect adds structured text rendering instructions
if (detectsTextContent(userIntent)) {
  expandedPrompt += `

TEXT RENDERING REQUIREMENTS:
- All text must be spelled correctly with zero typos
- Font: elegant serif for formal, clean sans-serif for modern
- Text hierarchy: title (largest), subtitle, body, footer
- Ensure all text is fully legible — minimum contrast ratio 4.5:1
- Text placement: centered with generous padding, never touching edges
- If names are provided, spell them EXACTLY as given: "${extractNames(userIntent)}"
`
}
```

This is added by the Prompt Architect automatically — no change needed in the IMAGE_TOOL.

### 4.9 Post-Processing — Resolution & Format

Gemini upscales to 4K internally. We replicate this as an explicit post-processing step:

```typescript
async function postProcessImage(
  b64: string,
  options: {
    upscale?: boolean       // Premium users: 2x resolution
    outputFormat?: 'png' | 'webp' | 'jpeg'
    transparent?: boolean
  }
): Promise<string> {
  let buffer = Buffer.from(b64, 'base64')
  const meta = await sharp(buffer).metadata()

  // Stage 6A: Resolution upscaling (premium users)
  if (options.upscale && meta.width && meta.width < 2048) {
    buffer = await sharp(buffer)
      .resize(meta.width * 2, meta.height! * 2, {
        kernel: 'lanczos3',     // High-quality upscale
        withoutEnlargement: false,
      })
      .toBuffer()
  }

  // Stage 6B: Format optimization
  if (options.outputFormat === 'webp') {
    buffer = await sharp(buffer).webp({ quality: 90 }).toBuffer()
  } else if (options.outputFormat === 'jpeg') {
    buffer = await sharp(buffer).jpeg({ quality: 92, mozjpeg: true }).toBuffer()
  }
  // PNG stays as-is (lossless)

  // Stage 6C: Compression if over 2MB
  if (buffer.length > 2 * 1024 * 1024) {
    buffer = await compressImage(buffer.toString('base64'))
      .then(b64 => Buffer.from(b64, 'base64'))
  }

  return buffer.toString('base64')
}
```

### 4.10 Partial Image Streaming

GPT-Image-1.5 supports `partial_images` (0-3), sending progressive renders during generation. This integrates with the existing SSE stream:

```typescript
// Current SSE event (binary: generating or done)
sse({ t: 'img', status: 'generating' })

// Proposed SSE events (progressive)
sse({ t: 'img', status: 'partial', data: partialBase64_1 })  // ~30% render
sse({ t: 'img', status: 'partial', data: partialBase64_2 })  // ~60% render
sse({ t: 'img', status: 'done', data: finalBase64 })          // final image
```

The frontend `ChatMessages.tsx` can render progressive blur-to-sharp transitions instead of a static skeleton — matching the UX of ChatGPT's image generation.

---

## 5. Files Changed

| File | Change | Gemini Stage |
|---|---|---|
| `src/services/promptArchitect.ts` | **NEW** — Thinking Mode + Grounding + Structured Expansion | Stages 2, 3 |
| `src/services/imageGeneration.ts` | **REWRITE** — GPT-Image-1.5 primary, multi-image compositing, negative prompts, format options | Stage 4 |
| `src/services/imagePostProcessor.ts` | **NEW** — Resolution upscaling, format optimization, compression | Stage 6 |
| `src/services/geminiImageGeneration.ts` | **DELETE** — entirely removed | — |
| `src/services/promptEnhancer.ts` | **DELETE** — replaced by Prompt Architect | — |
| `src/controllers/chatController.ts` | Modify `handleImageToolCall()` — add grounding, architect, post-processing, partial streaming, style memory, reference images | All stages |
| `src/types.ts` | Add `StyleMemory`, `styleMemory` to payloads, `referenceImageUrls` | Stage 5 |
| `Wedding-Ease-Viva-Chat/src/components/chat/ChatMessages.tsx` | Progressive image rendering (blur-to-sharp) | Stage 4 (UX) |
| `.env` | Add `AZURE_GPT_IMAGE_15_DEPLOYMENT`. Remove `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL` | — |

---

## 6. Env Configuration

```env
# ── Azure AI Foundry — GPT-4o (conversational + prompt architect + vision) ──
AZURE_OPENAI_ENDPOINT_THEWEDDINGBOT=https://weddingease.openai.azure.com
AZURE_OPENAI_API_KEY=<existing>
AZURE_DEPLOYMENT_NAME=gpt-4o

# ── Azure AI Foundry — GPT-Image-1.5 (primary image generation) ────────────
AZURE_IMAGE_ENDPOINT=https://shilp-mnhdqxja-swedencentral.services.ai.azure.com/
AZURE_IMAGE_API_KEY=<existing>
AZURE_GPT_IMAGE_15_DEPLOYMENT=gpt-image-1-5      # ← NEW: deploy this model
AZURE_GPT_IMAGE_DEPLOYMENT=gpt-image-1            # ← existing fallback
AZURE_GPT_IMAGE_API_VERSION=2025-04-01-preview

# ── Pipeline toggles ───────────────────────────────────────────────────────
ENABLE_PROMPT_ARCHITECT=true    # false = bypass expansion, direct pass-through
ENABLE_IMAGE_UPSCALE=true       # false = skip 2x upscaling for premium users

# ── REMOVED ────────────────────────────────────────────────────────────────
# GEMINI_API_KEY          — no longer needed
# GEMINI_IMAGE_MODEL      — no longer needed
```

---

## 7. Performance Impact

| Metric | Current (Gemini) | Proposed (6-stage Azure) | Delta |
|---|---|---|---|
| **Image gen latency** | ~4-8s | ~2-4s (GPT-Image-1.5, 4x faster) | **2-4s faster** |
| **Prompt expansion** | None | +800-1200ms (GPT-4o Thinking) | +1s |
| **Post-processing** | Compress only | +200-400ms (upscale + format) | +0.3s |
| **Total user-perceived** | ~4-8s | ~3-5.5s | **Faster overall** |
| **Face preservation** | ~85% | 89.96% | **+5%** |
| **Prompt alignment** | ~88% | 91.2% | **+3%** |
| **Text rendering** | ~90% | 96.9% | **+7%** |
| **Style consistency** | None | 3-tier (image/session/user) | **New capability** |
| **Multi-image compositing** | Not supported | Up to 5 references | **New capability** |
| **Progressive streaming** | No | Yes (2 partial frames) | **New capability** |
| **Vendor dependencies** | 2 (Google + Azure) | 1 (Azure only) | **Simplified** |

### Latency Breakdown

```
Current:
  GPT-4o tool call (1.5s) + Gemini gen (4-6s) = 5.5-7.5s total

Proposed:
  GPT-4o tool call (1.5s)
  + Prompt Architect (1s)
  + GPT-Image-1.5 gen (2-3s)
  + Post-processing (0.3s)
  = 4.8-5.8s total

  BUT: first partial image arrives at ~1.5s into gen = 4s perceived
```

---

## 8. Competitive Comparison (Final)

| Feature | Gemini 3.1 Flash | ChatGPT (GPT-Image-1.5) | Our Pipeline (v3) |
|---|---|---|---|
| Thinking/reasoning before gen | Native (internal) | Via ChatGPT conversation | **Prompt Architect (dedicated GPT-4o pass)** |
| Search grounding | Google Search | None | **Wedding domain grounding (profiles, products, cultural knowledge)** |
| Face preservation | ~85% | 89.96% | **89.96% (same model)** |
| Subject consistency | Internal pathway | `input_fidelity` | **3-tier: image + session + user profile** |
| Multi-image compositing | Up to 14 refs | Up to 5 refs | **Up to 5 refs (same model)** |
| Text rendering | Good | 96.9% | **96.9% + structured text instructions from Architect** |
| Streaming | No partials | Available | **2 partial frames via SSE** |
| Post-processing | SynthID + 4K upscale | C2PA | **C2PA + 2x upscale + format optimization** |
| Negative prompts | Not exposed | Not standard | **Explicit negativePrompt from Architect** |
| Domain specialization | General purpose | General purpose | **Wedding-specific grounding, cultural accuracy** |

---

## 9. Migration Plan

### Phase 1: Deploy GPT-Image-1.5 (Day 1)
- Deploy `gpt-image-1-5` model in the `shilp-mnhdqxja-swedencentral` Azure resource
- Add `AZURE_GPT_IMAGE_15_DEPLOYMENT=gpt-image-1-5` to `.env`
- Verify deployment with a direct API test

### Phase 2: Prompt Architect + Grounding (Day 2-4)
- Create `src/services/promptArchitect.ts` with full Thinking Mode system prompt
- Add `buildGroundingContext()` in `chatController.ts`
- Wire vision-aware expansion (pass reference image to Architect)
- Wire `ENABLE_PROMPT_ARCHITECT` toggle
- Test: compare expanded vs raw prompts on 20 wedding scenarios

### Phase 3: Rewrite Image Service (Day 4-6)
- Rewrite `imageGeneration.ts`: GPT-Image-1.5 primary, GPT-Image-1 fallback
- Add `input_fidelity: "high"` for edit operations
- Add `negativePrompt` support (if API supports it, else append to prompt)
- Remove all Gemini imports and calls
- Update `handleImageToolCall()` in `chatController.ts`

### Phase 4: Delete Gemini + Add Post-Processing (Day 6-7)
- Delete `src/services/geminiImageGeneration.ts`
- Delete `src/services/promptEnhancer.ts`
- Create `src/services/imagePostProcessor.ts` (upscale + format optimization)
- Remove `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL` from `.env`

### Phase 5: Style Memory + Consistency Engine (Day 7-9)
- Add `StyleMemory` type to `types.ts`
- Add `styleMemory` to `ChatPayload` / `ChatResponse`
- Implement 3-tier consistency: per-image, per-session, per-user
- Frontend: pass `styleMemory` in requests, persist in conversation state

### Phase 6: Streaming + Frontend (Day 9-11)
- Add `partial_images: 2` to GPT-Image-1.5 API calls
- Emit progressive SSE events (`partial` → `done`)
- Update `ChatMessages.tsx`: blur-to-sharp progressive rendering
- Add reference image chain (pass previous image URLs to next generation)

### Phase 7: Multi-Image Compositing (Day 11-13)
- Update `IMAGE_TOOL` with `reference_images` parameter
- Implement multi-image input in image service
- Test compositing use cases: outfit+person, venue+palette, style transfer

---

## 10. Success Metrics

| Metric | Current | Target | How to Measure |
|---|---|---|---|
| **Prompt richness** | ~30 words | 200+ words | Avg word count sent to image gen |
| **Face preservation** | ~85% | 90%+ | A/B test edits on bridal photos |
| **Prompt alignment** | ~88% | 91%+ | User satisfaction on first-try accuracy |
| **Image regeneration rate** | Baseline | -30% | % of images followed by "change X" edits |
| **Text rendering accuracy** | ~90% | 96%+ | Manual audit of invitation/chart outputs |
| **End-to-end latency** | 5.5-7.5s | 4-5.5s | P50 from tool call to image delivery |
| **Perceived latency** | 5.5-7.5s (skeleton) | ~4s (first partial) | Time to first visual content |
| **Style consistency** | None | Measurable | User rating across multi-image sessions |
| **Vendor dependencies** | 2 | 1 | Infra audit |

---

## 11. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| GPT-Image-1.5 not available in `swedencentral` | Low | High | Check region availability. Fallback to gpt-image-1 is automatic |
| Prompt Architect hallucinates unwanted details | Medium | Low | System prompt: "never contradict user intent" + `ENABLE_PROMPT_ARCHITECT` kill switch |
| Higher cost than Gemini free tier | Medium | Medium | GPT-Image-1.5 is 20% cheaper than gpt-image-1. Monitor via `usageService.ts` |
| Architect JSON parsing fails | Low | Low | Wrap in try/catch, fall back to raw prompt on parse error |
| Upscaling adds visible artifacts | Low | Low | Use lanczos3 kernel + only upscale if source < 2048px. Toggle via `ENABLE_IMAGE_UPSCALE` |
| Style memory grows too large | Low | Low | Cap at 20 descriptors per session, deduplicate |
| Multi-image compositing produces uncanny results | Medium | Medium | Limit to 4 reference images. User can retry without refs |

---

## 12. Future: Foundry Agent SDK (Optional Phase 8)

The Foundry Agent Service (`@azure/ai-projects` v2.0.2) provides a managed orchestration layer. Benefits if migrated later:

- Eliminates custom Prompt Architect — agent orchestrator does expansion natively
- Built-in tracing/debugging via Foundry portal
- Agent-to-Agent composition for complex workflows

**Deferred because:** requires Entra ID auth migration + Foundry Project setup. The direct API approach in Phases 1-7 delivers all six Gemini-equivalent stages without an auth overhaul.

---

## 13. Open Questions

1. Is `gpt-image-1-5` available in `swedencentral` region? If not, which region?
2. Does GPT-Image-1.5 API accept a `negative_prompt` parameter, or should negatives be appended to the main prompt?
3. Should the Prompt Architect use `detail: "low"` or `"high"` when receiving reference images? (cost vs accuracy tradeoff)
4. Should style memory persist to Firestore (cross-session) or stay in request payload (single session)?
5. What is the pricing delta at current usage volumes (~X images/day)?
6. Should we keep Gemini as a third fallback behind GPT-Image-1, or fully remove it?
