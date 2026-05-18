# Firebase Cloud Functions Frontend Integration

This directory contains all the frontend services for Viva Chat, including the new Firebase Cloud Functions integration.

## New Cloud Functions Service

**File:** `cloudFunctionsService.ts`

This is the main service that provides type-safe wrappers for all Firebase Cloud Functions. It replaces direct backend API calls with Cloud Function calls.

### Available Functions

1. **Authentication**
   - `authSendOtp(email)` - Send OTP via email

2. **Chat**
   - `chatSend(request)` - Send message and get AI response

3. **Images**
   - `imagesGenerate(request)` - Generate images via DALL-E 3

4. **Payment**
   - `paymentInitiate(request)` - Initiate payment via PayU
   - `paymentVerify(request)` - Verify payment completion

5. **Subscription**
   - `subscriptionCurrent()` - Get current subscription state
   - `subscriptionUpgrade(request)` - Upgrade subscription tier
   - `subscriptionDowngrade(request)` - Downgrade subscription

## Documentation Files

### 1. `CLOUD_FUNCTIONS_INTEGRATION.md`
**Purpose:** Complete integration guide

**Contains:**
- Overview of all functions
- Import statements
- Usage examples for each function
- Integration checklist for each component
- Error handling patterns
- Environment configuration
- Comparison: Backend API vs Cloud Functions
- Migration priority

**Start here:** If you're new to the Cloud Functions integration, read this first.

### 2. `CLOUD_FUNCTIONS_API_REFERENCE.md`
**Purpose:** Complete API reference

**Contains:**
- Detailed function signatures
- Parameter types and requirements
- Return value structures
- Complete usage examples
- Error codes and handling
- Type definitions
- Best practices
- Testing instructions

**Use this:** When building features and you need the exact API format.

### 3. `INTEGRATION_EXAMPLES.md`
**Purpose:** Concrete code examples

**Contains:**
- Real component examples (before/after)
- Example 1: Checkout.tsx - Payment integration
- Example 2: useChat hook - Chat integration
- Example 3: Settings - Subscription integration
- Example 4: Image generation
- Example 5: Auth OTP flow
- Migration strategy with steps
- Gradual migration approach
- Rollback plan

**Use this:** When updating a specific component.

## File Structure

```
src/services/
├── cloudFunctionsService.ts          # Main Cloud Functions wrapper
├── README.md                         # This file
├── CLOUD_FUNCTIONS_INTEGRATION.md    # Integration guide
├── CLOUD_FUNCTIONS_API_REFERENCE.md  # API reference
├── INTEGRATION_EXAMPLES.md           # Code examples
├── chatService.ts                    # Firestore chat operations (unchanged)
├── functionsService.ts               # Backend API calls (keep for now)
├── paymentService.ts                 # Payment helpers (keep for form generation)
├── authService.ts                    # Auth helpers (unchanged)
└── [other services...]
```

## Quick Start

### Step 1: Import the Service

```typescript
import {
  chatSend,
  authSendOtp,
  imagesGenerate,
  paymentInitiate,
  subscriptionCurrent,
} from '@/services/cloudFunctionsService';
```

### Step 2: Call the Function

```typescript
try {
  const response = await chatSend({
    threadId: 'thread-123',
    message: 'Hello!',
    mode: 'assistant',
  });
  
  console.log('Response:', response.response.content);
} catch (error: any) {
  console.error('Error:', error.message);
}
```

### Step 3: Handle Errors

```typescript
catch (error: any) {
  if (error.code === 'auth_required') {
    // Redirect to login
  } else if (error.code === 'quota_exceeded') {
    // Show upgrade prompt
  } else {
    // Show error
  }
}
```

## Migration Path

### Phase 1: Critical Path Functions
1. `paymentInitiate` - Checkout page
2. `paymentVerify` - Payment completion
3. `subscriptionCurrent` - Subscription state
4. `subscriptionUpgrade` - Plan upgrades
5. `subscriptionDowngrade` - Plan downgrades

### Phase 2: Core Features
1. `chatSend` - Main chat (non-streaming)
2. `imagesGenerate` - Image generation
3. `authSendOtp` - Auth OTP flow

### Phase 3: Streaming (Requires New Implementation)
- Streaming chat (requires Cloud Functions streaming support)

## Comparison with Existing Services

| Service | Location | Purpose | Status |
|---------|----------|---------|--------|
| `cloudFunctionsService.ts` | New | Cloud Functions wrapper | ✅ Ready |
| `functionsService.ts` | Existing | Backend API + SSE streaming | Keep for now |
| `chatService.ts` | Existing | Firestore operations | Keep (no changes) |
| `paymentService.ts` | Existing | PayU form generation | Keep (no changes) |
| `authService.ts` | Existing | Firebase Auth helpers | Keep (no changes) |

## Implementation Checklist

### For Each Component Migration

- [ ] Read the relevant example in `INTEGRATION_EXAMPLES.md`
- [ ] Import the Cloud Function
- [ ] Update the component's service call
- [ ] Update error handling
- [ ] Test with Firebase emulator
- [ ] Test with production Cloud Functions
- [ ] Verify Firestore writes (if applicable)
- [ ] Verify UI works end-to-end

## Environment Variables

No new environment variables needed. The Cloud Functions use:
- Firebase project ID (already configured)
- User authentication (automatic via Firebase Auth)

## Troubleshooting

### Function Not Found
- Check Firebase console → Cloud Functions → See if function is deployed
- Verify function name matches exactly (case-sensitive)
- Check region configuration

### Auth Required Error
- User not logged in - redirect to login
- Check browser's Application tab for auth tokens
- Verify Firebase Auth is initialized

### Quota Exceeded Error
- User has hit usage limits
- Show upgrade dialog
- Forward to pricing page

### CORS Issues
- Cloud Functions use CORS by default
- If issues, check Firebase Cloud Functions settings

## Development with Emulator

```bash
# Start emulator
firebase emulators:start

# Test in shell
firebase functions:shell

# Example test
> chatSend({ threadId: 'test', message: 'hi', mode: 'assistant' })
```

## Performance Notes

- Cloud Functions have ~500ms cold start (first invocation after deployment)
- Warm invocations: 100-200ms typical
- No streaming support (use backend SSE for now)
- Automatic retry on transient failures

## Next Steps

1. **Immediate:** Start with payment functions (Checkout.tsx)
2. **This week:** Subscription management (Settings)
3. **Next week:** Chat and images (non-critical path)
4. **Later:** Streaming chat (requires new architecture)

## Support

For questions or issues:
1. Check the relevant documentation file
2. Review the code examples
3. Test with Firebase emulator
4. Check browser console and Cloud Function logs

## Related Files

- `/functions` - Backend Cloud Functions implementation
- `/functions/.env.example` - Environment variables template
- `/functions/ENV_SETUP.md` - Backend setup guide
- `/functions/INTEGRATIONS_SUMMARY.md` - Backend services summary
