import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

// ──────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION
// ──────────────────────────────────────────────────────────────────────────────

export interface AuthSendOtpRequest {
  email: string;
}

export interface AuthSendOtpResponse {
  success: boolean;
  message: string;
}

export async function authSendOtp(email: string): Promise<AuthSendOtpResponse> {
  try {
    const sendOtp = httpsCallable<AuthSendOtpRequest, AuthSendOtpResponse>(
      functions,
      'v1-authSendOtp'
    );
    const result = await sendOtp({ email });
    return result.data;
  } catch (error: any) {
    console.error('[authSendOtp] Cloud Function error:', error.message);
    throw error;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// CHAT
// ──────────────────────────────────────────────────────────────────────────────

export interface ChatSendRequest {
  threadId?: string | null;
  message: string;
  mode?: string;
  language?: string;
  audioBase64?: string;
  imageBase64?: string;
  imageMimeType?: string;
  userPersonalization?: any;
  attachments?: any[];
  forceImageGeneration?: boolean;
  skipImageGeneration?: boolean;
  preferredAspectRatio?: string;
  vibeTitle?: string;
  vibeDescriptors?: string[];
  styleMemory?: any;
  requestId: string;
  clientRequestId?: string;
}

export interface ChatStreamUpdate {
  t: 'c' | 'img' | 'p' | 'd' | 'e' | 'tool_error' | 'tool_result';
  v?: string;
  text?: string;
  status?: string;
  data?: string;
  products?: any[];
  hasMore?: boolean;
  imageUrl?: string;
  imageUrls?: string[];
  audioUrl?: string | null;
  mode?: string;
  detectedLanguage?: string;
  responseLanguage?: string;
  toolActions?: any[];
  calendarEvent?: any;
  styleMemory?: any;
  msg?: string;
  tool?: string;
  ok?: boolean;
  errorCode?: string;
  userFacing?: string;
  message?: string;
}

export interface ChatInitResponse {
  requestId: string;
  threadId: string;
  status: 'initiated' | 'processing' | 'completed' | 'failed';
}

export interface ChatStatusResponse {
  requestId: string;
  status: 'processing' | 'completed' | 'failed' | 'cancelled';
  updates: ChatStreamUpdate[];
  isDone: boolean;
  finalText?: string;
  finalImages?: string[];
}

export interface ChatCancelRequest {
  requestId: string;
}

export interface ChatCancelResponse {
  requestId: string;
  cancelled: boolean;
  message: string;
}

export async function chatSendInit(request: ChatSendRequest): Promise<ChatInitResponse> {
  try {
    const fn = httpsCallable<ChatSendRequest, ChatInitResponse>(functions, 'v1-chatSendInit');
    const result = await fn(request);
    return result.data;
  } catch (error: any) {
    console.error('[chatSendInit] Cloud Function error:', error.message);
    throw error;
  }
}

export async function chatGetStatus(requestId: string): Promise<ChatStatusResponse> {
  try {
    const fn = httpsCallable<{ requestId: string }, ChatStatusResponse>(
      functions,
      'v1-chatGetStatus'
    );
    const result = await fn({ requestId });
    return result.data;
  } catch (error: any) {
    console.error('[chatGetStatus] Cloud Function error:', error.message);
    throw error;
  }
}

export async function chatCancel(requestId: string): Promise<ChatCancelResponse> {
  try {
    const fn = httpsCallable<ChatCancelRequest, ChatCancelResponse>(
      functions,
      'v1-chatCancel'
    );
    const result = await fn({ requestId });
    return result.data;
  } catch (error: any) {
    console.error('[chatCancel] Cloud Function error:', error.message);
    throw error;
  }
}

// Polling-based streaming replacement for SSE
export async function* streamChatViaCloudFunctions(
  request: ChatSendRequest,
  signal?: AbortSignal,
  pollIntervalMs: number = 500
): AsyncGenerator<ChatStreamUpdate> {
  // Step 1: Initiate the chat request
  const initResponse = await chatSendInit(request);
  const requestId = initResponse.requestId;

  // Yield initial status
  yield { t: 'c', v: '' };

  // Step 2: Poll for updates until completion
  let lastUpdateIndex = 0;
  const maxAttempts = 120; // 1 minute timeout with 500ms interval
  let attempts = 0;

  try {
    while (attempts < maxAttempts) {
      if (signal?.aborted) {
        // User cancelled - notify server
        await chatCancel(requestId).catch(e => console.warn('Cancel request failed:', e));
        yield { t: 'e', msg: 'Request was cancelled by user' };
        return;
      }

      attempts++;

      // Poll for status
      const statusResponse = await chatGetStatus(requestId);

      // Yield any new updates
      for (let i = lastUpdateIndex; i < statusResponse.updates.length; i++) {
        const update = statusResponse.updates[i];
        yield update;
      }
      lastUpdateIndex = statusResponse.updates.length;

      // Check if done
      if (statusResponse.isDone) {
        // Yield final done event
        if (statusResponse.status === 'completed') {
          yield {
            t: 'd',
            text: statusResponse.finalText || '',
            mode: 'assistant',
            detectedLanguage: 'en',
            responseLanguage: 'en',
            audioUrl: null,
            imageUrl: statusResponse.finalImages?.[0] || null,
            imageUrls: statusResponse.finalImages,
            toolActions: [],
            calendarEvent: null,
          };
        } else if (statusResponse.status === 'failed') {
          yield { t: 'e', msg: 'Chat generation failed' };
        } else if (statusResponse.status === 'cancelled') {
          yield { t: 'e', msg: 'Chat generation was cancelled' };
        }
        return;
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    // Timeout
    yield { t: 'e', msg: 'Chat request timed out' };
  } catch (error: any) {
    console.error('[streamChatViaCloudFunctions] Error:', error);
    yield { t: 'e', msg: error?.message || 'An error occurred' };
  }
}

export interface ChatSendResponse {
  success: boolean;
  threadId: string;
  response: ChatResponse;
  tokensUsed?: number;
}

export async function chatSend(request: ChatSendRequest): Promise<ChatSendResponse> {
  try {
    const send = httpsCallable<ChatSendRequest, ChatSendResponse>(
      functions,
      'v1-chatSend'
    );
    const result = await send(request);
    return result.data;
  } catch (error: any) {
    console.error('[chatSend] Cloud Function error:', error.message);
    throw error;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// IMAGES
// ──────────────────────────────────────────────────────────────────────────────

export interface ImagesGenerateRequest {
  prompt: string;
  style?: string;
  size?: string;
  quantity?: number;
  referenceImage?: string;
}

export interface GeneratedImage {
  url: string;
  revisedPrompt?: string;
  createdAt: any;
}

export interface ImagesGenerateResponse {
  generationId: string;
  status: 'completed' | 'failed';
  prompt: string;
  style?: string;
  size?: string;
  quantity: number;
  generatedUrls: GeneratedImage[];
}

export async function imagesGenerate(request: ImagesGenerateRequest): Promise<ImagesGenerateResponse> {
  try {
    const generate = httpsCallable<ImagesGenerateRequest, ImagesGenerateResponse>(
      functions,
      'v1-imagesGenerate'
    );
    const result = await generate(request);
    return result.data;
  } catch (error: any) {
    console.error('[imagesGenerate] Cloud Function error:', error.message);
    throw error;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// PAYMENT
// ──────────────────────────────────────────────────────────────────────────────

export interface BillingAddressInput {
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
}

export interface PaymentInitiateRequest {
  plan: string;
  billingCycle: string;
  currency: string;
  billingAddress: BillingAddressInput;
  isUpgrade?: boolean;
}

export interface PaymentInitiateResponse {
  orderId: string;
  status: string;
  amount: number;
  currency: string;
  payuUrl?: string;
  failureReason?: string;
}

export async function paymentInitiate(request: PaymentInitiateRequest): Promise<PaymentInitiateResponse> {
  try {
    const initiate = httpsCallable<PaymentInitiateRequest, PaymentInitiateResponse>(
      functions,
      'v1-paymentInitiate'
    );
    const result = await initiate(request);
    return result.data;
  } catch (error: any) {
    console.error('[paymentInitiate] Cloud Function error:', error.message);
    throw error;
  }
}

export interface PaymentVerifyRequest {
  orderId: string;
  payuTransactionId: string;
}

export interface PaymentVerifyResponse {
  verified: boolean;
  status: string;
  message: string;
}

export async function paymentVerify(request: PaymentVerifyRequest): Promise<PaymentVerifyResponse> {
  try {
    const verify = httpsCallable<PaymentVerifyRequest, PaymentVerifyResponse>(
      functions,
      'v1-paymentVerify'
    );
    const result = await verify(request);
    return result.data;
  } catch (error: any) {
    console.error('[paymentVerify] Cloud Function error:', error.message);
    throw error;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION
// ──────────────────────────────────────────────────────────────────────────────

export interface SubscriptionCurrentResponse {
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
}

export async function subscriptionCurrent(): Promise<SubscriptionCurrentResponse> {
  try {
    const current = httpsCallable<void, SubscriptionCurrentResponse>(
      functions,
      'v1-subscriptionCurrent'
    );
    const result = await current();
    return result.data;
  } catch (error: any) {
    console.error('[subscriptionCurrent] Cloud Function error:', error.message);
    throw error;
  }
}

export interface SubscriptionUpgradeRequest {
  newPlan: string;
  billingCycle?: string;
  clientRequestId: string;
}

export interface SubscriptionUpgradeResponse {
  state: string;
  creditApplied: number;
  invoiceId?: string;
  orderId?: string;
  message: string;
}

export async function subscriptionUpgrade(request: SubscriptionUpgradeRequest): Promise<SubscriptionUpgradeResponse> {
  try {
    const upgrade = httpsCallable<SubscriptionUpgradeRequest, SubscriptionUpgradeResponse>(
      functions,
      'v1-subscriptionUpgrade'
    );
    const result = await upgrade(request);
    return result.data;
  } catch (error: any) {
    console.error('[subscriptionUpgrade] Cloud Function error:', error.message);
    throw error;
  }
}

export interface SubscriptionDowngradeRequest {
  clientRequestId: string;
}

export interface SubscriptionDowngradeResponse {
  state: string;
  applied: boolean;
}

export async function subscriptionDowngrade(request: SubscriptionDowngradeRequest): Promise<SubscriptionDowngradeResponse> {
  try {
    const downgrade = httpsCallable<SubscriptionDowngradeRequest, SubscriptionDowngradeResponse>(
      functions,
      'v1-subscriptionDowngrade'
    );
    const result = await downgrade(request);
    return result.data;
  } catch (error: any) {
    console.error('[subscriptionDowngrade] Cloud Function error:', error.message);
    throw error;
  }
}
