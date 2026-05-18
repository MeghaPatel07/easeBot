# Firebase Functions Conversion Execution Plan

**Scope:** Convert Express backend (12 controllers, 11 route files) → Firebase Functions  
**Target Location:** `/Users/krish/Desktop/weddingease/wedding-ease-admin/functions`  
**Timeline:** Phased conversion maintaining exact functionality  
**Constraints:** NO changes to Firebase rules, permissions, or access rights

---

## I. CURRENT STATE INVENTORY

### A. Controllers to Convert (12 files)
1. **accountController.ts** (28.8 KB) — Account operations, deletion, preferences, exports
2. **authController.ts** (7.5 KB) — Auth operations (signing, token verification)
3. **chatController.ts** (76.6 KB) — Core chat, streaming, LLM calls, tools
4. **checklistController.ts** (2.4 KB) — Checklist CRUD operations
5. **feedbackController.ts** (1.9 KB) — Feedback submission
6. **imageController.ts** (6.0 KB) — Image generation via Azure
7. **notesController.ts** (14.6 KB) — Notes CRUD, attachments
8. **paymentController.ts** (20.9 KB) — PayU integration, plan pricing
9. **speechTokenController.ts** (0.7 KB) — Azure Speech token generation
10. **subscriptionController.ts** (6.3 KB) — Subscription state machine
11. **ttsController.ts** (3.0 KB) — Text-to-speech synthesis
12. **transcribeController.ts** (2.9 KB) — Speech-to-text transcription

### B. Routes to Convert (11 files)
- account.ts → Strict auth + rate limiting (10/min routine, 5/hour sensitive)
- auth.ts → Basic auth operations
- chat.ts → Chat endpoints + streaming
- checklists.ts → Checklist endpoints
- feedbackRoutes.ts → Feedback endpoint
- image.ts → Image generation endpoint
- notes.ts → Notes endpoints
- payment.ts → Payment + subscription endpoints
- speechTokenController.ts → Direct endpoint (GET /api/speech-token)
- tts.ts → TTS endpoint
- transcribe.ts → Transcription endpoint

### C. Cross-Controller Dependencies
- **authController** ← imported by accountController for auth checks
- **chatController** imports: plannerTools, tokenMeter, imageGeneration, azureAI, conversationSummarizer, etc.
- **paymentController** imports: tokenMeter, subscriptionStateMachine, invoiceService
- **notesController** imports: tokenMeter, imageStorage
- Middleware: requireAuth, requireStrictAuth, rate limiters, input sanitizer, promptGuard

---

## II. FIREBASE FUNCTIONS PATTERNS (From wedding-ease-admin)

### Pattern 1: Callable Functions (for authenticated requests)
```javascript
const { onCall } = require("firebase-functions/v2/https");

exports.functionName = onCall({
  memory: '512MiB',
  timeoutSeconds: 60,
  maxInstances: 5
}, async (request) => {
  try {
    // request.auth.uid = authenticated user ID (Firebase enforces auth)
    // request.data = request body
    return { success: true, data: ... };
  } catch (error) {
    console.error('Error:', error);
    return { success: false, error: error.message };
  }
});
```

### Pattern 2: HTTP Functions (for public/webhook requests)
```javascript
const { onRequest } = require("firebase-functions/v2/https");

exports.functionName = onRequest({
  memory: '512MiB',
  timeoutSeconds: 60
}, async (req, res) => {
  try {
    // Manual auth checks (e.g., hash verification for PayU)
    res.json({ success: true, data: ... });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});
```

### Key Differences vs Express
| Express | Firebase Functions |
|---------|-------------------|
| `req.user.uid` (set by middleware) | `request.auth.uid` (auto-set by onCall) |
| `req.body` | `request.data` |
| `res.json()` / `res.status()` | Return object or `res.json()` / `res.status()` |
| Middleware chain | Manual auth checks in function |
| Rate limiting middleware | Must implement in-function (token buckets) |
| Error handling middleware | Try-catch + structured response |

---

## III. CONVERSION STRATEGY

### Phase 1: Infrastructure Setup (Week 1)
**Goal:** Prepare wedding-ease-admin/functions directory structure

