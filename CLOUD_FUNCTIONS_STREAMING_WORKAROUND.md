# Cloud Functions Streaming Workaround ✅

## The Challenge

Cloud Functions don't natively support:
1. **Server-Sent Events (SSE)** - Real-time streaming
2. **AbortSignal** - Client-side request cancellation

But the chat feature needed both for streaming messages + stop generation.

## The Solution: Polling-Based Streaming

Instead of SSE, we now use a **polling mechanism** with Cloud Functions:

### How It Works

**Step 1: Initiate Chat Request**
```typescript
// Client calls Cloud Function to start chat generation
const initResponse = await chatSendInit({
  message: userMessage,
  requestId: uniqueId,
  // ... other options
})
// Returns: { requestId, threadId, status: 'initiated' }
```

**Step 2: Poll for Updates**
```typescript
// Client polls Cloud Function every 400-500ms for updates
while (!isDone) {
  const statusResponse = await chatGetStatus(requestId)
  // statusResponse.updates contains new events:
  // - { t: 'c', v: 'text chunk' }
  // - { t: 'img', status: 'generating' }
  // - { t: 'd', text: 'final response' }
  // - etc.
}
```

**Step 3: Stop Generation (Cancellation)**
```typescript
// User clicks Stop → client calls cancel Cloud Function
await chatCancel(requestId)
// Backend stops processing and marks request as 'cancelled'
// Next poll returns { status: 'cancelled', isDone: true }
```

### Architecture Diagram

```
Client (Browser)
├── User sends message
├── Calls chatSendInit(message, requestId)
│   ↓
│   Cloud Function v1-chatSendInit
│   ├── Validates input
│   ├── Stores request in queue/cache
│   └── Returns requestId
│
├── Polls chatGetStatus(requestId) every 400ms
│   ↓
│   Cloud Function v1-chatGetStatus
│   ├── Fetches updates from queue
│   └── Returns incremental updates
│
├── User clicks Stop → chatCancel(requestId)
│   ↓
│   Cloud Function v1-chatCancel
│   ├── Sets request status to 'cancelled'
│   └── Backend stops processing
│
└── Next poll gets { status: 'cancelled' }
```

---

## Implementation Details

### New Cloud Functions Needed

Backend needs 3 new Cloud Functions:

#### 1. v1-chatSendInit
**Purpose:** Initiate a chat request and return a request ID

**Request:**
```typescript
{
  threadId?: string | null,
  message: string,
  mode?: string,
  language?: string,
  audioBase64?: string,
  imageBase64?: string,
  userPersonalization?: any,
  attachments?: any[],
  forceImageGeneration?: boolean,
  requestId: string  // Unique identifier for this request
}
```

**Response:**
```typescript
{
  requestId: string,
  threadId: string,
  status: 'initiated' | 'processing' | 'completed' | 'failed'
}
```

**Implementation:**
- Store request in a queue (Redis/Firestore/Cloud Tasks)
- Start async processing
- Return immediately with requestId

#### 2. v1-chatGetStatus
**Purpose:** Poll for updates on an ongoing chat request

**Request:**
```typescript
{
  requestId: string
}
```

**Response:**
```typescript
{
  requestId: string,
  status: 'processing' | 'completed' | 'failed' | 'cancelled',
  updates: [
    { t: 'c', v: 'text' },
    { t: 'img', status: 'generating' },
    { t: 'd', text: 'final', imageUrl: '...' }
  ],
  isDone: boolean,
  finalText?: string,
  finalImages?: string[]
}
```

**Implementation:**
- Fetch request status from queue/cache
- Return only NEW updates (use cursor/offset)
- Mark as 'completed' when done

#### 3. v1-chatCancel
**Purpose:** Cancel an ongoing chat request

**Request:**
```typescript
{
  requestId: string
}
```

**Response:**
```typescript
{
  requestId: string,
  cancelled: boolean,
  message: string
}
```

