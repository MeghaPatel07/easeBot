# Phase 3: Chat, Images, and Auth - Implementation Guide

## Overview

Phase 3 involves migrating the remaining Cloud Functions:
- `chatSend()` - Chat message processing
- `imagesGenerate()` - Image generation
- `authSendOtp()` - OTP sending via SMS/WhatsApp

These differ from Phase 1/2 in that they have more complex architectural patterns.

## 1. Chat & Image Generation

### Current Architecture

**Entry Point:** `useChat.ts` hook (line 340+)
- Calls `streamChatMessage(request, controller.signal)` from `functionsService`
- Implements Server-Sent Events (SSE) streaming
- Processes event stream: `c` (content), `img` (image), `p` (products), `d` (done), `e` (error)
- Handles image generation in parallel with streaming

**Code Path:**
```
ChatInput → sendMessage() → streamChatMessage() → SSE stream
                          ↓
                    setMessages() (real-time updates)
```

### Decision Point

**Question:** Does `functionsService.streamChatMessage()` already route to Cloud Functions?

#### If YES (Already Using Cloud Functions)
- **Action:** No changes needed - Phase 3a is COMPLETE
- **Verification:** Check `functionsService` implementation to confirm it calls `httpsCallable('chatSend')`
- **Result:** Move to Phase 3b/3c

#### If NO (Still Using Backend API)
Two options:

**Option A: Keep Streaming via Backend API (RECOMMENDED)**
- Rationale: Cloud Functions don't natively support SSE streaming
- Action: Leave `functionsService` and `streamChatMessage()` as-is
- Why: Refactoring for streaming would be complex and risky
- Status: Document as "using backend API for streaming" - acceptable pattern
- Pros: Minimal changes, proven pattern, less risk
- Cons: Doesn't fully migrate to Cloud Functions

**Option B: Implement Cloud Functions + SSE (ADVANCED)**
- Requires: `functionsService` to call `httpsCallable('chatSend')`
- Backend handles SSE streaming and routes through Cloud Functions
- More complex, requires backend coordination
- Only pursue if backend team agrees

### Implementation (If Needed)

If Option B is chosen, update `useChat.ts`:
```typescript
// Import from cloudFunctionsService instead of functionsService
import { chatSend, type ChatSendRequest } from '@/services/cloudFunctionsService'

// In sendMessage() function, change:
// OLD:
for await (const event of streamChatMessage({...}, controller.signal)) { ... }

// NEW: (requires backend coordination for SSE support)
for await (const event of chatSend({...}, controller.signal)) { ... }
```

**But this requires:**
1. Backend implements SSE streaming in Cloud Functions wrapper
2. OR: Switch to long-polling pattern (less efficient)
3. Testing with real streaming data

## 2. Image Generation

### Current Architecture

**Coupled to Chat:**
- `imagesGenerate` is triggered within chat streaming
- Uses `forceImageGeneration` flag in `SendMessageOptions`
- Backend handles image generation and returns via SSE events

**Code Path:**
```
useImageHubSubmit → sendMessage({ forceImageGeneration: true })
                  → streamChatMessage() → imagesGenerate happens server-side
```

### Decision Point

**Image generation is tightly coupled to chat streaming.**

#### If Chat Uses Cloud Functions
- Image generation likely handled within `chatSend()` Cloud Function
- No separate migration needed
- Status: COMPLETE when chat is migrated

#### If Chat Uses Backend API
- Keep `imagesGenerate` within backend API
- Status: Not migrated (acceptable if using backend for streaming)

### Implementation (If Needed)

Only if decoupling image generation from chat:
```typescript
// In useImageHubSubmit.ts, if you want standalone image generation:
import { imagesGenerate, type ImagesGenerateRequest } from '@/services/cloudFunctionsService'

// Call directly instead of through chat:
const response = await imagesGenerate({
  prompt,
  aspectRatio,
  referenceImage,
})
```

**Note:** This would bypass chat streaming, change UI patterns, and require significant refactoring.

## 3. Auth OTP

### Current Architecture

**Services:**
- `authService.ts` - Phone OTP via Firebase
  - `sendPhoneOtp(phone, verifier)` → Firebase captcha verification
  - `verifyPhoneOtp(result, otp)` → Verifies and signs in
- `whatsappOtpService.ts` - WhatsApp OTP
  - `sendWhatsAppOtp(e164, purpose)` → Cloud Functions call
  - `verifyWhatsAppOtp(e164, code, purpose)` → Cloud Functions call

