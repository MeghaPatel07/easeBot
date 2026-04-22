# Continuous Generation Pipelines in Modern LLM Chat Systems

**Research scope:** ChatGPT, Claude.ai, Gemini, Perplexity, and the open-source patterns that mirror them (Vercel AI SDK + Resumable Streams, LangGraph Platform, AWS Bedrock AgentCore).
**Target deployment:** Easebot stack (Express + Azure OpenAI + Gemini image gen + Firebase + React/Vite).

The single most important insight before we go deep:

> **The HTTP request the browser holds is a *subscription to a stream*, not the generation itself.** Generation runs as an independent, durable job whose lifecycle is decoupled from any one TCP connection. Every other design decision in this document falls out of that one rule.

Today the backend (per `easebot-backend/src/app.ts` + `chatController.ts`) runs generation *inside* the SSE request handler. When the client disconnects, the Azure OpenAI stream dies with the request. That coupling is the thing we are breaking.

---

## 1. Research findings — how the majors actually do it

### 1.1 Transport

| System | Token stream transport | Evidence |
|---|---|---|
| ChatGPT | SSE (`text/event-stream`), HTTP/2 | Observable in `/backend-api/conversation` response headers; uses `event: delta` / `event: message_stream_complete` |
| Claude.ai | SSE, HTTP/2 | `/api/organizations/.../completion` returns `text/event-stream` with `event: completion` / `event: ping` / `event: error` |
| Gemini web | HTTP/2 chunked streaming (not strict SSE) behind a gRPC-web-ish envelope | Uses `StreamGenerateContent` under the hood; frontend uses ReadableStream fetch |
| Perplexity | SSE | Visible `text/event-stream` frames |
| Copilot (GitHub) | SSE | Same |

**Why SSE wins for token streaming:**