- [ ] Review existing wedding-ease-admin/functions/index.js export pattern
- [ ] Create subdirectory structure:
  - `functions/theweddingbot/v1/account/` (handleGetMe, handleUpdateProfile, etc.)
  - `functions/theweddingbot/v1/auth/` (auth operations)
  - `functions/theweddingbot/v1/chat/` (chat endpoint + streaming)
  - `functions/theweddingbot/v1/checklists/` (checklist operations)
  - `functions/theweddingbot/v1/feedback/` (feedback)
  - `functions/theweddingbot/v1/images/` (image generation)
  - `functions/theweddingbot/v1/notes/` (notes operations)
  - `functions/theweddingbot/v1/payment/` (payment + subscription)
  - `functions/theweddingbot/v1/tts/` (TTS)
  - `functions/theweddingbot/v1/transcribe/` (transcription)
  - `functions/theweddingbot/v1/tokens/` (speech token)
- [ ] Create `functions/utils/` for shared helpers:
  - authHelpers.js (requireStrictAuth, requireAuth equivalent)
  - rateLimiters.js (in-memory token buckets)
  - responseFormatter.js (consistent response structure)
- [ ] Update `functions/index.js` to export all new functions

### Phase 2: Dependency & Utility Migration (Week 1)
**Goal:** Port all imported services/utilities to Firebase Functions context

- [ ] Port middleware logic:
  - Auth verification (requireAuth, requireStrictAuth)
  - Rate limiting (10/min routine, 5/hour sensitive, image limits)
  - Input sanitization
  - Prompt guard
  - Error handling
  
- [ ] Port shared services:
  - `lib/firebaseAdmin` → Use Firebase Admin SDK directly
  - `lib/posthog` → PostHog event capture
  - `lib/observability` → Logging/observability
  - `services/tokenMeter` → Token charging/refunding
  - `services/azureAI` → Azure OpenAI calls
  - `services/imageGeneration` → Image gen logic
  - `services/imageStorage` → Cloud Storage operations
  - `services/conversationSummarizer` → Conversation summarization
  - `services/subscriptionStateMachine` → Subscription state logic
  - `services/invoiceService` → Invoice generation
  - `services/exchangeRateService` → Exchange rate lookups
  - `utils/payuHash` → PayU hash verification
  - `pipeline/inbound` → Inbound message processing
  - `pipeline/outbound` → Outbound response processing
  - `pipeline/languageInstruction` → Language detection

**Decision:** Prioritize by controller criticality:
1. **High:** account, chat, payment (user-facing, revenue-critical)
2. **Medium:** notes, checklists, imageController
3. **Low:** feedback, transcribe, tts, auth (supplementary)

### Phase 3: Critical Controllers → Functions (Weeks 2-3)
**Tier 1 (First 3):** account, auth, payment

**For each controller:**
1. Create function file(s) in `functions/v1/{domain}/{functionName}.js`
2. Port entire handler logic with exact same:
   - Input validation
   - Firestore queries (adminDb.collection().doc().get(), etc.)
   - Error handling & response codes
   - Token charging/refunding
   - State transitions
   - Rate limiting enforcement
3. Convert Express patterns:
   ```javascript
   // Express
   router.post('/initiate', requireAuth, initiate)
   export const initiate = (req, res, next) => { ... }
   
   // Firebase
   exports.paymentInitiate = onCall({...}, async (request) => {
     if (!request.auth?.uid) throw new HttpsError('unauthenticated', '...');
     // same logic as initiate handler
   })
   ```
4. Handle rate limiting in-function using token buckets
5. Test end-to-end via Viva Chat with manual Firebase Function deployment
6. Update `index.js` exports

**Tier 2 (Next 4):** chat, notes, images, checklists
- Chat is largest (77 KB) — split streaming vs non-streaming if needed
- Notes: simple CRUD + attachment handling
- Images: straightforward image generation call
- Checklists: CRUD operations

**Tier 3 (Final 4):** feedback, transcribe, tts, tokens
- Smallest, simplest functions
- Minimal dependencies

### Phase 4: Testing & Validation (Week 3)
**In Viva Chat:**

- [ ] Test each endpoint path (account, chat, notes, etc.) matches current behavior
- [ ] Verify request/response payloads are identical
- [ ] Validate error codes (401, 403, 429, 400, 500) match
- [ ] Check rate limiting enforcement (10/min, 5/hour)
- [ ] Verify Firestore writes (users, messages, subscriptions, etc.)
- [ ] Confirm token charging/refunding accuracy
- [ ] Check PostHog event capture
- [ ] Validate image generation calls & storage
- [ ] Test streaming responses (if applicable to Firebase Functions)
- [ ] Check payment flow with PayU callbacks

