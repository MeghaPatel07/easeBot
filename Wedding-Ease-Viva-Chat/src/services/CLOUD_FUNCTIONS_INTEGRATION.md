# Firebase Cloud Functions Integration Guide

This document shows how to replace existing API calls with Firebase Cloud Functions in the Viva Chat frontend.

## Overview

All external service integrations are now available as Firebase Cloud Functions:

| Function | Purpose | Location |
|----------|---------|----------|
| `authSendOtp` | Send OTP via email | Auth flow |
| `chatSend` | Send chat message and get AI response | Chat messages |
| `imagesGenerate` | Generate images via DALL-E 3 | Image generation |
| `paymentInitiate` | Initiate payment via PayU | Checkout |
| `paymentVerify` | Verify payment status | Payment verification |
| `subscriptionCurrent` | Get current subscription state | Dashboard/Settings |
| `subscriptionUpgrade` | Upgrade subscription plan | Plan selection |
| `subscriptionDowngrade` | Schedule subscription downgrade | Plan management |

## Import Statement

```typescript
import {
  authSendOtp,
  chatSend,
  imagesGenerate,
  paymentInitiate,
  paymentVerify,
  subscriptionCurrent,
  subscriptionUpgrade,
  subscriptionDowngrade,
  // Types
  type ChatSendRequest,
  type ChatSendResponse,
  type ImagesGenerateRequest,
  type ImagesGenerateResponse,
  type PaymentInitiateRequest,
  type PaymentInitiateResponse,
  type SubscriptionCurrentResponse,
  type SubscriptionUpgradeRequest,
  type SubscriptionUpgradeResponse,
  type SubscriptionDowngradeRequest,
  type SubscriptionDowngradeResponse,
} from '@/services/cloudFunctionsService';
```

## Usage Examples

### 1. Authentication - Send OTP

**Current:** (if using backend)
```typescript
// Old backend call
const response = await fetch('/api/auth/send-otp', {
  method: 'POST',
  body: JSON.stringify({ email })
});
```

**New:** Cloud Functions
```typescript
import { authSendOtp } from '@/services/cloudFunctionsService';

try {
  const response = await authSendOtp('user@example.com');
  console.log('OTP sent:', response.message);
} catch (error) {
  console.error('Failed to send OTP:', error);
}
```

### 2. Chat - Send Message

**Current:** (uses `streamChatMessage` from `functionsService.ts`)
```typescript
import { streamChatMessage } from '@/services/functionsService';

for await (const event of streamChatMessage(payload)) {
  // Handle streaming events
}
```

**New:** Cloud Functions (non-streaming, simpler)
```typescript
import { chatSend, type ChatSendRequest } from '@/services/cloudFunctionsService';

const request: ChatSendRequest = {
  threadId: 'thread-123',
  message: 'How should I decorate my wedding?',
  mode: 'assistant',
  language: 'en',
  attachments: [],
};

try {
  const response = await chatSend(request);
  console.log('AI Response:', response.response.content);
  console.log('Tokens used:', response.tokensUsed);
} catch (error) {
  console.error('Chat failed:', error);
}
```

### 3. Image Generation

**Current:** (if using backend)
```typescript
const response = await generateImage('Create a wedding decoration in modern style');
```

**New:** Cloud Functions
```typescript
import { imagesGenerate, type ImagesGenerateRequest } from '@/services/cloudFunctionsService';

const request: ImagesGenerateRequest = {
  prompt: 'Create a wedding decoration in modern style',
  style: 'realistic',
  size: '1024x1024',
  quantity: 1,
};

try {
  const response = await imagesGenerate(request);
  console.log('Generated URLs:', response.generatedUrls);
  response.generatedUrls.forEach(img => {
    console.log('Image:', img.url);
    console.log('Revised prompt:', img.revisedPrompt);
  });
} catch (error) {
  console.error('Image generation failed:', error);
}
```

### 4. Payment - Initiate

**Current:** (using `paymentService.ts`)
```typescript
import { initiatePayment } from '@/services/paymentService';

const result = await initiatePayment(plan, billingCycle, currency, billingAddress, isUpgrade);
```

**New:** Cloud Functions
```typescript
import { paymentInitiate, type PaymentInitiateRequest, type BillingAddressInput } from '@/services/cloudFunctionsService';

const billingAddress: BillingAddressInput = {
  name: 'John Doe',
  email: 'john@example.com',
  phone: '+91-9999999999',
  country: 'IN',
  state: 'Maharashtra',
  city: 'Mumbai',
  line1: '123 Main Street',
  postalCode: '400001',
  gstin: '27AABCR1234H1Z0',
};

const request: PaymentInitiateRequest = {
  plan: 'pro_monthly',
  billingCycle: 'monthly',
  currency: 'INR',
  billingAddress,
  isUpgrade: false,
};

try {
  const response = await paymentInitiate(request);
  console.log('Order ID:', response.orderId);
  console.log('Amount:', response.amount, response.currency);
  // Redirect to PayU
  if (response.payuUrl) {
    window.location.href = response.payuUrl;
  }
} catch (error) {
  console.error('Payment initiation failed:', error);
}
```

### 5. Payment - Verify

```typescript
import { paymentVerify } from '@/services/cloudFunctionsService';

try {
  const verified = await paymentVerify({
    orderId: 'order-123',
    payuTransactionId: 'payu-txn-456',
  });
  
  if (verified.verified) {
    console.log('Payment verified:', verified.status);
  }
} catch (error) {
  console.error('Verification failed:', error);
}
```

### 6. Subscription - Get Current

**Current:** (if using backend)
```typescript
const sub = await getCurrentSubscription();
```