- Unidirectional server→client is exactly the shape of a token stream. WebSocket's bidirectionality is wasted and brings framing/ping complexity.
- `EventSource` has **automatic reconnect with `Last-Event-ID` replay built into the browser** — the single most important feature for resumability, and the one most new teams miss by reaching for WebSocket.
- Works through corporate proxies, load balancers, CDNs (it's just HTTP).
- Works with HTTP/2 multiplexing — hundreds of streams per TCP connection.
- Auth piggy-backs on cookies/JWT/headers like any HTTP request.

**When WebSocket is actually better:** true bidirectional traffic — live voice (Speech SDK input while generation streams back), collaborative editing, low-latency function-call interruption (Advanced Voice Mode in ChatGPT uses WebRTC, not WebSocket, because audio).

**Polling fallback:** a `GET /generations/:id?cursor=N` long-poll that returns a batch of chunks after `N`. Keep it — it's the escape hatch for clients behind broken proxies.

### 1.2 Backend topology (inferred)

All three systems show behavior consistent with this pattern:

```
Client ──POST──▶ API Gateway ──enqueue──▶ Job Broker (Kafka/Redis Streams/SQS)
                                             │
                                             ▼
                                       Completion Worker (pool)
                                             │
                                             ▼
                        Redis Stream / Pub-Sub keyed by generationId
                                             ▲
Client ◀──SSE──── Stream Gateway ◀──tail─────┘
```

Two independent HTTP endpoints, two independent fleets. The **Stream Gateway is stateless** — any node can serve any generation because it just tails a pub-sub topic keyed by `generationId`. This is what lets a user close the laptop, walk to another room, open their phone, and watch the same message finish.

**Evidence this is what they do:**

- ChatGPT: if you close the tab at 20% and reopen within ~2 minutes, the response is **already fully written** in the conversation — clearly the generation didn't stop when the tab closed. If you reopen while still streaming, you see tokens resume mid-word with a brief catch-up burst (classic replay-then-tail signature).
- Claude: identical behavior; reopening a just-closed tab shows the completed response even when the tab was closed within a few seconds of starting.
- Gemini: same, plus a visible "regeneration in progress" banner if you reload.
- Anthropic's published docs call out that their **Messages API supports `message_start` with a stable `id`** — the foundation for resumable delivery.

### 1.3 Durability layer

Every production system has an **append-only chunk log**, keyed by generation ID, with cursor-based reads. Choices:

| Store | Pros | Cons | Used by (inferred / known) |
|---|---|---|---|
| **Redis Streams** (`XADD` / `XREAD` / consumer groups) | Sub-ms writes, built-in consumer groups, ordered IDs, TTL | Not durable across full-region outage unless persisted; memory-bound | Vercel Resumable Streams, many LLM wrappers |
| **Kafka** | Infinite retention, replayable, huge throughput | Operational weight, higher latency per chunk | OpenAI internal (strong evidence from job postings and infra talks) |
| **Postgres `LISTEN/NOTIFY` + append table** | Simple, transactional | Doesn't scale to 1M concurrent | Smaller deployments |
| **NATS JetStream** | Lightweight, geo-replicated | Smaller ecosystem | Some Perplexity-adjacent patterns |
| **Firestore doc with chunk array** | Free realtime fan-out to clients | Write-rate ceiling (~1 write/sec/doc), latency, cost at scale | Good for **image jobs**, bad for token streams |

**The rule: tokens go to Redis Streams (or Kafka); completed messages go to the system of record (Postgres/Firestore).** Two different storage systems for two different access patterns.

### 1.4 Job lifecycle state machine

Every durable generation is one of:

```
QUEUED → RUNNING → (STREAMING) → COMPLETED
                              ↘  FAILED
                              ↘  CANCELLED
                              ↘  TIMED_OUT
```

`RUNNING` vs `STREAMING`: job started, tokens being written to the log — these are the same for text, but for **image generation** `RUNNING` is the long tail (provider is generating) and `STREAMING` is irrelevant.

### 1.5 Cancellation model

All three majors distinguish three outcomes that the current system conflates:

| Event | What happens to generation |
|---|---|
| User clicks Stop | **Cancel** — abort signal propagated to LLM provider, partial output saved, message flagged `cancelled_by_user` |
| Tab close / navigation / network blip | **Nothing** — job continues, stream log keeps filling, message persists on completion |
| Idle timeout (e.g. 10 min no client reconnect + job still running past normal bound) | Policy decision; ChatGPT seems to let it complete, Claude too |
| Hard error (provider 5xx, worker crash) | **Failed** — error event persisted on the stream, client sees it on next connect |

This is the architectural reason you can't use `req.on('close', abort)` as your cancel mechanism. That's the one change that most teams get wrong.

---

## 2. Recommended production architecture for Easebot

### 2.1 Component map

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                 BROWSER                                    │
│  ┌────────────────────┐   ┌──────────────────────┐   ┌──────────────────┐  │
│  │ React Router pages │──▶│ ActiveGenerationStore │──▶│ EventSource/fetch│  │
│  │ (/chat, /planner…) │   │ (Zustand, app-wide)  │   │  w/ Last-Event-ID│  │
│  └────────────────────┘   └──────────────────────┘   └─────────┬────────┘  │
│     Route change:                      │                       │           │
│     store persists,                    ▼                       │           │
│     stream survives             IndexedDB (cursor,              │           │
│                                 partial tokens,                 │           │
│                                 generationId)                   │           │
└─────────────────────────────────────────────────────────────────┼──────────┘
                                                                  │
                                                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                              EDGE / GATEWAY                                │
│  ┌──────────────┐     ┌──────────────────┐     ┌──────────────────────┐    │
│  │ POST /chat   │     │ GET  /chat/      │     │ POST /chat/          │    │
│  │ /submit      │     │ :genId/stream    │     │ :genId/cancel        │    │
│  │ (kickoff)    │     │ (SSE subscribe)  │     │                      │    │
│  └──────┬───────┘     └─────────┬────────┘     └──────────┬───────────┘    │
│         │                       │                         │                │
└─────────┼───────────────────────┼─────────────────────────┼────────────────┘
          │                       │                         │
          ▼                       │                         ▼
  ┌───────────────┐               │                ┌────────────────┐
  │ Broker        │               │                │ Control Bus    │
  │ (BullMQ on    │               │                │ (Redis Pub/Sub │
  │  Redis)       │               │                │  "cancel:*")   │
  └───────┬───────┘               │                └────────┬───────┘
          │                       │                         │
          ▼                       │                         │
  ┌──────────────────────────────────────┐                  │
  │     Completion Worker pool           │◀─────abort───────┘
  │  (Node processes, N instances)       │
  │                                      │
  │  - pulls from broker                 │
  │  - calls Azure OpenAI (streaming)    │
  │  - XADD each chunk to chunks:{genId} │
  │  - checkpoints every 16 chunks to FS │
  │  - on done: writes final message doc │
  └─────────────┬────────────────────────┘
                │
                ▼
    ┌───────────────────────────┐
    │  Redis Streams            │──── XREAD ────▶ Stream Gateway (SSE endpoint)
    │  chunks:{genId}           │
    │  status:{genId}           │
    │  TTL 2h                   │
    └───────────────────────────┘
                │
                │  on completion / every N chunks
                ▼
    ┌───────────────────────────┐
    │  Firestore                │
    │  chats/{tid}/messages/{m} │
    │  generations/{genId}      │  ← job metadata, final status
    └───────────────────────────┘
```

### 2.2 The two-endpoint contract (single most important API change)

**Replace** the current `POST /api/chat/stream` (which does generation *and* streaming in one request) with:

```
POST /api/chat/submit
  body: { threadId, message, mode, attachments, clientGenerationId? }
  returns: 202 Accepted
  { generationId, messageId, assistantMessageId, createdAt }

GET  /api/chat/:generationId/stream         [SSE]
  headers: Last-Event-ID: <lastSeenChunkId>
  events:
    id: 0001  event: chunk        data: {"t":"c","v":"Hi"}
    id: 0002  event: chunk        data: {"t":"c","v":" there"}
    id: 0003  event: tool         data: {"tool":"generate_image","status":"generating"}
    id: 0004  event: chunk        data: {"t":"c","v":"!"}
    id: 0005  event: done         data: {"messageId":"m_…","usage":{…}}

POST /api/chat/:generationId/cancel
  returns: { status: "cancel_requested" }

GET  /api/chat/threads/:threadId/active     [one-shot JSON]
  returns: [{ generationId, assistantMessageId, startedAt, status }]
```

`clientGenerationId` is an idempotency key generated in the browser (a UUID). If the network drops between request and 202, the client retries with the same ID and the server returns the original generation instead of starting a duplicate. This is the same mechanism Stripe uses for payment idempotency and **must** exist for retry safety.

### 2.3 Why `202 Accepted` and not the token stream inline?

Because it removes the coupling. The moment submit returns, the generation is owned by the **worker**, not the HTTP request. The client can close and reopen the stream 50 times; the worker never notices.

You can still keep a single-RTT "fast path" for latency-sensitive clients: have `POST /submit` **optionally** upgrade into the SSE stream in the same response. ChatGPT does something close to this. But the resume endpoint must exist independently — the fast path is an optimization, not the contract.

### 2.4 Data model

**Redis (hot path, TTL 2h):**

```
chunks:{generationId}          XADD stream, entries = {type, payload, seq}
status:{generationId}          HASH  {state, startedAt, workerId, cancelRequestedAt?}
cancel:{generationId}          PUB/SUB channel (control bus)
owner:{generationId}           SET NX EX 300  (worker lease, renewed via heartbeat)
```

**Firestore (durable, system of record):**

```
generations/{generationId}
  - threadId, userId, assistantMessageId
  - state: queued|running|completed|failed|cancelled|timed_out
  - startedAt, completedAt
  - model, mode, promptTokenCount, completionTokenCount
  - errorCode?, cancelReason?
  - checkpoints: [{ seq, textSoFar, toolCalls }]   // every 16 chunks
  - finalText, finalToolActions

chats/{threadId}/messages/{assistantMessageId}
  - as you have today, but include `generationId` and `state`
  - when state === 'running', UI treats `content` as tail of live stream
```

Two places for the same data, intentionally. Redis is what the stream gateway reads; Firestore is what Index.tsx reads when a user opens the thread cold.

### 2.5 Worker loop (pseudocode, Node/TS, drops into `easebot-backend/src/workers/completionWorker.ts`)

```ts
// Pulled from BullMQ queue 'completions'
async function processJob(job: Job<CompletionPayload>) {
  const { generationId, threadId, userId, systemPrompt, messages, tools, mode } = job.data;
  const abortController = new AbortController();

  // 1. Subscribe to cancel bus
  const sub = redis.duplicate();
  await sub.subscribe(`cancel:${generationId}`);
  sub.on('message', () => abortController.abort('user_cancel'));

  // 2. Lease (heartbeat every 30s)
  const heartbeat = setInterval(() => {
    redis.set(`owner:${generationId}`, WORKER_ID, 'EX', 300);
  }, 30_000);

  try {
    await redis.hset(`status:${generationId}`, { state: 'running', workerId: WORKER_ID });
    let seq = 0;
    let textBuffer = '';

    // 3. Stream from Azure OpenAI
    const stream = await azureClient.chat.completions.create({
      model, messages, tools, stream: true,
      signal: abortController.signal,
    });

    for await (const delta of stream) {
      const chunk = delta.choices[0]?.delta?.content ?? '';
      if (chunk) {
        textBuffer += chunk;
        await redis.xadd(`chunks:${generationId}`, '*',
          'type', 'chunk', 'v', chunk, 'seq', String(++seq));
      }
      if (delta.choices[0]?.delta?.tool_calls) { /* … */ }

      // 4. Checkpoint periodically
      if (seq % 16 === 0) {
        await firestore.doc(`generations/${generationId}`).update({
          'checkpoints': FieldValue.arrayUnion({ seq, textSoFar: textBuffer }),
        });
      }
    }

    // 5. Finalize
    await redis.xadd(`chunks:${generationId}`, '*', 'type', 'done', 'seq', String(++seq));
    await redis.expire(`chunks:${generationId}`, 7200);
    await firestore.doc(`generations/${generationId}`).update({
      state: 'completed', finalText: textBuffer, completedAt: new Date(),
    });
    await firestore.doc(`chats/${threadId}/messages/${job.data.assistantMessageId}`).update({
      content: textBuffer, state: 'completed',
    });
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'cancelled' : 'failed';
    await redis.xadd(`chunks:${generationId}`, '*', 'type', 'error', 'reason', reason, 'msg', err.message);
    await firestore.doc(`generations/${generationId}`).update({
      state: reason, errorCode: err.code, finalText: textBuffer,
    });
  } finally {
    clearInterval(heartbeat);
    await sub.unsubscribe(); sub.quit();
  }
}
```

Key details:

- Worker does **not** care whether any client is connected. Never checks.
- Cancellation is **out-of-band** via pub/sub; TCP disconnect is not a cancel signal.
- Checkpoints to Firestore mean even if Redis dies we can resume from the last N tokens.
- Redis TTL of 2h is the garbage collector for abandoned streams.

### 2.6 Stream gateway (pseudocode, Express handler)

```ts
// GET /api/chat/:genId/stream
async function streamHandler(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering
  });
  res.flushHeaders();

  const { genId } = req.params;
  const lastEventId = req.get('Last-Event-ID') ?? '0';

  // 1. Replay missed chunks from Last-Event-ID
  const missed = await redis.xrange(`chunks:${genId}`, `(${lastEventId}`, '+');
  for (const [id, fields] of missed) { writeSse(res, id, fields); }

  // 2. Tail live with blocking read
  let cursor = missed.at(-1)?.[0] ?? lastEventId;
  const heartbeatInterval = setInterval(() => res.write(': ping\n\n'), 15_000);

  req.on('close', () => {
    // Client left. Do NOT cancel generation. Just unwind local state.
    clearInterval(heartbeatInterval);
    abortReadLoop = true;
  });

  while (!abortReadLoop) {
    const entries = await redis.xread('BLOCK', 5000, 'STREAMS', `chunks:${genId}`, cursor);
    if (!entries) continue;
    for (const [, items] of entries) {
      for (const [id, fields] of items) {
        writeSse(res, id, fields);
        cursor = id;
        if (fields.includes('type') && fields[fields.indexOf('type')+1] === 'done') return res.end();
        if (fields.includes('type') && fields[fields.indexOf('type')+1] === 'error') return res.end();
      }
    }
  }
}
```

The gateway is **stateless**. Scale horizontally behind an L4 or L7 load balancer with no sticky sessions.

### 2.7 Cancellation flow

```
User clicks Stop
   │
   ▼