### Phase 5: Deployment & Cutover (Week 4)
**Requirements:**
- [ ] All functions deployed to Firebase (via `firebase deploy --only functions`)
- [ ] Frontend updated to call Firebase Functions (not Express endpoints)
- [ ] Environment variables migrated (.env → Firebase config)
- [ ] Cold start performance validated (optimize if needed)
- [ ] Monitoring/logging set up
- [ ] Rollback plan in place

---

## IV. FUNCTION-BY-FUNCTION CONVERSION CHECKLIST

### Account Functions
- [ ] **accountGetMe** (GET /api/account/me)
  - Auth: requireStrictAuth
  - Output: User profile + subscription + usage
  
- [ ] **accountUpdateProfile** (PATCH /api/account/profile)
  - Auth: requireStrictAuth + rateLimitMutations
  - Input: name, phone, avatar, preferences
  
- [ ] **accountGetPlan** (GET /api/account/plan)
  - Auth: requireStrictAuth
  - Output: Current plan + features
  
- [ ] **accountGetUsage** (GET /api/account/usage)
  - Auth: requireStrictAuth
  - Output: Token usage stats
  
- [ ] **accountGetInvoices** (GET /api/account/invoices)
  - Auth: requireStrictAuth
  - Output: Invoice list
  
- [ ] **accountGetInvoicePdf** (GET /api/account/invoices/:id/pdf)
  - Auth: requireStrictAuth
  - Output: PDF buffer
  
- [ ] **accountSwitchPlan** (POST /api/payment/subscription/upgrade | downgrade)
  - Auth: requireStrictAuth + rateLimitMutations
  - Input: new plan
  - Logic: Subscription state machine
  
- [ ] **accountSoftDelete** (POST /api/account/delete)
  - Auth: requireStrictAuth + rateLimitSensitive
  - Output: Deletion queued
  
- [ ] **accountSignOutEverywhere** (POST /api/account/sign-out-everywhere)
  - Auth: requireStrictAuth + rateLimitSensitive
  - Output: All sessions revoked
  
- [ ] **accountUpdatePreferences** (PATCH /api/account/preferences)
  - Auth: requireStrictAuth + rateLimitMutations
  - Input: language, theme, etc.
  
- [ ] **accountExport** (GET /api/account/export)
  - Auth: requireStrictAuth
  - Output: User data export (JSON/CSV)
  
- [ ] **accountClearHistory** (DELETE /api/account/history)
  - Auth: requireStrictAuth + rateLimitSensitive
  - Output: Chat history cleared

### Auth Functions
- [ ] **authGoogle** (POST /api/auth/google)
  - Input: Google token
  - Output: Firebase token
  
- [ ] **authApple** (POST /api/auth/apple)
  - Input: Apple token
  - Output: Firebase token

### Chat Functions
- [ ] **chatSend** (POST /api/chat | /api/v1/chat)
  - Auth: requireAuth (allows guest + logged-in)
  - Input: message, mode, attachments, language
  - Output: Streaming response or buffered response
  - Logic: processInbound → LLM → tools → processOutbound
  - Token charging via tokenMeter
  
- [ ] **chatHistory** (GET /api/chat/history)
  - Auth: requireAuth
  - Output: Message history
  
- [ ] **chatSearch** (POST /api/chat/search)
  - Auth: requireAuth
  - Input: query
  - Output: Search results

### Payment Functions
- [ ] **paymentInitiate** (POST /api/payment/initiate)
  - Auth: requireAuth
  - Input: plan, cycle
  - Output: PayU order hash
  
- [ ] **paymentVerify** (GET /api/payment/verify)
  - Auth: requireAuth
  - Output: Payment status
  
- [ ] **paymentReturn** (POST /api/payment/return)
  - Auth: None (PayU posts back)
  - Input: PayU response + hash
  - Logic: Verify hash → update user subscription
  
- [ ] **paymentWebhook** (POST /api/payment/webhook)
  - Auth: None (PayU posts)
  - Input: PayU webhook payload
  
- [ ] **subscriptionUpgrade** (POST /api/payment/subscription/upgrade)
  - Auth: requireAuth + rateLimitMutations
  - Input: new plan
  - Logic: State machine transition
  
- [ ] **subscriptionDowngrade** (POST /api/payment/subscription/downgrade)
  - Auth: requireAuth + rateLimitMutations
  - Input: new plan
  - Logic: State machine transition
  
