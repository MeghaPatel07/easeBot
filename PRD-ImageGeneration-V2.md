# PRD: Image Generation Pipeline V2 — Market-Ready Upgrade

**Product**: WeddingEase Viva (easeBot)
**Platform**: Azure AI Foundry (gpt-4o + gpt-image-1)
**Date**: 2026-04-03
**Status**: Draft
**Author**: Engineering

---

## 1. Executive Summary

The current image generation pipeline works but has critical gaps preventing it from being a market-grade product. This PRD defines the upgrades needed — all within the existing Azure AI Foundry stack (gpt-4o, gpt-image-1) — to close those gaps.

**Current state**: Functional MVP with regex-based classification, single-size output, no image persistence, no iterative editing, and no gallery.

**Target state**: Production-grade image system with LLM-based intent detection, multi-size output, cloud-stored shareable images, conversational editing, variant generation, and a user-facing image gallery.

---

## 2. Current System Audit

### 2.1 Architecture (As-Is)

```
User Message
  |
  v
Regex Classification (classifyImageRequest)
  |--- text-to-image: IMAGE_GEN_RE matches
  |--- image-to-image: has attachment + IMAGE_EDIT_RE matches
  |--- image-to-text: has attachment, no edit intent
  |--- text-only: no match
  |
  v (parallel)
  +-- gpt-4o: buildContextAwareImagePrompt (last 6 msgs -> 1 image prompt)
  +-- gpt-4o: chat response (text)
  +-- gpt-image-1: generateImageGptImage1 OR editImageGptImage1
  |
  v
  Response: { text, imageUrl (base64 data URI), audioUrl }
```

### 2.2 Files Involved

| File | Role | Lines |
|------|------|-------|
| `easebot-backend/src/services/imageGeneration.ts` | Core: classify, generate, edit, analyze, prompt enhancement | 263 |
| `easebot-backend/src/controllers/imageController.ts` | Standalone `/api/generate-image` endpoint | 47 |
| `easebot-backend/src/controllers/chatController.ts` | Chat integration: parallel image + LLM execution | 335 |
| `easebot-backend/src/services/azureAI.ts` | LLM calls with multimodal (vision) support | 243 |
| `easebot-backend/src/types.ts` | ChatPayload, ChatResponse with imageUrl field | 64 |
| `Wedding-Ease-Viva-Chat/src/hooks/useChat.ts` | Frontend: sends images, handles imageUrl in responses | 547 |
| `Wedding-Ease-Viva-Chat/src/services/functionsService.ts` | Frontend: API transport, streaming SSE | 147 |
| `Wedding-Ease-Viva-Chat/src/pages/Index.tsx` | Frontend: image attach, display, preview | 2400+ |
| `Wedding-Ease-Viva-Chat/src/types/index.ts` | Frontend: Message type with imageUrl, attachedImage | ~80 |

### 2.3 Identified Problems

| # | Problem | Impact | Severity |
|---|---------|--------|----------|
| P1 | **Regex-based intent classification** — misses implicit requests ("what would that look like?"), false-positives ("generate a guest list"), fails for non-English | Wrong or missing image generation | Critical |
| P2 | **Fixed 1024x1024 output** — no aspect ratio options | Can't create phone wallpapers (9:16), venue panoramas (16:9), social posts (4:5) | High |
| P3 | **Base64 data URIs in Firestore** — 1MB document limit, no CDN, no sharing | Images can't be shared, slow loading, storage ceiling | Critical |
| P4 | **No iterative editing** — each generation is stateless, no memory of previous image | "Make it more pink" regenerates from scratch, loses original | High |
| P5 | **Single image per request** (n=1) — no variant options | Users can't compare alternatives | High |
| P6 | **No image gallery** — images buried in chat history | Users lose inspiration; no mood board capability | High |
| P7 | **No style consistency** — each generation is independent | "Same style but for reception" produces unrelated results | Medium |
| P8 | **Prompt enhancement burns an extra gpt-4o call** every time | +$0.015/request, +2-5s latency | Medium |
| P9 | **Vision detail hardcoded to `low`** — less detailed image analysis | Misses fine details in uploaded bridal photos | Low |
| P10 | **No rate limiting** on image generation | Cost exposure, potential abuse | Medium |
| P11 | **No image download/export** — base64 only | Users can't save to device or share with vendors | High |
| P12 | **4MB upload limit** — frontend only, no backend enforcement | Large uploads can crash Firestore persistence | Medium |