POST /api/chat/:genId/cancel
   │
   ├─▶ redis.hset(status:{genId}, cancelRequestedAt = now)
   └─▶ redis.publish(cancel:{genId}, "user")
                │
                ▼
        Worker's sub.on('message')
                │
                ▼
        abortController.abort('user_cancel')
                │
                ▼
        Azure OpenAI stream rejects with AbortError
                │
                ▼
        Worker XADDs {type:'error', reason:'cancelled'} + Firestore state='cancelled'
                │
                ▼
        Stream gateway relays the error event to any subscribers
                │
                ▼
        Client shows partial text + "Cancelled" marker
```

Important invariants:

1. Cancel is **idempotent** — calling it twice does nothing the second time.
2. Cancel is **best-effort** — if the worker has already returned, cancel returns 200 anyway.
3. Cancel preserves the **partial text** in Firestore. Users want to see what was generated up to the stop button.
4. A `window.beforeunload` / tab close does **not** fire cancel. Only the explicit button.

### 2.8 Image generation pipeline (same pattern, different worker)

Image gen is the cleanest case because there's no token stream — just states:

```
POST /api/images/submit        → 202 { jobId, messageId }
GET  /api/images/:jobId/status → one-shot JSON OR SSE for progress events
```

Or — and this is the simpler move given Easebot already uses Firestore heavily — drop the SSE for images entirely and use a **Firestore document as the event channel**:

```
gallery/{jobId}
  - state: queued|generating|succeeded|failed
  - prompt, enhancedPrompt
  - progress?: 0..1
  - imageUrl?: string (when done)
  - errorCode?