- [ ] **subscriptionCurrent** (GET /api/payment/subscription/current)
  - Auth: requireAuth
  - Output: Current subscription

### Notes Functions
- [ ] **notesCreate** (POST /api/notes)
  - Auth: requireAuth
  - Input: title, content
  - Output: Note ID
  
- [ ] **notesUpdate** (PATCH /api/notes/:id)
  - Auth: requireAuth
  - Input: title, content
  
- [ ] **notesDelete** (DELETE /api/notes/:id)
  - Auth: requireAuth
  
- [ ] **notesList** (GET /api/notes)
  - Auth: requireAuth
  - Output: User's notes
  
- [ ] **notesAttach** (POST /api/notes/:id/attach)
  - Auth: requireAuth
  - Input: image
  - Logic: Upload to Cloud Storage

### Checklist Functions
- [ ] **checklistCreate** (POST /api/checklists)
  - Auth: requireAuth
  - Input: title, items
  
- [ ] **checklistUpdate** (PATCH /api/checklists/:id)
  - Auth: requireAuth
  
- [ ] **checklistDelete** (DELETE /api/checklists/:id)
  - Auth: requireAuth
  
- [ ] **checklistList** (GET /api/checklists)
  - Auth: requireAuth
  
- [ ] **checklistMarkDone** (POST /api/checklists/:id/items/:itemId/done)
  - Auth: requireAuth

### Image Functions
- [ ] **imageGenerate** (POST /api/generate-image)
  - Auth: requireAuth + imageRateLimiter
  - Input: prompt, style
  - Output: Image URL(s)
  - Token charging via tokenMeter
  - Logic: Calls Azure OpenAI Image generation

### TTS Functions
- [ ] **ttsGenerate** (POST /api/tts)
  - Auth: requireAuth
  - Input: text, voice
  - Output: Audio URL

### Transcribe Functions
- [ ] **transcribeAudio** (POST /api/transcribe)
  - Auth: requireAuth
  - Input: audio file
  - Output: Text transcript

### Token Functions
- [ ] **getSpeechToken** (GET /api/speech-token)
  - Auth: requireAuth
  - Output: Azure Speech token for client-side STT

### Feedback Functions
- [ ] **feedbackSubmit** (POST /api/feedback)
  - Auth: requireAuth (optional)
  - Input: message, rating, context
  - Output: Feedback recorded

---

## V. IMPLEMENTATION APPROACH

### 1. File Structure
```
wedding-ease-admin/functions/
├── index.js                          (imports & exports all functions)
├── utils/
│   ├── authHelpers.js               (auth middleware equivalents)
│   ├── rateLimiters.js              (token bucket implementation)
│   ├── responseFormatter.js         (consistent response structure)
│   ├── errorHandler.js              (error response factory)
│   └── methods.js                   (existing shared utilities)
├── theweddingbot/
│   └── v1/
│       ├── account/
│       │   ├── getMe.js
│       │   ├── updateProfile.js
│       │   ├── getPlan.js
│       │   ├── getUsage.js
│       │   ├── getInvoices.js
│       │   ├── getInvoicePdf.js
│       │   ├── softDelete.js
│       │   ├── signOutEverywhere.js
│       │   ├── updatePreferences.js
│       │   ├── export.js
│       │   └── clearHistory.js
│       ├── auth/
│       │   ├── google.js
│       │   └── apple.js
│       ├── chat/
│       │   ├── send.js
│       │   ├── history.js
│       │   └── search.js
│       ├── payment/
│       │   ├── initiate.js
│       │   ├── verify.js
│       │   ├── return.js
│       │   ├── webhook.js
│       │   ├── subscriptionUpgrade.js
│       │   ├── subscriptionDowngrade.js
│       │   └── subscriptionCurrent.js
│       ├── notes/
│       │   ├── create.js
│       │   ├── update.js
│       │   ├── delete.js
│       │   ├── list.js
│       │   └── attach.js
│       ├── checklists/
│       │   ├── create.js
│       │   ├── update.js
│       │   ├── delete.js
│       │   ├── list.js
│       │   └── markDone.js
│       ├── images/
│       │   └── generate.js
│       ├── tts/
│       │   └── generate.js
│       ├── transcribe/
│       │   └── audio.js
│       ├── tokens/
│       │   └── speech.js
│       └── feedback/
│           └── submit.js
```