---

## 3. Requirements

### 3.1 TIER 1 — Must-Have (Launch Blockers)

#### R1: LLM-Based Image Intent Classification
**Replace regex with gpt-4o tool-calling classification.**

**Current flow**:
```typescript
// imageGeneration.ts:79-101
const IMAGE_GEN_RE = /\b(generate|create|show|draw|design|visualize|render)\b.../i
const IMAGE_EDIT_RE = /\b(make|change|modify|edit|replace|swap|turn|convert|transform...)\b/i
```

**Problem cases the regex misses**:
- "I wonder what that would look like" → no verb match → text-only (WRONG)
- "Dikhao mujhe red lehenga" (Hindi) → no English verb → text-only (WRONG)
- "Generate a guest list for 200 people" → "generate" + implied noun → text-to-image (FALSE POSITIVE)
- "Can you show me the timeline?" → "show" match → text-to-image (FALSE POSITIVE)

**Proposed solution**: Add a `classify_image_intent` tool to the gpt-4o chat call. The LLM decides whether to call it based on semantic understanding of the conversation.

```typescript
// New tool definition added alongside PLANNER_TOOLS
const IMAGE_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'generate_image',
    description: 'Generate or edit a wedding-related image when the user wants a visual.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed image generation prompt with colors, styles, attire, decor, cultural context.'
        },
        action: {
          type: 'string',
          enum: ['generate', 'edit'],
          description: '"generate" for new images, "edit" when modifying an attached/previous image.'
        },
        aspect_ratio: {
          type: 'string',
          enum: ['1024x1024', '1024x1536', '1536x1024'],
          description: 'Image dimensions. Portrait for attire/people, landscape for venues/decor, square for general.'
        }
      },
      required: ['prompt', 'action']
    }
  }
}
```

**Benefits**:
- Eliminates false positives and missed intents
- Works in ANY language (gpt-4o is multilingual)
- LLM writes the optimized prompt directly — **eliminates the separate `buildContextAwareImagePrompt` call** (saves $0.015/request and 2-5s)
- LLM picks aspect ratio based on content understanding
- Single tool handles both generation and editing intent

**Implementation scope**:
- Modify `chatController.ts`: always include `IMAGE_TOOL` alongside mode-specific tools
- When LLM calls `generate_image` tool → execute image generation
- Remove `classifyImageRequest()`, `buildContextAwareImagePrompt()` and regex patterns
- Keep `buildImageGenPrompt()` as a lightweight wedding-context wrapper

**Files to change**: `imageGeneration.ts`, `chatController.ts`, `types.ts`

---

#### R2: Cloud Storage for Generated Images
**Move from base64 data URIs to Azure Blob Storage / Firebase Storage URLs.**

**Current flow**:
```typescript
// imageGeneration.ts:140
return `data:image/png;base64,${b64}`  // ~100-400KB string embedded in response + Firestore
```

**Problems**:
- Firestore document max = 1MB; a single message with image + text + metadata can exceed this
- No CDN caching — same image re-transmitted on every chat load
- Can't generate shareable links
- No image gallery possible without separate storage

**Proposed solution**: Upload base64 to Firebase Storage (or Azure Blob), return a permanent CDN URL.

