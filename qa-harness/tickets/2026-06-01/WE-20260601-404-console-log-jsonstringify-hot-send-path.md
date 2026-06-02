# WE-20260601-404: console.log(JSON.stringify(toolActions)) runs on every chat turn (hot send path) in production build

| Field | Value |
|---|---|
| **ID** | `WE-20260601-404` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-performance` |
| **Severity** | `P3`|
| **Priority** | `P3`|
| **Category** | `perf` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/hooks/useChat.ts:706, 710` |
| **URL / Page** | `/:userId/chat` |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-frontend`|

## Description

The `sendMessage` finalize block unconditionally serializes and logs tool actions on every completed turn:

```
console.log('[useChat] toolActions:', JSON.stringify(finalMeta.toolActions))   // line 706
...
console.log('[useChat] createdChecklist:', createdChecklist)                   // line 710
```

`JSON.stringify` of the full `toolActions` payload (which can include checklist items arrays, titles, etc.) runs synchronously on the main thread for every turn, and ships to the production console (Vite does not strip `console.log` by default unless `esbuild.drop` / terser `drop_console` is configured — confirm in vite.config). On mobile, retaining large serialized strings in the console buffer over a long session also adds memory pressure (the 30-min memory check), and the serialization itself is wasted work for end users.

This is left-over debug logging on a hot path, not intentional telemetry (telemetry goes through `track(...)`).

## Steps to reproduce (by reading)

1. Complete any chat turn that returns tool actions.
2. `console.log(JSON.stringify(finalMeta.toolActions))` fires (line 706) every turn.

## Expected

Remove the two debug `console.log`s (or gate behind `import.meta.env.DEV`). Confirm `vite.config` drops console in production builds as a defense-in-depth.

## Actual

Unconditional `JSON.stringify` + console.log on every turn in production.

## Notes

STATIC. Specialist: fix-frontend. Trivial but on the hot path; bundle with other useChat cleanups if a PR touches this file.

---

_Filed by `qa-performance` on `2026-06-01`._