### 2. Conversion Pattern
For each Express route, create Firebase Function:

**Express:**
```typescript
router.post('/initiate', requireAuth, initiate)
export const initiate = (req: Request, res: Response) => {
  const uid = req.user.uid;
  const { plan, cycle } = req.body;
  // ... logic
}
```

**Firebase:**
```javascript
exports.paymentInitiate = onCall({
  memory: '512MiB',
  timeoutSeconds: 60
}, async (request) => {
  // Auth check (onCall enforces this, but explicit check for clarity)
  if (!request.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  const uid = request.auth.uid;
  const { plan, cycle } = request.data;
  // ... exact same logic
  return { success: true, data: ... };
});
```

### 3. Rate Limiting Implementation (In-Memory Token Buckets)
**Replace Express middleware with in-function checks:**

```javascript
// utils/rateLimiters.js
const buckets = new Map(); // { uid: { count, resetAt } }

function checkRateLimit(uid, limit, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(uid) || { count: 0, resetAt: now + windowMs };
  
  if (now >= bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  
  bucket.count++;
  buckets.set(uid, bucket);
  
  if (bucket.count > limit) {
    throw new HttpsError('resource-exhausted', 'Rate limit exceeded');
  }
}

// In function:
checkRateLimit(uid, 10, 60000); // 10/min
checkRateLimit(uid, 5, 3600000); // 5/hour
```

### 4. Streaming Responses
Firebase Functions support streaming via `onRequest`:

```javascript
exports.chatSend = onRequest(async (req, res) => {
  // Set streaming headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Stream response
  for await (const chunk of azureAIStream(...)) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  res.end();
});
```

---

## VI. TESTING STRATEGY

### Unit Testing (In Firebase Local Emulator)
```bash
firebase emulators:start
npm test
```

### Integration Testing (Viva Chat)
1. Deploy functions: `firebase deploy --only functions`
2. Update Viva Chat to call Firebase Functions instead of Express backend
3. Test each feature:
   - Chat with all modes (planner, stylist, etc.)
   - Image generation
   - Note creation/editing
   - Payment initiation & callback
   - Account management (profile, plan, delete)
   - Rate limiting (confirm 429 errors)

### Production Testing
- [ ] Cold start latency acceptable (<5s first invocation)
- [ ] Streaming responses work in browser
- [ ] Error handling & retry logic
- [ ] Concurrent request handling

---

## VII. CRITICAL NOTES

### ⚠️ Do NOT Change
- Firebase Rules (firestore.rules, storage.rules)
- IAM Permissions (Service Account, API keys)
- Collection/Document structures
- Field names or validation schemas
- Authentication mechanisms

### ⚠️ Behavioral Parity
Ensure exact output:
- Same HTTP status codes (200, 400, 401, 403, 429, 500)
- Same response JSON structure & field names
- Same error messages & codes
- Same rate limit behavior (10/min, 5/hour)
- Same token charging logic
- Same Firestore writes/reads

### ⚠️ Performance Considerations
- Cold start time (Firebase Functions warm up slower than Express)
- Memory allocation (default 256MB sufficient for most, chat may need 512MB)
- Max execution time (60s for most, payment may need 120s)
- Concurrent connection limits per function

---

## VIII. EXECUTION TIMELINE

| Week | Phase | Deliverable |
|------|-------|------------|
| **1** | Infrastructure + Dependencies | Directory structure, shared utilities, middleware ports |
| **2** | Tier 1 Controllers | account, auth, payment functions deployed |
| **3** | Tier 2 + Testing | chat, notes, images, checklists + full validation |
| **4** | Tier 3 + Cutover | feedback, transcribe, tts, tokens + frontend migration |

---

## IX. ROLLBACK PLAN

If issues arise during testing:
1. Keep Express backend running in parallel
2. Route traffic back to Express via frontend config
3. Identify root cause in Firebase Functions
4. Fix & re-deploy functions
5. Gradual rollout (10% → 50% → 100% traffic)

---

## NEXT STEPS

1. **Review & Approve This Plan** — Confirm scope, timeline, and approach
2. **Phase 1 Start** — Set up directory structure in wedding-ease-admin/functions
3. **Phase 2** — Port middleware & utilities
4. **Phase 3+** — Convert controllers tier-by-tier
5. **Testing** — Validate in Viva Chat before production
6. **Deployment** — Deploy to Firebase Production

---

**Questions?** Let me know before we start Phase 1.
