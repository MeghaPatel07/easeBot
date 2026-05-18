# Cloud Functions - Quick Reference Card

Use this as a cheat sheet when integrating Cloud Functions into components.

## Import Template

```typescript
import {
  chatSend,
  authSendOtp,
  imagesGenerate,
  paymentInitiate,
  paymentVerify,
  subscriptionCurrent,
  subscriptionUpgrade,
  subscriptionDowngrade,
  // Types
  type ChatSendRequest,
  type ChatSendResponse,
  type PaymentInitiateRequest,
  type ImagesGenerateRequest,
} from '@/services/cloudFunctionsService';
```

## Function Signatures

### Auth
```typescript
authSendOtp(email: string): Promise<{ success: boolean; message: string }>
```

### Chat
```typescript
chatSend(request: {
  threadId?: string;
  message: string;
  mode: string;
  language?: string;
  attachments?: any[];
  generationConfig?: Record<string, any>;
}): Promise<{
  success: boolean;
  threadId: string;
  response: { role: string; content: string; toolCalls?: any[]; generatedImages?: any[] };
  tokensUsed?: number;
}>
```

### Images
```typescript
imagesGenerate(request: {
  prompt: string;
  style?: string;
  size?: string;
  quantity?: number;
  referenceImage?: string;
}): Promise<{
  generationId: string;
  status: 'completed' | 'failed';
  prompt: string;
  style?: string;
  size?: string;
  quantity: number;
  generatedUrls: Array<{ url: string; revisedPrompt?: string; createdAt: any }>;
}>
```

### Payment
```typescript
paymentInitiate(request: {
  plan: string;
  billingCycle: string;
  currency: string;
  billingAddress: {
    name: string;
    email?: string;
    phone?: string;
    country: string;
    state?: string;
    city: string;
    line1: string;
    line2?: string;
    postalCode: string;
    gstin?: string;
  };
  isUpgrade?: boolean;
}): Promise<{
  orderId: string;
  status: string;
  amount: number;
  currency: string;
  payuUrl?: string;
  failureReason?: string;
}>

paymentVerify(request: {
  orderId: string;
  payuTransactionId: string;
}): Promise<{
  verified: boolean;
  status: string;
  message: string;
}>
```

### Subscription
```typescript
subscriptionCurrent(): Promise<{
  state: string;
  plan?: string;
  billingCycle?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  nextRenewalAt?: string;
  cancelAtPeriodEnd?: boolean;
  downgradeToOnPeriodEnd?: string;
  forwardCreditUsd?: number;
  status: string;
}>

subscriptionUpgrade(request: {
  newPlan: string;
  billingCycle?: string;
  clientRequestId: string;
}): Promise<{
  state: string;
  creditApplied: number;
  invoiceId?: string;
  orderId?: string;
  message: string;
}>

subscriptionDowngrade(request: {
  clientRequestId: string;
}): Promise<{
  state: string;
  applied: boolean;
}>
```

## Common Patterns

### Pattern 1: Simple Try-Catch
```typescript
try {
  const response = await functionName(request);
  // Success
} catch (error: any) {
  console.error('Error:', error.message);
}
```

### Pattern 2: Error Handling
```typescript
try {
  const result = await chatSend(request);
} catch (error: any) {
  switch (error.code) {
    case 'auth_required':
      redirectToLogin();
      break;
    case 'quota_exceeded':
      showUpgradeDialog();
      break;
    case 'internal':
    case 'unavailable':
      retryWithBackoff();
      break;
    default:
      showError(error.message);
  }
}
```

### Pattern 3: Async State Management
```typescript
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const handleAction = async () => {
  try {
    setLoading(true);
    setError(null);
    const result = await functionName(request);
    // Update state with result
  } catch (err: any) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
```

### Pattern 4: Request ID (Idempotency)
```typescript
const request = {
  newPlan: 'promax_monthly',
  clientRequestId: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
};

const result = await subscriptionUpgrade(request);
```

### Pattern 5: Firestore Storage (After Success)
```typescript
const response = await chatSend(request);

// Store in Firestore
await addMessage(threadId, {
  role: 'assistant',
  content: response.response.content,
  timestamp: new Date(),
  mode: response.response.mode,
});
```

## Common Errors & Solutions

| Error | Cause | Fix |
|-------|-------|-----|
| `auth_required` | Not logged in | Check `user` context, redirect to login |
| `quota_exceeded` | Too many API calls | Show upgrade dialog, rate limit client |
| `permission_denied` | Invalid subscription state | Check `subscriptionCurrent()` first |
| `invalid_argument` | Bad input data | Validate inputs before calling |
| `not_found` | Invalid ID (order, thread, etc) | Check ID exists in DB |
| `internal` | Server error | Retry with exponential backoff |
| `unavailable` | Service down | Retry, show offline message |