```

The frontend listens with `onSnapshot`. When the user navigates away and back, the listener just rebinds — there's no stream to resume because there's no intermediate data, only a state transition. This is likely how Gemini's image gen works internally (they use the same Firestore-equivalent, Spanner, for job state).

**Worker-side idempotency key:** `hash(userId, threadId, prompt, aspectRatio)`. Prevents the "user hit send twice" double-spend on the 5-image daily quota.

---

## 3. Sequence diagram — happy path with navigation

```
Browser            API GW            Broker         Worker         Redis           Firestore
   │                  │                 │              │              │                 │
   │ POST /submit     │                 │              │              │                 │
   ├─────────────────▶│                 │              │              │                 │
   │                  │ enqueue(job)    │              │              │                 │
   │                  ├────────────────▶│              │              │                 │
   │◀── 202 {genId} ──┤                 │              │              │                 │
   │                  │                 │ dispatch     │              │                 │
   │                  │                 ├─────────────▶│              │                 │
   │ GET /stream      │                 │              │ hset status  │                 │
   ├─────────────────▶│─────── XREAD BLOCK ───────────▶│─────────────▶│                 │
   │                  │                 │              │ Azure stream │                 │
   │                  │                 │              │  chunk "Hi"  │                 │
   │                  │                 │              ├── XADD seq=1─▶│                 │
   │◀── id:1 "Hi" ────│◀─────── tail ───│──────────────│──────────────│                 │
   │                  │                 │              │  chunk " th" │                 │
   │                  │                 │              ├── XADD seq=2─▶│                 │
   │◀─ id:2 " th" ────│                 │              │              │                 │
   │                  │                 │              │              │                 │
   │ User navigates /chat → /planner. React Router unmounts <Chat/>.  │                 │
   │ ActiveGenerationStore keeps EventSource alive (store is app-scoped).               │
   │                  │                 │              │  chunk "ere" │                 │
   │◀─ id:3 "ere" ────│                 │              │              │                 │
   │                  │                 │              │              │                 │
   │ User switches tabs → OS throttles timers. SSE connection survives (browsers        │
   │ keep HTTP alive). Worker keeps streaming either way.                               │
   │                  │                 │              │  ... done    │                 │
   │                  │                 │              ├──XADD done──▶│                 │
   │                  │                 │              ├─────────── write final msg ───▶│
   │◀── id:N done ────│                 │              │              │                 │
   │ close()          │                 │              │              │                 │
