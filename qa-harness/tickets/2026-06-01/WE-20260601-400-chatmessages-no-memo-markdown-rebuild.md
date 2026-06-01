# WE-20260601-400: ChatMessages list not memoized + ReactMarkdown components object rebuilt every render — full-list re-render + markdown re-parse on every streaming chunk

| Field | Value |
|---|---|
| **ID** | `WE-20260601-400` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-performance` |
| **Severity** | `P1`|
| **Priority** | `P1`|
| **Category** | `perf` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/components/chat/ChatMessages.tsx:120, 261-562; src/hooks/useChat.ts:536-538` |
| **URL / Page** | `/:userId/chat` |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-performance`|

## Description

The chat message stream is the single hottest render path in the app and it is unmemoized end-to-end.

1. `ChatMessages` (default export, line 994) is a plain `React.FC` — NOT wrapped in `React.memo`. Its child building blocks `ChatInput`, `ComparisonTable`, and `MessageAttachmentChips` are likewise unmemoized (confirmed: no `memo(` anywhere in those files).
2. During streaming, `useChat.sendMessage` calls `setMessages(prev => prev.map(...))` on EVERY `event.t === 'c'` chunk (useChat.ts:536-538, 542, 547, 556, 568). Each call returns a brand-new `messages` array reference.
3. `ChatMessages` renders `messages.map(...)` directly (line 261). With no per-row memo + a new array each chunk, EVERY message bubble in the thread re-renders on every single streamed token — not just the streaming one.
4. Worse: each AI bubble renders `<TypewriterMarkdown>` (line 443) with a `components={{ ... }}` object literal that is **re-created inline on every render** (lines 447-561) — including custom `a`, `img`, `table`, `li` renderers with non-trivial logic (the `li` renderer does `React.Children.toArray(...).flatMap(...)` recursion per list item). Because `components` is a new object identity each render, `react-markdown` cannot bail out and **re-parses + re-reconciles the full markdown AST for every completed message on every chunk**.

For a 40-message thread streaming a 600-token reply, this is ~40 messages × ~hundreds of token ticks = thousands of full-subtree reconciliations + markdown re-parses. This is a direct TBT / INP regression (long tasks block the main thread; typing/scroll feels janky) and gets monotonically worse as the conversation grows — exactly the "send 10 messages rapidly, does the UI keep up?" runtime check.

## Steps to reproduce (by reading)

1. Open a thread with 30+ messages.
2. Send a message; backend streams the reply token-by-token.
3. `useChat` fires `setMessages` per chunk (useChat.ts:536) → new array ref → `ChatMessages` re-renders → `messages.map` re-renders all rows → each AI row rebuilds its `components` object → react-markdown re-parses each message body.

## Expected

- A `MessageRow` (or memoized list item) wrapped in `React.memo` so only the streaming message re-renders per chunk; completed messages bail out.
- The `components` object (and `remarkPlugins`) hoisted to module scope or a `useMemo` so react-markdown can memoize parsing of stable message bodies.
- Custom renderers that close over per-message data (`message.text`, `savedProductIds`, `onSaveProduct`) passed via stable refs / props rather than a fresh closure per render.

## Actual

Whole list re-renders + every message's markdown re-parses on every streamed token; cost scales linearly with thread length.

## Notes

STATIC — needs live re-verify (React DevTools Profiler render-flamegraph + INP under CPU 4x throttle) when MCP + backend restored. This is distinct from in-flight bundle PRs (#49/#52/#56/#66) and PERF-BATCHING — those address initial-load bundle size, not per-chunk render cost. Likely fix: extract memoized `<MessageRow>`, hoist `markdownComponents`. Specialist: fix-performance.

---

_Filed by `qa-performance` on `2026-06-01`._