**AuthContext:**
- Wraps above services
- Handles state management during OTP flow
- No direct API calls (delegates to services)

### Current Status

**WhatsApp OTP is ALREADY using Cloud Functions:**
- `whatsappOtpService` calls Cloud Functions
- No migration needed for WhatsApp path

**Phone OTP (Firebase) - Optional Migration:**
- Could migrate `sendPhoneOtp` to Cloud Functions
- Would centralize OTP logic
- Firebase-based, simpler than WhatsApp

### Decision Point

**Question:** Should `sendPhoneOtp` be migrated to Cloud Functions?

#### Option A: Keep Firebase Phone OTP (RECOMMENDED)
- Uses Firebase built-in Recaptcha verification
- Works without backend API
- No need to migrate
- Status: COMPLETE (WhatsApp already using Cloud Functions)

#### Option B: Migrate to Cloud Functions
- Centralizes all OTP in Cloud Functions
- Requires backend to handle Firebase captcha verification
- More complex, needs backend changes
- Only do if backend team wants unified OTP handling

### Implementation (If Option B)

Update `authService.ts`:
```typescript
import { authSendOtp, type AuthSendOtpRequest } from '@/services/cloudFunctionsService'

export async function sendPhoneOtp(phone: string, verifier: RecaptchaVerifier) {
  return await authSendOtp({
    phone,
    recaptchaToken: verifier.getRecaptchaToken?.(),
  })
}
```

**But requires:**
1. Backend Cloud Function accepts Recaptcha tokens
2. Backend validates Recaptcha tokens
3. Testing phone OTP flow with Cloud Functions

## Decision Matrix

| Component | Current | Cloud Functions Support | Recommended Action |
|-----------|---------|----------------------|-------------------|
| Chat Streaming | Backend API | ❓ TBD | Clarify with backend |
| Image Generation | Coupled to chat | Coupled to chat | Depends on chat decision |
| WhatsApp OTP | Cloud Functions | ✅ Already integrated | COMPLETE - no action |
| Phone OTP | Firebase | ⚠️ Could migrate | Keep as-is (Firebase) |

## Implementation Checklist

### Phase 3a: Chat & Images
- [ ] Verify if `functionsService.streamChatMessage()` uses Cloud Functions
- [ ] If YES: Mark complete, move to Phase 3b
- [ ] If NO: Decide Option A (keep backend) or Option B (refactor)
- [ ] If Option B: Coordinate with backend, implement, test

### Phase 3b: WhatsApp OTP
- [ ] Verify `whatsappOtpService` is using Cloud Functions
- [ ] Status: Should already be COMPLETE
- [ ] Mark complete

### Phase 3c: Phone OTP
- [ ] Decide: Keep Firebase (Option A) or migrate (Option B)
- [ ] If Option A: Mark complete (no changes)
- [ ] If Option B: Update `authService.ts`, test with Recaptcha

## What This Means

### Phase 1 & 2: COMPLETE ✅
- Payment: `paymentInitiate()`, `paymentVerify()`
- Subscriptions: `subscriptionUpgrade()`, `subscriptionDowngrade()`, `subscriptionCurrent()`
- 4 components updated
- Ready for testing

### Phase 3: BLOCKED on Decisions ⏳
- Chat/Images: Requires clarification on streaming architecture
- WhatsApp OTP: Should already be complete (verify)
- Phone OTP: Decide Firebase (complete) vs Cloud Functions (migrate)

### Phase 4: Testing & Deployment
- Can proceed with Phase 1 & 2
- Wait for Phase 3 clarification before full deployment

## Next Steps

1. **Immediate:**
   - Check if `whatsappOtpService` is already using Cloud Functions (should be complete)
   - Check `functionsService.streamChatMessage()` implementation
   - Decide on Phone OTP strategy (Firebase vs Cloud Functions)

2. **Based on Chat Decision:**
   - If chat already uses Cloud Functions: Update documentation, proceed to testing
   - If chat uses backend API: Decide to keep as-is or refactor
   - If refactor: Coordinate with backend team, implement, test

3. **Testing:**
   - Phase 1 & 2 can be tested immediately
   - Phase 3 components tested once architecture is clarified

## Summary

- **Phase 1 & 2:** Fully migrated, ready for testing
- **Phase 3:** Blocked on architectural decisions, not missing code
- **Decision Points:** Chat streaming, image generation, phone OTP
- **Path Forward:** Clarify decisions, document choices, then implement remaining pieces

---

**Status:** Phase 1 & 2 Complete | Phase 3 Decisions Pending | Phase 4 Awaiting Phase 3 Clarity