```

## 4. Data flow diagram — resume after full reload

```
T0  Browser         Network crashes / tab reloads at seq=47 of 120
    ├─ IndexedDB has: { genId: "g_abc", lastEventId: "47-0" }
    │
T1  Page mounts. ActiveGenerationStore hydrates from IndexedDB.
    ├─ GET /api/chat/threads/{tid}/active
    │  └─▶ Firestore query: generations where threadId=tid AND state in (running,queued)
    │     └─▶ returns [{ generationId: "g_abc", state: "running", assistantMessageId }]
    │
T2  Store opens EventSource("/api/chat/g_abc/stream", { headers: { Last-Event-ID: "47-0" }})
    │  (Note: browser EventSource doesn't allow custom headers; use fetch + ReadableStream
    │   OR pass cursor via query string ?cursor=47-0)
    │
T3  Gateway does XRANGE chunks:g_abc (47-0, +) → batch of 60 missed entries → writes them
    │  all in one flush.
    │
T4  Browser renders catch-up text as a single paint (disable typewriter animation on
    │  replayed chunks — important UX detail).
    │
T5  Gateway switches to XREAD BLOCK from cursor → live tail resumes.
    │
T6  Stream completes normally. Browser clears IndexedDB entry for genId.
```

**Why `Last-Event-ID` via query string, not header:** the native `EventSource` API cannot set custom headers. You have three options:

1. Use the `eventsource-polyfill` or `@microsoft/fetch-event-source` package (this is what ChatGPT ships — it uses `fetch` + `ReadableStream` so it can set Authorization and Last-Event-ID headers).
2. Pass `?cursor=<id>` as a query parameter.
3. Include the cursor in the URL path.

Recommendation: `@microsoft/fetch-event-source`. It's what the Vercel AI SDK uses under the hood and it gives you auth headers + retry control + custom error handling in one package.

---

## 5. Failure recovery flows

### 5.1 Worker dies mid-stream

```
Worker heartbeat misses (owner:{genId} TTL expires at 300s)
   │
   ▼
Supervisor (separate sweeper job running every 60s)
   │  scans generations where state=running AND no matching owner key
   │  verifies with XLEN chunks:{genId} hasn't grown in 60s
   ▼