```typescript
// New: services/imageStorage.ts
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'

export async function storeGeneratedImage(
  base64: string,
  userId: string,
  metadata: { prompt: string; mode: string; threadId?: string }
): Promise<string> {
  const buffer = Buffer.from(base64, 'base64')
  const filename = `generated/${userId}/${Date.now()}-${crypto.randomUUID()}.png`
  const storageRef = ref(getStorage(), filename)

  await uploadBytes(storageRef, buffer, {
    contentType: 'image/png',
    customMetadata: {
      prompt: metadata.prompt.substring(0, 200),
      mode: metadata.mode,
      threadId: metadata.threadId || '',
    }
  })

  return await getDownloadURL(storageRef) // CDN-backed permanent URL
}
```

**Image document in Firestore** (new `userImages` collection):
```typescript
interface UserImage {
  id: string
  userId: string
  url: string              // Firebase Storage CDN URL
  prompt: string           // What was requested
  enhancedPrompt: string   // What was sent to gpt-image-1
  mode: Mode
  threadId: string | null
  aspectRatio: string      // '1024x1024' | '1024x1536' | '1536x1024'
  type: 'generated' | 'edited'
  parentImageId: string | null  // For edits — links to original
  pinned: boolean          // User saved to gallery
  createdAt: Timestamp
}
```

**Migration path**:
- New images → stored in cloud, URL returned
- Existing base64 images in chat → left as-is (no migration needed, they still display)
- `message.imageUrl` field continues to work — just holds a URL instead of data URI

**Files to change**: new `imageStorage.ts`, `imageGeneration.ts`, `chatController.ts`, `types.ts`

---

#### R3: Configurable Aspect Ratios
**Support portrait, landscape, and square image sizes.**

**Current**: Hardcoded `size: '1024x1024'` in both `generateImageGptImage1` and `editImageGptImage1`.

**gpt-image-1 supported sizes** (Azure API):
- `1024x1024` — square (default)
- `1024x1536` — portrait (attire, people, full-length looks)
- `1536x1024` — landscape (venues, table settings, panoramic decor)

**Proposed changes**:

```typescript
// imageGeneration.ts
export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024'

export async function generateImageGptImage1(
  prompt: string,
  size: ImageSize = '1024x1024'  // New parameter with default
): Promise<string | null> {
  // ...
  body: JSON.stringify({
    prompt: buildImageGenPrompt(prompt),
    n: 1,
    size,  // Was hardcoded, now configurable
    output_format: 'png',
  }),
}
```

**LLM-driven selection** (via R1 tool call):
- LLM picks aspect ratio based on content: "Show me a lehenga" → portrait; "Design a reception hall" → landscape; "Create a mood board" → square
- User can also explicitly say "in portrait" or "landscape format"

**Frontend**: Display images responsively based on aspect ratio. No fixed `max-w-[300px]` — use aspect-ratio-aware containers.

**Files to change**: `imageGeneration.ts`, `chatController.ts`, `Index.tsx` (image display CSS)

---

#### R4: Per-User Rate Limiting & Quotas
**Prevent cost overruns and abuse.**

**Current**: Zero rate limiting. Any authenticated user can generate unlimited images.

**Proposed limits**:

| Tier | Daily Image Limit | Monthly Limit | Max Resolution |
|------|-------------------|---------------|----------------|
| Free | 5/day | 50/month | 1024x1024 only |
| Premium | 30/day | 500/month | All sizes |

**Implementation**:
```typescript
// services/imageQuota.ts
interface ImageUsage {
  userId: string
  dailyCount: number
  monthlyCount: number
  lastReset: Timestamp       // Daily reset
  monthlyReset: Timestamp    // Monthly reset
}

export async function checkImageQuota(userId: string, isPremium: boolean): Promise<{
  allowed: boolean
  remaining: number
  resetAt: Date
}> {
  // Read from Firestore `imageUsage/{userId}`
  // Check against tier limits
  // Return quota status
}

export async function incrementImageUsage(userId: string): Promise<void> {
  // Atomic increment of daily + monthly counters
}
```