## By Component

### Checkout.tsx
```typescript
import { paymentInitiate } from '@/services/cloudFunctionsService';

const result = await paymentInitiate({
  plan: state.plan as string,
  billingCycle: state.cycle as string,
  currency: state.currency,
  billingAddress,
  isUpgrade: state.isUpgrade,
});
```

### useChat.ts
```typescript
import { chatSend } from '@/services/cloudFunctionsService';

const response = await chatSend({
  threadId: activeThreadId,
  message: text,
  mode: selectedMode,
  language: detectedLanguage,
  attachments: attachmentsList,
});

await addMessage(activeThreadId, {
  role: 'assistant',
  content: response.response.content,
  sender: 'ai',
  timestamp: new Date(),
});
```

### Settings/PlanBillingTab
```typescript
import { subscriptionCurrent, subscriptionUpgrade } from '@/services/cloudFunctionsService';

const sub = await subscriptionCurrent();
console.log('Current plan:', sub.plan);

const upgrade = await subscriptionUpgrade({
  newPlan: 'promax_monthly',
  clientRequestId: `upgrade-${Date.now()}`,
});
```

### Image Components
```typescript
import { imagesGenerate } from '@/services/cloudFunctionsService';

const result = await imagesGenerate({
  prompt,
  style: 'realistic',
  size: '1024x1024',
  quantity: 1,
});
```

### Auth Flow
```typescript
import { authSendOtp } from '@/services/cloudFunctionsService';

const response = await authSendOtp(email);
if (response.success) {
  console.log('OTP sent');
}
```

## Type Imports

```typescript
import type {
  AuthSendOtpResponse,
  ChatSendRequest,
  ChatSendResponse,
  ChatResponse,
  ImagesGenerateRequest,
  ImagesGenerateResponse,
  GeneratedImage,
  BillingAddressInput,
  PaymentInitiateRequest,
  PaymentInitiateResponse,
  PaymentVerifyRequest,
  PaymentVerifyResponse,
  SubscriptionCurrentResponse,
  SubscriptionUpgradeRequest,
  SubscriptionUpgradeResponse,
  SubscriptionDowngradeRequest,
  SubscriptionDowngradeResponse,
} from '@/services/cloudFunctionsService';
```

## Testing Checklist

- [ ] Function is imported correctly
- [ ] Request parameters are typed correctly
- [ ] Response is handled properly
- [ ] Errors are caught and handled
- [ ] Loading state is managed (if UI)
- [ ] Firestore writes are called (if needed)
- [ ] UI updates after success
- [ ] Error message shown on failure
- [ ] User auth is verified (logged in)

## Documentation Links

- **Full Integration Guide:** `CLOUD_FUNCTIONS_INTEGRATION.md`
- **API Reference:** `CLOUD_FUNCTIONS_API_REFERENCE.md`
- **Code Examples:** `INTEGRATION_EXAMPLES.md`
- **Main Service:** `cloudFunctionsService.ts`

## Backend Implementation

The actual functions are implemented in:
```
/Users/krish/Desktop/weddingease/wedding-ease-admin/functions/theweddingbot/v1/
```

Function files:
- `auth/sendOtp.js`
- `chat/send.js`
- `images/generate.js`
- `payment/initiate.js`
- `payment/verify.js`
- `subscription/current.js`
- `subscription/upgrade.js`
- `subscription/downgrade.js`

Services used:
- `emailService.js` - SendGrid/SMTP
- `azureOpenAIService.js` - Chat & images
- `exchangeRateService.js` - Currency conversion
- `subscriptionStateMachine.js` - State transitions
- `invoiceService.js` - Invoice generation

## One-Liners

```typescript
// Send OTP
await authSendOtp('user@example.com');

// Chat
const chat = await chatSend({ threadId: 'x', message: 'hi', mode: 'assistant' });

// Images
const imgs = await imagesGenerate({ prompt: 'wedding cake' });

// Payment
const payment = await paymentInitiate({ plan: 'pro_monthly', billingCycle: 'monthly', currency: 'USD', billingAddress: {...} });

// Subscription
const sub = await subscriptionCurrent();

// Upgrade
const upgrade = await subscriptionUpgrade({ newPlan: 'promax_monthly', clientRequestId: `x-${Date.now()}` });

// Downgrade
const downgrade = await subscriptionDowngrade({ clientRequestId: `x-${Date.now()}` });
```

---

**Last Updated:** 2026-05-18  
**Version:** 1.0  
**Status:** Ready for Integration