Two policies (pick one at deploy time):
   │
   ├─ POLICY A: fail-fast
   │    XADD error, reason=worker_died
   │    Firestore state=failed
   │    Client sees error, offers "Retry" button
   │
   └─ POLICY B: resume (only if provider supports it — Anthropic does via "continue",
       Azure OpenAI does not natively)
       Re-enqueue with messages[...history, partial_text_as_assistant]
       New worker picks up; stream gateway transparently continues
       (same genId, new chunks appended to same stream)
```

Easebot recommendation: **Policy A** first. Resume-on-worker-death is a large engineering lift for a low-frequency failure.

### 5.2 Redis outage

Redis is the hot path. Mitigations, in order of cost:

1. **Redis Sentinel + replica** (table stakes). Single-region HA.
2. **Write-through checkpoint to Firestore every 16 chunks.** Already in the worker loop above. If Redis is wiped, you can rebuild the last-seen-to-client state from Firestore plus a fresh retry of tail generation.
3. **Redis Cluster** for sharding at >200k concurrent streams.

If Redis is completely down, `POST /submit` must fail fast (return 503) — don't let worker jobs run with no place to write tokens.

### 5.3 Gateway node dies mid-stream

Browser's `EventSource` reconnects automatically after ~3s (configurable with `retry:` field in SSE). It hits the LB, lands on a different gateway, presents Last-Event-ID, replay-then-tail resumes. User sees a ~3s pause, no data loss.

### 5.4 Azure OpenAI 5xx mid-stream

Worker catches the error. If it's retryable and we've seen <16 tokens, abandon stream, retry the whole call (idempotent because nothing was visible to user yet). If we're past that threshold, emit `error` event with `reason=upstream_failed` and let the user retry from the UI.

### 5.5 Client offline for 10 minutes, then returns

- Generation finished at minute 2. Final message in Firestore. Redis TTL'd the stream.
- Client mounts `/chat/:threadId`, `useChat` does its normal Firestore pagination → the completed message is there. No resume needed.
- The "GET active generations" call returns empty. Nothing to reconnect to.

This is the case that just works as long as you persist completed messages to Firestore unconditionally in the worker.

---

## 6. Frontend state persistence flow

### 6.1 Where state lives

```
┌─────────────────────────────────────────────────────┐
│ ActiveGenerationStore (Zustand, app-scoped)         │
│  - generations: Map<genId, {                        │
│      threadId, assistantMessageId, status,          │
│      buffer: string, eventSource, lastEventId,      │
│      tokenCount, toolEvents                         │
│    }>                                               │
│  - persists lastEventId + genId to IndexedDB        │
│    (survives hard reload)                           │
└─────────────────────────────────────────────────────┘
         ▲                                       ▲
         │                                       │
  <ChatMessages/>                       <Sidebar/> (badge "2 generating")
   reads tail for                        reads count of active
   activeThreadId
```

Critical: the store is **not** scoped to the `<Chat>` route component. It lives at the `App` level so route changes don't unmount it. The current `useChat.ts` state is already hook-scoped — this is a meaningful refactor.

### 6.2 Cross-tab deduplication

User opens the same thread in two tabs. Both see the running generation. Without coordination, both open SSE connections — two subscribers is fine (read-only), but both will also try to `POST /submit` if they send a new message at the same time.

Options:

1. **Web Locks API** (`navigator.locks.request('gen:' + threadId, …)`) — cleanest, native.
2. **BroadcastChannel** between tabs — message "I am the owner of thread X" with leadership election.
3. **Idempotency key on submit** (already designed) — deduplication happens server-side regardless.

Recommendation: option 3 is sufficient; options 1/2 are UX polish for showing "generating…" in both tabs simultaneously.

### 6.3 Route-change continuity (the core user story)

```ts
// App.tsx
<ActiveGenerationProvider>
  <BrowserRouter>
    <Routes>
      <Route path="/chat/:tid" element={<Chat />} />
      <Route path="/:uid/planner" element={<Planner />} />
      {/* etc */}
    </Routes>
  </BrowserRouter>