**User-facing**: When quota exceeded, return friendly message: "You've used all 5 image generations for today. Upgrade to Premium for 30/day, or try again tomorrow!"

**Files to change**: new `imageQuota.ts`, `chatController.ts`, `imageController.ts`

---

#### R5: Image Download & Share
**Let users download generated images and get shareable links.**

**Current**: Images are only viewable inline in chat. No download, no sharing.

**Proposed frontend changes** (`Index.tsx`):
```tsx
{message.imageUrl && (
  <div className="mt-3 relative group">
    <img src={message.imageUrl} alt="Generated" className="rounded-lg" />
    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-2">
      <Button size="sm" onClick={() => downloadImage(message.imageUrl)}>
        <Download size={16} /> Save
      </Button>
      <Button size="sm" onClick={() => copyShareLink(message.imageUrl)}>
        <Share size={16} /> Share
      </Button>
      <Button size="sm" onClick={() => pinToGallery(message.id)}>
        <Pin size={16} /> Save to Gallery
      </Button>
    </div>
  </div>
)}
```

**Backend**: With R2 (cloud storage), URLs are already permanent and shareable. Download is a direct link to the storage URL.

**Files to change**: `Index.tsx`

---

### 3.2 TIER 2 — Important (Competitive Advantage)

#### R6: Conversational Image Editing (Multi-Turn Refinement)
**Enable "make it more pink" style iterative edits using gpt-4o + gpt-image-1 within Azure.**

**Current**: Each edit is stateless. `editImageGptImage1` receives the raw user image + prompt. No memory of prior generated images.

**Problem**: User says "Generate a red lehenga" → gets image → says "Make the embroidery gold" → system doesn't know which image to edit (the generated one isn't available as input).

**Proposed solution**: Track the "active image" in conversation context.

**Backend changes** (`chatController.ts`):
```typescript
// When LLM calls generate_image tool and image is generated:
// 1. Store the generated image URL in a session/thread context
// 2. On next message, if user references editing ("make it", "change the", etc.)
//    AND there's an active generated image in the thread:
//    → Pass that image to editImageGptImage1

// New field in ChatPayload
interface ChatPayload {
  // ... existing fields
  lastGeneratedImageUrl?: string  // Frontend sends back the last AI-generated image
}
```

**Frontend changes** (`useChat.ts`):
```typescript
// Track last generated image per thread
const [lastGeneratedImage, setLastGeneratedImage] = useState<string | null>(null)

// When AI response includes imageUrl:
if (finalMeta.imageUrl) {
  setLastGeneratedImage(finalMeta.imageUrl)
}

// On next send, include it:
await sendMessage(text, audio, mode, lang, imageBase64 || lastGeneratedImageBase64, imageMimeType)
```

**Edit flow**:
1. User: "Generate a red lehenga" → gpt-image-1 generates → stored as `lastGeneratedImage`
2. User: "Make the embroidery gold" → LLM calls `generate_image` tool with `action: 'edit'`
3. Backend fetches `lastGeneratedImage` from storage → passes to `editImageGptImage1`
4. Edited image returned → becomes new `lastGeneratedImage`
5. User: "Now add a dupatta" → same flow, building on previous edit

**Fallback**: If edit API fails → existing `fallbackImageToImage` (analyze + regenerate) still works.

**Files to change**: `chatController.ts`, `useChat.ts`, `functionsService.ts`, `types.ts`

---

#### R7: Multi-Variant Generation (Show 2-3 Options)
**Generate multiple image variants so users can compare.**

**Current**: `n: 1` hardcoded in both generate and edit calls.

**gpt-image-1 supports**: `n: 1-4` images per request (Azure API).

**Proposed changes**:

