# Cloud Functions Integration - Code Examples

Concrete examples showing how to update specific components to use Firebase Cloud Functions.

## Example 1: Checkout.tsx - Payment Integration

### Current Code (Backend API)
```typescript
// Line ~7-12 in Checkout.tsx
import {
  initiatePayment,
  autoSubmitToPayu,
  type BillingAddressInput,
  type BillingCycle,
  type Plan,
} from '@/services/paymentService'

// Line ~150-170 in handleSubmit
const billingAddress: BillingAddressInput = {
  name: fullName.trim(),
  country,
  // ... rest of address
}

try {
  setSubmitting(true)
  const result = await initiatePayment(
    state.plan as Plan,
    state.cycle as BillingCycle,
    state.currency,
    billingAddress,
    state.isUpgrade
  )
  
  if (result.orderId) {
    // Auto-submit to PayU
    autoSubmitToPayu(result)
  }
} catch (error) {
  setFormError(error instanceof Error ? error.message : 'Payment failed')
}
```

### Updated Code (Cloud Functions)
```typescript
// Line ~7-12 in Checkout.tsx
import {
  paymentInitiate,
  type BillingAddressInput,
  type PaymentInitiateRequest,
  type PaymentInitiateResponse,
} from '@/services/cloudFunctionsService'

// Line ~150-170 in handleSubmit
const billingAddress: BillingAddressInput = {
  name: fullName.trim(),
  country,
  // ... rest of address
}

try {
  setSubmitting(true)
  const request: PaymentInitiateRequest = {
    plan: state.plan as string,
    billingCycle: state.cycle as string,
    currency: state.currency,
    billingAddress,
    isUpgrade: state.isUpgrade,
  }
  
  const result = await paymentInitiate(request)
  
  if (result.orderId) {
    // Redirect to PayU URL
    if (result.payuUrl) {
      window.location.href = result.payuUrl
    } else {
      // Create hidden form and submit (PayU integration)
      // This can stay in paymentService for PayU form submission
      autoSubmitToPayu(result)
    }
  }
} catch (error: any) {
  const message = error.message || 'Payment initiation failed'
  setFormError(message)
}
```

## Example 2: useChat Hook - Chat Message Integration

### Current Code (Backend Streaming)
```typescript
// In useChat.ts - sendMessage function
import { streamChatMessage, cancelChatRequest } from '@/services/functionsService'

// Within sendMessage implementation (around line 400+)
const abortController = new AbortController()
try {
  setIsTyping(true)
  
  for await (const event of streamChatMessage(payload, abortController.signal)) {
    if (event.t === 'c') {
      // Chunk event
      aiMessage += event.v
    } else if (event.t === 'd') {
      // Done event
      // Handle final response
    }
  }
} catch (error) {
  // Handle error
} finally {
  setIsTyping(false)
}
```

### Updated Code (Cloud Functions - Non-Streaming)
```typescript
// In useChat.ts - sendMessage function
import { chatSend, type ChatSendRequest } from '@/services/cloudFunctionsService'

// Within sendMessage implementation (around line 400+)
try {
  setIsTyping(true)
  
  // Prepare request
  const chatRequest: ChatSendRequest = {
    threadId: activeThreadId,
    message: text,
    mode: selectedMode,
    language: detectedLanguage,
    attachments: attachmentsList,
    generationConfig: {
      temperature: 0.7,
      maxTokens: 2048,
    },
  }
  
  // Call Cloud Function
  const response = await chatSend(chatRequest)
  
  // Store user message in Firestore
  await addMessage(activeThreadId, {
    role: 'user',
    content: text,
    sender: 'user',
    timestamp: new Date(),
    mode: selectedMode,
    language: detectedLanguage,
  })
  
  // Store AI response in Firestore
  await addMessage(activeThreadId, {
    role: 'assistant',
    content: response.response.content,
    sender: 'ai',
    timestamp: new Date(),
    mode: selectedMode,
    toolCalls: response.response.toolCalls,
    generatedImages: response.response.generatedImages,
  })
  
  // Update UI
  setMessages(prev => [
    ...prev,
    {
      id: `user-${Date.now()}`,
      text,
      sender: 'user',
      timestamp: new Date(),
      mode: selectedMode,
    },
    {
      id: `ai-${Date.now()}`,
      text: response.response.content,
      sender: 'ai',
      timestamp: new Date(),
      mode: selectedMode,
      audioUrl: null,
      imageUrl: null,
    },
  ])
  
} catch (error: any) {
  const errorMessage = error.message || 'Failed to send message'
  setFormError(errorMessage)
} finally {
  setIsTyping(false)
}
```

## Example 3: Settings Component - Subscription Integration

### Current Code (Backend)
```typescript
// In Settings/PlanBillingTab or similar
import { getCurrentSubscription, upgradePlan } from '@/services/subscriptionService'

useEffect(() => {
  async function loadSubscription() {
    try {
      const sub = await getCurrentSubscription()
      setCurrentPlan(sub.plan)
      setNextRenewal(sub.nextRenewalAt)
    } catch (error) {
      console.error('Failed to load subscription')
    }
  }
  
  loadSubscription()
}, [])

const handleUpgrade = async (newPlan: string) => {
  try {
    const result = await upgradePlan(newPlan)
    setCurrentPlan(result.plan)
  } catch (error) {
    setError('Upgrade failed')
  }
}
```