</ActiveGenerationProvider>
```

The provider owns the EventSource. Navigating to `/planner` unmounts `<Chat>` but NOT the provider, so the stream keeps filling the buffer in store state. When the user navigates back, `<Chat>` remounts and reads the buffer — which may already be complete, or still streaming.

Reminder pattern you can show on `/planner`: a small floating pill ("Viva is still writing your reply — tap to view") backed by `useActiveGenerations()`. ChatGPT does something similar on mobile.

### 6.4 BFCache (iOS Safari / mobile back-forward cache)

When the user backgrounds the app on iOS, the JS VM is frozen. EventSource will either pause or disconnect depending on OS version. On resume, the store detects stale `lastEventId` and triggers reconnection automatically. Test this — it's the most common source of "why didn't my reply come through" bug reports.

---

## 7. Backend job orchestration details

### 7.1 Queue choice

For Easebot's scale (low six figures DAU at steady state, bursts during weddings season), **BullMQ on Redis** is the right default. It gives you:

- Job retries with exponential backoff (for transient Azure errors)
- Rate limiting per queue (to enforce Azure TPM limits)
- Delayed jobs (for the 5-minute "generation timeout supervisor")
- Job progress reporting (for image gen)
- Monitoring UI (BullBoard)

Migrate to Kafka only if you cross ~10k completions/minute sustained.

### 7.2 Worker pool sizing

Rule of thumb for a Node worker calling a streaming LLM API:

- Node process can comfortably handle ~50 concurrent streaming LLM calls (they're I/O-bound — mostly waiting on the socket). Memory per stream: ~50KB text buffer + socket overhead = small.
- CPU is used only by SSE event framing and chunk parsing. Negligible.
- Azure OpenAI TPM (tokens per minute) quota is the real bottleneck — not worker CPU. A single deployment of GPT-4o has ~300k TPM default; at ~600 output tokens per reply, that's 500 replies/minute per deployment.

So: **worker concurrency is bounded by Azure quota, not compute.** Scale out Azure deployments before you scale out workers.

### 7.3 Ownership / exactly-once

BullMQ uses Redis atomic operations to claim a job; no two workers process the same job. The only edge case is worker crash after claim but before writing anything — handled by the supervisor sweep described in §5.1.

### 7.4 Multi-tenancy + fairness

As load grows, you will get "noisy neighbor" — one user running 10 parallel generations. Mitigations:

- Per-user concurrency cap at submit time: `POST /submit` checks `SCARD active:{userId}` < N (e.g. 3 for free, 10 for premium). 429 if over.
- BullMQ has per-key rate limiters if you need smoother enforcement.
- The existing `imageQuota.ts` already does the daily quota; apply the same pattern for concurrent in-flight requests.

### 7.5 Observability

You must be able to answer: "For generation `g_abc`, why is the user seeing nothing?" in under 30 seconds. Instrument:

- Trace ID = generationId. Propagate through logs.
- Metrics: `gen_time_to_first_token`, `gen_total_duration`, `gen_tokens_per_second`, `gen_success_rate`, `gen_cancel_rate`, `sse_reconnect_count`.
- Structured logs at submit, worker claim, first chunk, every N chunks, finish, cancel, error.
- PostHog events at the same boundaries (Easebot already wires PostHog per the recent commits — extend the scheme to generation lifecycle).

---

## 8. Engineering implementation plan (Easebot-specific)

Phased so each phase is shippable independently.

### Phase 0 — prerequisites (1–2 days)

- Stand up Redis (Upstash or managed Redis on your cloud of choice). You'll need it anyway for rate limiting and caching.
- Add BullMQ + Redis client to `easebot-backend/package.json`.
- Add a `WORKER_ID` env var and a `/api/internal/workers/health` route.

### Phase 1 — introduce generations table (2–3 days, zero behavior change)

- New Firestore collection `generations/{genId}`.
- On the existing `POST /api/chat/stream`, generate a `generationId`, write a record with `state=running` at start, `state=completed|failed` at end, with `finalText`.
- Frontend: store `generationId` on the assistant message.
- Ship. Nothing user-visible changes.

### Phase 2 — extract the worker (3–5 days)

- Create `src/workers/completionWorker.ts` (new process or same process running the BullMQ worker).
- Create `src/controllers/submitController.ts` for `POST /api/chat/submit` — enqueues job, returns 202.
- Create `src/controllers/streamController.ts` for `GET /api/chat/:genId/stream` — tails Redis stream.
- Worker does exactly what `chatController.handleChatStream` does today, but writes chunks to `chunks:{genId}` in Redis instead of to the HTTP response.
- Keep old endpoint working as a **thin adapter**: internally calls submit + immediately consumes the stream. Frontend unchanged.
- Dual-run in staging. Compare output parity.

### Phase 3 — frontend adopts two-endpoint model (3–4 days)

- Build `ActiveGenerationStore` (Zustand) at `App.tsx` level.
- Replace the inline fetch-stream in `useChat.ts` with: `POST /submit` → store records the generation → store opens `/stream` via `@microsoft/fetch-event-source`.
- Wire IndexedDB persistence of `{ genId, lastEventId, threadId }`.
- On app cold start: query `/api/chat/threads/:tid/active` on thread mount, reconnect any running generations.
- Route change: `<Chat>` remounting reads from store (no new SSE opened if one's already running).

### Phase 4 — resume semantics (2–3 days)

- Implement Last-Event-ID replay in stream gateway (XRANGE).
- Add `?cursor=<id>` support on the stream endpoint.
- Client: on SSE error, auto-reconnect with saved cursor.
- Test matrix: refresh mid-stream, kill wifi for 10s, switch tabs, background app for 5 minutes.

### Phase 5 — cancellation (1–2 days)

- Add `POST /api/chat/:genId/cancel`.
- Subscribe worker to `cancel:{genId}` pub/sub channel.
- Pass AbortSignal into Azure OpenAI SDK call.
- UI: Stop button calls cancel endpoint. On success, the stream emits `error` with `reason=cancelled` which the client renders as a "Cancelled" tag + partial text preserved.
- **Remove** any code path where `req.on('close')` cancels generation.

### Phase 6 — image generation decoupling (3–4 days)

- Create `imageWorker.ts` processing `image-jobs` queue.
- `POST /api/images/submit` returns 202 with `jobId`.
- Frontend listens to `onSnapshot(gallery/{jobId})` for state transitions.
- Assistant message placeholder with `imageGenerating: true` subscribes to the same doc.
- Navigation to `/gallery` mid-generation: the new `jobId` is already in the user's images subcollection, so the gallery sees it with a "generating" placeholder.
- Idempotency key = `hash(userId, threadId, prompt, aspectRatio)`.

### Phase 7 — failure recovery + supervisor (2 days)

- Sweeper cron on a single worker: `generations` where `state=running` AND heartbeat stale → transition to `failed` with `errorCode=worker_lost`.
- Retry button in UI for failed generations (calls `POST /submit` with same inputs).

### Phase 8 — observability + limits (2 days)

- PostHog events: `gen_started`, `gen_first_token`, `gen_completed`, `gen_cancelled`, `gen_failed`, `gen_resumed`.
- Per-user concurrent generation cap (free=1, premium=3).
- Dashboards: time-to-first-token P50/P95, completion success rate, average tokens/sec.

### Phase 9 — retire the legacy endpoint (1 day)

- Delete the pre-Phase-2 `POST /api/chat/stream` adapter once all clients are on the new flow.
- Update docs / CLAUDE.md.

**Total:** roughly 4–6 engineer-weeks for a single backend engineer + one frontend engineer working in parallel.

---

## 9. Gotchas, in priority order

1. **Do not use `req.on('close')` as a cancel trigger.** This is the #1 mistake teams make. Disconnects must never cancel generation.
2. **`EventSource` cannot set Authorization headers.** Use `@microsoft/fetch-event-source` or move auth to a short-lived cookie-bound session token.
3. **Nginx / Cloudflare buffer SSE by default.** Set `X-Accel-Buffering: no` (nginx) and disable Cloudflare buffering on the route.
4. **Azure OpenAI TPM, not worker CPU, is your scaling bottleneck.** Plan Azure deployments first.
5. **Firestore document write rate is ~1/sec/doc.** Never write each token chunk to a Firestore doc directly — use Redis. Firestore is checkpoints + final state only.
6. **Monotonic event IDs must be globally unique per generation, not per connection.** Redis Streams gives you this for free (`XADD * …`). Don't invent your own counter per SSE response.
7. **`message_id` assigned at submit time, not at worker start.** Frontend needs it to optimistically render the placeholder.
8. **Idempotency on resubmit.** Without the `clientGenerationId` key, a double-tap on Send will bill the user twice and store two parallel messages.
9. **Mobile Safari backgrounding.** Test on real iOS before declaring victory.
10. **Stream doneness is a terminal event, not a close.** Clients must read the `done` / `error` event before treating the stream as complete — raw connection close without a terminal event means "disconnect, reconnect, resume."

---

## TL;DR

The architecture rests on four pillars:

1. **Two-endpoint contract** — `POST /submit` returns a generationId in 202; a separate `GET /stream` is a subscription. Submit is idempotent via client key; stream is resumable via Last-Event-ID.
2. **Worker-owned generation** — the job runs on a BullMQ/Redis worker that is unaware of any connected client. Cancellation is out-of-band pub/sub, not TCP disconnect.
3. **Redis Streams as the durable event log** — cursor-addressable, TTL'd, consumed by stateless gateway nodes, checkpointed to Firestore.
4. **Frontend generation store scoped to App, not Route** — Zustand + IndexedDB for genId/cursor, rebinds on remount, dedupes across tabs via idempotency key.

Make those four changes and you have ChatGPT-class continuity. Everything else in this document is sizing, safety, and polish.