```typescript
// imageGeneration.ts
export async function generateImageGptImage1(
  prompt: string,
  size: ImageSize = '1024x1024',
  count: 1 | 2 | 3 = 1  // New parameter
): Promise<string[]> {  // Returns array instead of single string
  // ...
  body: JSON.stringify({
    prompt: buildImageGenPrompt(prompt),
    n: count,
    size,
    output_format: 'png',
  }),
  // ...
  // Parse all returned images
  const images = data.data.map(d => d.b64_json || d.b64).filter(Boolean)
  return images  // Array of base64 strings
}
```

**LLM trigger**: When user says "show me options" or "give me a few choices" → LLM sets a `variants` parameter in the tool call.

**Tool update** (from R1):
```typescript
parameters: {
  // ... existing
  variants: {
    type: 'integer',
    enum: [1, 2, 3],
    description: 'Number of image variants. Use 2-3 when user asks for options/choices.'
  }
}
```

**Frontend**: Carousel/grid display for multiple images. User taps to select favorite → that becomes the "active image" for further editing.

**Cost consideration**: 3 variants = 3x image cost. Only premium users get multi-variant, free users get 1.

**Response format change**:
```typescript
// types.ts — ChatResponse
interface ChatResponse {
  // ... existing
  imageUrl: string | null       // Primary image (backward compatible)
  imageUrls?: string[]          // All variants (new)
}
```

**Files to change**: `imageGeneration.ts`, `chatController.ts`, `types.ts`, `Index.tsx`

---

#### R8: Image Gallery / Mood Board
**Dedicated view for all user-generated images, with pin/save/organize.**

**Depends on**: R2 (cloud storage) for persistent URLs and `userImages` collection.

**Firestore structure**:
```
users/{userId}/images/{imageId}
  - url: string (CDN URL)
  - prompt: string
  - mode: Mode
  - threadId: string | null
  - aspectRatio: string
  - type: 'generated' | 'edited'
  - category: 'attire' | 'venue' | 'decor' | 'cake' | 'flowers' | 'invitation' | 'other'
  - pinned: boolean
  - createdAt: Timestamp
```