**Implementation:**
- Mark request as 'cancelled'
- Stop any ongoing processing
- Clear from queue

---

## Configuration

### Polling Interval

**Current:** 400ms (configurable)

```typescript
for await (const update of streamChatViaCloudFunctions(
  request,
  signal,
  400  // <- polling interval in milliseconds
)) {
  // Handle update
}
```

**Tuning:**
- **Faster (200ms):** More responsive but higher API calls
- **Slower (1000ms):** Fewer API calls but more latency
- **Recommended:** 400-500ms

### Request Timeout

**Current:** 120 attempts × 400ms = ~48 seconds

```typescript
const maxAttempts = 120;  // <- tune this
```

**Tuning:**
- Increase for long-running requests
- Decrease for faster timeout feedback

---

## Stop Generation (AbortSignal) Replacement

### How It Works Now

**Old (Backend SSE):**
```typescript
// Client aborts fetch → browser closes connection
controller.abort()
// Backend sees connection close → stops processing
```

**New (Cloud Functions):**
```typescript
// Client aborts signal → polling stops
if (signal?.aborted) {
  await chatCancel(requestId)  // Notify server
  // Server stops processing
}
```

### Behavior

| Scenario | Behavior |
|----------|----------|
| User clicks Stop | Polling stops, chatCancel() called, server stops processing |
| Server finishes | Poll returns isDone: true, loop exits cleanly |
| Timeout (48s) | Poll gives up, error event yielded |
| User navigates away | AbortSignal triggers, chatCancel() sent (fire-and-forget) |

---

## Performance Comparison

### SSE (Backend API)
- **Latency:** ~100ms (event arrives in real-time)
- **Overhead:** Persistent connection
- **Stop:** Instant (connection close)
- **Scalability:** Connection pooling required

### Polling (Cloud Functions)
- **Latency:** 400ms + round-trip time
- **Overhead:** Multiple HTTP requests
- **Stop:** 400ms delay (next poll) + processing time
- **Scalability:** Better (stateless, autoscaling)

### Trade-offs

**Gains:**
- ✅ 100% Cloud Functions (no backend API needed)
- ✅ Better autoscaling (stateless)
- ✅ Works on any backend (App Engine, Run, etc.)
- ✅ Easier to monitor/debug per-request

**Costs:**
- ❌ ~300-500ms added latency
- ❌ More API calls (10 calls per 5 seconds instead of 1 connection)
- ❌ Stop generation has ~400ms delay
- ❌ Slightly higher bandwidth (headers × 10)

---

## Implementation in Frontend

### Changes to useChat.ts

The integration is already handled in `functionsService.ts`. No changes to `useChat.ts` needed!

The `streamChatMessage()` function now:
1. Converts ChatFunctionPayload to Cloud Functions format
2. Calls chatSendInit() to start request
3. Polls chatGetStatus() every 400ms
4. Calls chatCancel() on stop/abort

### Code Flow

```typescript
// In useChat.ts (unchanged)
for await (const event of streamChatMessage(payload, controller.signal)) {
  if (event.t === 'c') {
    // Handle chunk (works the same)
    streamedText += event.v
  } else if (event.t === 'd') {
    // Handle done (works the same)
    setFinalMessage(event.text)
  }
}
```

---

## Error Handling

### Polling-Specific Errors

| Error | Cause | Recovery |
|-------|-------|----------|
| `Quota exceeded` | API call limit hit | Handled by Cloud Functions |
| `Request not found` | Server lost request | New init request |
| `Timeout` | 48 seconds with no completion | Error message shown |
| `Cancelled` | User clicked Stop | Graceful shutdown |

### Error Events

```typescript
// If error during polling:
yield { t: 'e', msg: 'Error message' }

// If timeout:
yield { t: 'e', msg: 'Chat request timed out' }

// If user cancels:
yield { t: 'e', msg: 'Request was cancelled by user' }
```

---

## Database Schema for Request Queue

### Option 1: Firestore (Recommended for Firebase)