**New:** Cloud Functions
```typescript
import { subscriptionCurrent } from '@/services/cloudFunctionsService';

try {
  const subscription = await subscriptionCurrent();
  console.log('Current state:', subscription.state);
  console.log('Plan:', subscription.plan);
  console.log('Billing cycle:', subscription.billingCycle);
  console.log('Renewal:', subscription.nextRenewalAt);
  console.log('Forward credit:', subscription.forwardCreditUsd);
} catch (error) {
  console.error('Failed to fetch subscription:', error);
}
```

### 7. Subscription - Upgrade

```typescript
import { subscriptionUpgrade, type SubscriptionUpgradeRequest } from '@/services/cloudFunctionsService';

const request: SubscriptionUpgradeRequest = {
  newPlan: 'promax_monthly',
  billingCycle: 'monthly',
  clientRequestId: `upgrade-${Date.now()}`,
};

try {
  const response = await subscriptionUpgrade(request);
  console.log('Upgrade state:', response.state);
  console.log('Credit applied:', response.creditApplied);
  console.log('Message:', response.message);
  
  // If orderId present, redirect to payment
  if (response.orderId) {
    // Initiate payment for the upgrade
  }
} catch (error) {
  console.error('Upgrade failed:', error);
}
```

### 8. Subscription - Downgrade

```typescript
import { subscriptionDowngrade, type SubscriptionDowngradeRequest } from '@/services/cloudFunctionsService';

const request: SubscriptionDowngradeRequest = {
  clientRequestId: `downgrade-${Date.now()}`,
};

try {
  const response = await subscriptionDowngrade(request);
  console.log('Downgrade applied:', response.applied);
  console.log('New state:', response.state);
} catch (error) {
  console.error('Downgrade failed:', error);
}
```

## Integration Checklist

### For Chat Component (`Index.tsx`)

- [ ] Import `chatSend` from `cloudFunctionsService`
- [ ] In `useChat` hook, create new function to call `chatSend` before/after streaming
- [ ] Store generated responses in Firestore via `addMessage`
- [ ] Handle error responses (auth required, quota exceeded, etc.)

**Example update to useChat:**

```typescript
// Old: using streamChatMessage from functionsService
// for await (const event of streamChatMessage(payload)) { ... }

// New: using Cloud Functions for non-streaming
const response = await chatSend({
  threadId: activeThreadId,
  message: text,
  mode: selectedMode,
  language: detectedLanguage,
  attachments: attachmentsList,
});

// Store in Firestore
await addMessage(activeThreadId, {
  role: 'assistant',
  content: response.response.content,
  sender: 'ai',
  timestamp: new Date(),
});
```

### For Checkout Page (`Checkout.tsx`)

- [ ] Import `paymentInitiate` from `cloudFunctionsService`
- [ ] Replace call to `initiatePayment` from `paymentService`
- [ ] Update error handling to match Cloud Function error format

```typescript
// Old
const result = await initiatePayment(plan, cycle, currency, billingAddress);

// New
import { paymentInitiate } from '@/services/cloudFunctionsService';

const result = await paymentInitiate({
  plan,
  billingCycle: cycle,
  currency,
  billingAddress,
  isUpgrade: false,
});
```

### For Settings/Subscription Components

- [ ] Import subscription functions from `cloudFunctionsService`
- [ ] Update `subscriptionCurrent()` calls
- [ ] Update upgrade/downgrade handlers

### For Image Generation

- [ ] Import `imagesGenerate` from `cloudFunctionsService`
- [ ] Replace backend call with Cloud Function
- [ ] Handle success/error responses

## Error Handling

All Cloud Functions throw errors with the following structure:

```typescript
try {
  const response = await chatSend(request);
} catch (error: any) {
  // error.code: error code (e.g., 'auth_required', 'quota_exceeded')
  // error.message: human-readable message
  // error.details: additional context (may vary by function)
  
  if (error.code === 'auth_required') {
    // Redirect to login
  } else if (error.code === 'quota_exceeded') {
    // Show upgrade prompt
  } else {
    // Show generic error
  }
}
```

## Environment Configuration

Ensure these are set in `.env.local`:

```env
# Firebase config (already set up)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...

# Cloud Functions will use the project from Firebase config
# No additional configuration needed for frontend
```

## Comparison: Backend API vs Cloud Functions

| Aspect | Backend API | Cloud Functions |
|--------|------------|-----------------|
| Auth | Bearer token in headers | Firebase Auth (automatic) |
| Error handling | HTTP status codes | JavaScript Errors |
| Latency | Higher (cold starts) | Lower (warm) |
| Streaming | Yes (SSE) | No (request/response) |
| Quota enforcement | At backend | At Cloud Function |
| Scaling | Manual management | Automatic |
| Costs | Higher (always running) | Lower (pay per invocation) |

## Migration Priority

1. **Phase 1 (Immediate):**
   - [ ] Payment functions (paymentInitiate, paymentVerify)
   - [ ] Subscription functions (subscriptionCurrent, subscriptionUpgrade, subscriptionDowngrade)
   - [ ] Authentication (authSendOtp)

2. **Phase 2 (Next):**
   - [ ] Image generation (imagesGenerate)
   - [ ] Non-streaming chat (chatSend)

3. **Phase 3 (Future):**
   - [ ] Streaming chat (requires Cloud Functions streaming support)
   - [ ] Transcription
   - [ ] Text-to-Speech

## Testing

Each Cloud Function can be tested via Firebase emulator:

```bash
# Start emulator
firebase emulators:start

# In another terminal
firebase functions:shell

# Call function
> chatSend({ threadId: 'test', message: 'Hello', mode: 'assistant' })
```

## Support

For issues or questions:
1. Check Firebase console logs
2. Verify authentication is working
3. Check environment variables are correct
4. Review error messages in browser console