### Updated Code (Cloud Functions)
```typescript
// In Settings/PlanBillingTab or similar
import {
  subscriptionCurrent,
  subscriptionUpgrade,
  subscriptionDowngrade,
  type SubscriptionUpgradeRequest,
  type SubscriptionDowngradeRequest,
} from '@/services/cloudFunctionsService'

useEffect(() => {
  async function loadSubscription() {
    try {
      const sub = await subscriptionCurrent()
      setCurrentPlan(sub.plan)
      setCurrentState(sub.state)
      setNextRenewal(sub.nextRenewalAt)
      setForwardCredit(sub.forwardCreditUsd)
      setCancelAtPeriodEnd(sub.cancelAtPeriodEnd)
    } catch (error: any) {
      console.error('Failed to load subscription:', error.message)
    }
  }
  
  loadSubscription()
}, [])

const handleUpgrade = async (newPlan: string) => {
  try {
    const request: SubscriptionUpgradeRequest = {
      newPlan,
      clientRequestId: `upgrade-${Date.now()}`,
    }
    
    const result = await subscriptionUpgrade(request)
    
    // Reload subscription state
    const updated = await subscriptionCurrent()
    setCurrentPlan(updated.plan)
    setCurrentState(updated.state)
    
    // Show success message with credit applied
    console.log(`Upgrade successful! ${result.creditApplied}$ credit applied.`)
    
  } catch (error: any) {
    setError(error.message || 'Upgrade failed')
  }
}

const handleDowngrade = async () => {
  try {
    const request: SubscriptionDowngradeRequest = {
      clientRequestId: `downgrade-${Date.now()}`,
    }
    
    const result = await subscriptionDowngrade(request)
    
    // Reload subscription state
    const updated = await subscriptionCurrent()
    setCurrentState(updated.state)
    
    console.log('Downgrade scheduled for next billing period')
    
  } catch (error: any) {
    setError(error.message || 'Downgrade failed')
  }
}
```

## Example 4: Image Generation Component

### Current Code (Backend)
```typescript
// In ImageActions.tsx or similar
import { generateImage } from '@/services/functionsService'

const handleGenerateImage = async (prompt: string) => {
  try {
    setImageGenerating(true)
    const result = await generateImage(prompt)
    setGeneratedImageUrl(result.imageUrl)
  } catch (error) {
    setImageError('Image generation failed')
  } finally {
    setImageGenerating(false)
  }
}
```

### Updated Code (Cloud Functions)
```typescript
// In ImageActions.tsx or similar
import { imagesGenerate, type ImagesGenerateRequest } from '@/services/cloudFunctionsService'

const handleGenerateImage = async (prompt: string, style?: string) => {
  try {
    setImageGenerating(true)
    
    const request: ImagesGenerateRequest = {
      prompt,
      style: style || 'realistic',
      size: '1024x1024',
      quantity: 1,
    }
    
    const result = await imagesGenerate(request)
    
    if (result.generatedUrls.length > 0) {
      setGeneratedImageUrl(result.generatedUrls[0].url)
      setRevisedPrompt(result.generatedUrls[0].revisedPrompt)
    } else {
      setImageError('No images generated')
    }
  } catch (error: any) {
    setImageError(error.message || 'Image generation failed')
  } finally {
    setImageGenerating(false)
  }
}
```

## Example 5: Auth Flow - OTP Integration

### Current Code (Backend)
```typescript
// In Login.tsx or authService.ts
import { sendOtpViaBackend } from '@/services/authService'

const handleSendOtp = async (email: string) => {
  try {
    const response = await sendOtpViaBackend(email)
    setOtpSent(true)
    setMessage('OTP sent to your email')
  } catch (error) {
    setError('Failed to send OTP')
  }
}
```

### Updated Code (Cloud Functions)
```typescript
// In Login.tsx or authService.ts
import { authSendOtp, type AuthSendOtpResponse } from '@/services/cloudFunctionsService'

const handleSendOtp = async (email: string) => {
  try {
    const response: AuthSendOtpResponse = await authSendOtp(email)
    
    if (response.success) {
      setOtpSent(true)
      setMessage(response.message || 'OTP sent to your email')
    } else {
      setError(response.message || 'Failed to send OTP')
    }
  } catch (error: any) {
    setError(error.message || 'Failed to send OTP')
  }
}
```

## Migration Strategy

### Step 1: Add New Service
- ✅ Create `cloudFunctionsService.ts` with all Cloud Function wrappers

### Step 2: Update Components (In Order of Priority)
1. **Checkout.tsx** - Payment critical path
2. **Settings/Subscription** - Subscription management
3. **useChat.ts** - Main chat functionality
4. **Image components** - Image generation
5. **Auth flows** - OTP and authentication

### Step 3: Testing
- Test each function with emulator
- Verify Firestore writes
- Check error handling
- Validate auth flows

### Step 4: Deployment
- Deploy functions first (backend)
- Deploy frontend changes (can reference non-existent functions temporarily)
- Monitor logs during rollout

## Gradual Migration Tips

**Running both backends simultaneously:**

```typescript
// hybrid approach - use env flag to switch
const useCloudfunctions = import.meta.env.VITE_USE_CLOUD_FUNCTIONS === 'true'

if (useCloudFunctions) {
  // Use Cloud Functions
  const result = await chatSend(request)
} else {
  // Use legacy backend
  const result = await chatViaBackend(payload)
}
```

**Feature flag for safe rollout:**

```typescript
if (featureFlags.useCloudFunctionsChat) {
  // Route traffic to Cloud Functions
} else {
  // Use existing backend
}
```

## Rollback Plan

If issues occur:

1. Set `VITE_USE_CLOUD_FUNCTIONS=false` in frontend env
2. Revert to backend API calls
3. Check Cloud Function logs
4. Fix and redeploy

No data loss occurs since Firestore writes are identical.