**Auto-categorization**: gpt-4o classifies the image into a category based on the prompt (no extra API call — extracted from the generate_image tool's prompt).

**Frontend**: New `GalleryView` component (sibling to existing `PlannerView`):
- Grid layout of all generated images
- Filter by category (attire, venue, decor, etc.)
- Pin/unpin favorites
- Download individual or batch export
- Click to see prompt + regenerate similar

**Backend**: New endpoints:
- `GET /api/images` — list user's images (paginated)
- `PATCH /api/images/:id` — pin/unpin, update category
- `DELETE /api/images/:id` — remove from gallery

**Files to change**: new `routes/images.ts`, new `controllers/galleryController.ts`, new frontend `GalleryView.tsx`, `Index.tsx` (navigation)

---

#### R9: Style Consistency via System Prompt Injection
**Maintain visual style across multiple generations in a session.**

**Current**: Each image generation uses a generic "Wedding/cultural celebration context" wrapper. No style memory.

**Proposed**: Extract style descriptors from the first generated image and inject into subsequent prompts.

**Implementation** (`imageGeneration.ts`):
```typescript
// After first image is generated in a thread, extract style tokens:
export async function extractStyleDescriptors(prompt: string): string[] {
  // Parse from the LLM's generate_image tool call:
  // Colors: "red, gold, ivory"
  // Style: "photorealistic, romantic, warm lighting"
  // Cultural: "South Indian, traditional"
  return ['red and gold palette', 'photorealistic', 'warm romantic lighting', 'South Indian traditional']
}

// Inject into subsequent prompts:
function buildImageGenPrompt(userPrompt: string, styleContext?: string[]): string {
  const styleStr = styleContext?.length
    ? `Maintain consistent style: ${styleContext.join(', ')}. `
    : ''
  return `Wedding/cultural celebration context. ${styleStr}${userPrompt}. Style: elegant, photorealistic, wedding-appropriate.`
}
```

**Storage**: Style descriptors stored per-thread in memory (no Firestore needed — lives in the chat session).

**Files to change**: `imageGeneration.ts`, `chatController.ts`

---

### 3.3 TIER 3 — Nice-to-Have (Premium Differentiators)

#### R10: Vision Detail Toggle
**Allow `high` detail mode for uploaded image analysis.**

**Current**: Hardcoded `detail: 'low'` in `analyzeImage()` (line 249).

**Change**: Default to `auto` (let gpt-4o decide), allow `high` for detailed bridal photos.

```typescript
export async function analyzeImage(
  imageBase64: string,
  mimeType: string,
  prompt?: string,
  detail: 'low' | 'high' | 'auto' = 'auto'  // New parameter
): Promise<string> {
  // ...
  image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail }
}
```

**Files to change**: `imageGeneration.ts`

---

#### R11: Invitation / Card Text Rendering
**Generate wedding invitation mockups with text overlay.**

**Approach**: gpt-image-1 has reasonable text rendering capabilities. Enhance prompt engineering for text-heavy images.

**Prompt template**:
```typescript
function buildInvitationPrompt(details: {
  names: string
  date: string
  venue: string
  style: string
}): string {
  return `Elegant wedding invitation card design. Names: "${details.names}". Date: "${details.date}". Venue: "${details.venue}". Style: ${details.style}. The text should be clearly readable, centered, with decorative borders. High-quality typography.`
}
```

**LLM integration**: When the LLM detects invitation/card intent, it structures the prompt with explicit text fields.

**Files to change**: `imageGeneration.ts` (new prompt builder)

---

#### R12: Image-to-Product Matching (Visual Search)
**Upload a photo → find similar products in catalog.**

**Current**: Stylist mode uses Algolia text search. No visual search.

**Proposed flow**:
1. User uploads image of a lehenga they like
2. gpt-4o vision analyzes → extracts: "red lehenga, A-line, heavy gold embroidery, sequin work"
3. Extracted keywords → Algolia search → matching products returned
4. Display: "Here are similar options from our collection: [products]"

**Implementation**: Combine existing `analyzeImage()` + `getRelevantProductsViaAlgolia()`:

```typescript
// In stylist mode, when image-to-text is classified:
const imageDescription = await analyzeImage(imageBase64, mimeType,
  'Extract searchable product attributes: garment type, color, fabric, embroidery, occasion, style.'
)
const products = await getRelevantProductsViaAlgolia(imageDescription)
// Inject products into system prompt for LLM to format
```

**Files to change**: `chatController.ts` (stylist mode image handling)

---

#### R13: Batch Mood Board Generation
**"Create a complete mood board" → generates 4-6 themed images at once.**

**Trigger**: User says "Create a mood board for a Rajasthani wedding" or "Show me a complete look".

**LLM orchestration**: gpt-4o breaks down into sub-prompts:
1. Venue/mandap decoration
2. Bridal attire
3. Groom attire
4. Table setting / food presentation
5. Floral arrangement
6. Color palette swatch

**Execution**: 4-6 parallel `generateImageGptImage1` calls with themed prompts. Each tagged with category for gallery auto-organization.

**Cost**: Premium-only. 6 images = ~$0.24 per mood board.

**Files to change**: `chatController.ts`, `imageGeneration.ts`, `Index.tsx` (mood board grid layout)

---

## 4. Technical Architecture (To-Be)

### 4.1 Updated Pipeline

```
User Message
  |
  v
gpt-4o LLM Call (streaming)
  |-- System prompt (mode-specific + style context + language instruction)
  |-- Tools: [mode_tools] + [generate_image]  (always available)
  |-- Vision data (if image attached)
  |
  |--- LLM decides: text-only response? OR call generate_image tool?
  |
  v (if generate_image tool called)
  |
  Tool Execution:
  |-- Extract: prompt, action, aspect_ratio, variants from tool args
  |-- Check quota (imageQuota.ts)
  |-- If action='generate': generateImageGptImage1(prompt, size, count)
  |-- If action='edit': editImageGptImage1(lastImage, prompt, size)
  |-- Upload to Firebase Storage (imageStorage.ts)
  |-- Save metadata to userImages collection
  |-- Return CDN URL(s)
  |
  v
  Second LLM pass (with tool result: "Image generated successfully: [URL]")
  |-- LLM writes user-facing response referencing the image
  |
  v
  SSE Response: { text, imageUrl, imageUrls[], calendarEvent, toolActions }
```

### 4.2 API Changes

**New endpoints**:
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/images` | List user's generated images (paginated) |
| PATCH | `/api/images/:id` | Pin/unpin, update category |
| DELETE | `/api/images/:id` | Remove from gallery |

**Modified endpoints**:
| Method | Path | Change |
|--------|------|--------|
| POST | `/api/chat/stream` | Response includes `imageUrls[]` array |
| POST | `/api/generate-image` | Accepts `size`, `count` params; returns URLs instead of base64 |

**Deprecated**:
| What | Why |
|------|-----|
| `classifyImageRequest()` | Replaced by LLM tool-calling (R1) |
| `buildContextAwareImagePrompt()` | LLM writes prompt directly in tool call (R1) |
| `isImageRequest()` / `isImageEditRequest()` | Regex no longer needed (R1) |
| Base64 data URI returns | Replaced by CDN URLs (R2) |

### 4.3 New Files

```
easebot-backend/src/
  services/
    imageStorage.ts      — Firebase Storage upload + URL generation
    imageQuota.ts        — Per-user rate limiting
  controllers/
    galleryController.ts — Gallery CRUD endpoints
  routes/
    images.ts            — Gallery routes

Wedding-Ease-Viva-Chat/src/
  components/
    ImageCarousel.tsx    — Multi-variant image display
    ImageActions.tsx     — Download/share/pin overlay
  pages/
    GalleryView.tsx      — Image gallery / mood board page
```

### 4.4 Type Changes

```typescript
// types.ts — Backend
interface ChatPayload {
  // ... existing
  lastGeneratedImageUrl?: string  // For iterative editing (R6)
}

interface ChatResponse {
  // ... existing
  imageUrl: string | null          // Primary image (backward compat)
  imageUrls?: string[]             // All variants (R7)
}

// New
interface ImageQuotaStatus {
  allowed: boolean
  remaining: number
  dailyUsed: number
  dailyLimit: number
  resetAt: string  // ISO date
}

type ImageSize = '1024x1024' | '1024x1536' | '1536x1024'

// types/index.ts — Frontend
interface Message {
  // ... existing
  imageUrls?: string[]             // Multiple variants
}
```

---

## 5. Cost Analysis

### 5.1 Current Cost Per Image Request

| Component | API Call | Cost |
|-----------|---------|------|
| Prompt enhancement | gpt-4o (~300 tokens in, ~150 out) | ~$0.0015 |
| Image generation | gpt-image-1 (1024x1024) | ~$0.04 |
| Chat response | gpt-4o (~1000 tokens in, ~500 out) | ~$0.008 |
| **Total** | **3 API calls** | **~$0.05/request** |

### 5.2 V2 Cost Per Image Request

| Component | API Call | Cost |
|-----------|---------|------|
| Chat + classification | gpt-4o with tool call (single call) | ~$0.01 |
| Image generation | gpt-image-1 (1024x1024) | ~$0.04 |
| Second pass (tool result) | gpt-4o (~500 tokens) | ~$0.005 |
| Storage | Firebase Storage (~0.5MB) | ~$0.0001 |
| **Total** | **3 API calls (but no prompt-enhancement call)** | **~$0.055/request** |

### 5.3 Variant Cost

| Variants | Image Cost | Total Request Cost |
|----------|-----------|-------------------|
| 1 (default) | $0.04 | ~$0.055 |
| 2 | $0.08 | ~$0.095 |
| 3 | $0.12 | ~$0.135 |

### 5.4 Monthly Cost Projection (Per Active User)

| Tier | Images/Month | Cost/Month |
|------|-------------|------------|
| Free (casual) | ~20 | ~$1.10 |
| Premium (active) | ~100 | ~$5.50 |
| Premium (power) | ~300 (with variants) | ~$25 |

---

## 6. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] R1: LLM-based intent classification via `generate_image` tool
- [ ] R2: Firebase Storage integration for image persistence
- [ ] R3: Configurable aspect ratios (3 sizes)
- [ ] R4: Per-user image quota system

### Phase 2: User Experience (Week 3-4)
- [ ] R5: Image download/share UI overlay
- [ ] R6: Conversational editing (multi-turn with last-generated tracking)
- [ ] R7: Multi-variant generation (2-3 options)
- [ ] R10: Vision detail toggle (`auto` default)

### Phase 3: Gallery & Polish (Week 5-6)
- [ ] R8: Image gallery / mood board view
- [ ] R9: Style consistency via prompt injection
- [ ] R11: Invitation text rendering prompt templates
- [ ] R12: Image-to-product visual search (stylist mode)

### Phase 4: Premium Features (Week 7-8)
- [ ] R13: Batch mood board generation
- [ ] Gallery export (PDF / ZIP)
- [ ] Premium-only size unlocks
- [ ] Analytics dashboard (popular prompts, generation stats)

---

## 7. Success Metrics

| Metric | Current Baseline | Target (3 months) |
|--------|-----------------|-------------------|
| Image generation accuracy (user got what they wanted) | ~60% (regex misses) | >90% (LLM classification) |
| Images generated per active user per week | ~2 | ~8 |
| Image-related session length | ~3 messages | ~7 messages (iterative editing) |
| Image share rate | 0% (not possible) | >15% |
| Gallery saves (pins) per user | 0 (no gallery) | >5/month |
| Premium conversion from image features | N/A | >5% of free users |
| Cost per image request | $0.05 | $0.055 (slight increase for storage, offset by removing prompt-enhancement call) |
| P95 latency (text + image) | 30s | 20s (no prompt-enhancement delay) |

---

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| gpt-image-1 rate limits on Azure | Medium | Image gen fails for burst traffic | Queue system with retry; show "generating..." placeholder |
| Firebase Storage costs scale faster than expected | Low | Higher infra cost | Lifecycle rules: auto-delete unpinned images >90 days |
| LLM over-triggers image generation | Medium | Unwanted images, wasted quota | Tune system prompt: "Only generate images when the user explicitly or clearly implicitly wants a visual" |
| Image edit quality inconsistent | Medium | User frustration | Keep fallback chain; add "Regenerate" button |
| Gallery adds UX complexity | Low | Users confused by navigation | Progressive disclosure: gallery appears only after first image saved |

---

## 9. Out of Scope (This Version)

- Switching to Gemini / non-Azure models (constraint: Azure AI Foundry only)
- Video generation
- 3D model generation
- Real-time collaborative mood boards (multi-user)
- AR/try-on features
- Print-ready export (CMYK, 300dpi)
- Watermarking for free-tier images (consider for future monetization)

---

## 10. Dependencies

| Dependency | Status | Owner |
|------------|--------|-------|
| Azure gpt-image-1 deployment | Deployed | Infra |
| Azure gpt-4o deployment with tool calling | Deployed | Infra |
| Firebase Storage bucket | Needs setup | Infra |
| Firebase Storage security rules | Needs config | Infra |
| Firestore `userImages` collection + indexes | Needs creation | Backend |
| Frontend routing for GalleryView | Needs implementation | Frontend |