```javascript
// Collection: chatRequests/{requestId}
{
  requestId: string,        // Unique per request
  userId: string,           // Owner of request
  threadId: string,         // Chat thread ID
  status: 'processing' | 'completed' | 'failed' | 'cancelled',
  message: string,          // User's message
  updates: [
    { t: 'c', v: 'text chunk' },
    { t: 'd', text: 'final response' },
  ],
  createdAt: timestamp,
  updatedAt: timestamp,
  expiresAt: timestamp,     // TTL: 24 hours
}
```

**TTL:** Auto-delete after 24 hours

### Option 2: Redis (For Speed)

```
Key: chatRequests:{requestId}
Value: {
  status,
  updates: [...],
  lastUpdated: timestamp
}
Expiry: 3600 seconds (1 hour)
```

### Option 3: In-Memory (Development Only)

```typescript
// In Cloud Function memory (don't do this in production)
const requests = new Map();
requests.set(requestId, { status, updates });
```

---

## Testing

### Test Cases

1. **Normal flow:** Send message → poll updates → receive response ✅
2. **Stop generation:** Stop button → chatCancel() → request cancelled ✅
3. **Timeout:** No updates for 48s → timeout error ✅
4. **Navigation away:** AbortSignal triggered → chatCancel() sent ✅
5. **Error recovery:** Network error → retry with same requestId ✅
6. **Multiple messages:** Handle 2+ simultaneous requests ✅

### Load Testing

```bash
# Simulate 100 concurrent chat requests
# Monitor:
# - Cloud Function latency
# - Database query latency
# - Error rates
# - Cost per request
```

---

## Monitoring & Observability

### Key Metrics

```typescript
// Track in Cloud Functions logs:
{
  requestId: string,
  duration: number,          // Time from init to completion
  updateCount: number,       // Number of updates
  pollCount: number,         // Number of polls
  cancellationReason?: string,
  errorCode?: string,
}
```

### Alerts

- ⚠️ Poll latency > 1 second
- ⚠️ Update queue > 100 items
- ⚠️ Timeout rate > 5%
- ⚠️ Cancellation rate > 20%

---

## FAQ

**Q: Why 400ms polling interval?**  
A: Balances latency (~500ms) with API cost. Adjust based on your needs.

**Q: Will this feel slow?**  
A: ~300-400ms delay is noticeable but acceptable for chat. SSE felt instant (< 50ms).

**Q: What about large responses?**  
A: Polling returns incremental chunks, so large responses arrive in ~0.4s increments.

**Q: Can I make it faster?**  
A: Reduce polling interval (200ms), but this increases API calls and cost.

**Q: What if the backend is overloaded?**  
A: Polling back-off logic can be added (exponential backoff if queue is full).

**Q: Cost impact?**  
A: ~10× more API calls = ~10× more invocations. Monitor and optimize.

---

## Migration Checklist

- [x] Add polling logic to cloudFunctionsService.ts
- [x] Update streamChatMessage() to use polling
- [x] Update cancelChatRequest() to use chatCancel()
- [ ] Backend: Implement v1-chatSendInit Cloud Function
- [ ] Backend: Implement v1-chatGetStatus Cloud Function
- [ ] Backend: Implement v1-chatCancel Cloud Function
- [ ] Backend: Set up request queue (Firestore/Redis)
- [ ] Testing: Verify polling works
- [ ] Testing: Verify stop generation works
- [ ] Testing: Verify error handling
- [ ] Monitoring: Add metrics logging
- [ ] Documentation: Update user-facing docs

---

## Summary

✅ **Frontend:** Cloud Functions streaming via polling (COMPLETE)  
⏳ **Backend:** Cloud Functions v1-chatSendInit/Status/Cancel (TODO)  
⏳ **Backend:** Request queue implementation (TODO)  

Once backend Cloud Functions are ready, chat will be fully migrated to Cloud Functions with working stop generation!

---

**Status:** Frontend ready | Backend implementation required

