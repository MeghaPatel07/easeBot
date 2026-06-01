# WE-20260601-312: Empty STT transcript (silence / noisy room) gives zero user feedback — mic appears to do nothing

| Field | Value |
|---|---|
| **ID** | `WE-20260601-312` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `edge-case-qa` |
| **Severity** | `P3`|
| **Priority** | `P3`|
| **Category** | `edge` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/Index.tsx:459-467`, `src/hooks/useVoice.ts:210-215` |
| **URL / Page** | `/chat` (voice) |
| **Breakpoint** | `all` |
| **Status** | `duplicate`|
| **Assigned** | `fix-frontend`|

## Description
When a recording is too short or returns an empty transcript (silence, heavy
background noise that STT can't resolve), `stopRecording` resolves with
`{ text: '', detectedLanguage: 'en' }` (useVoice.ts:214). The caller guards on
`if (result?.text)` (Index.tsx:463), so an empty string falls through and does
NOTHING — no text inserted, no toast, no "we didn't catch that" hint. The mic UI
just returns to idle. To the user it looks like the voice feature silently failed.

This satisfies "should not crash" (it doesn't), but fails the implied UX
expectation for the noisy-environment / silence boundary: the user gets no signal
that the recording was empty or that they should try again.

## Steps to reproduce (by reading)
1. Tap mic, stay silent (or in a noisy room), stop.
2. `useVoice.ts:211` short-audio guard OR Azure returns empty text → `text: ''`.
3. `Index.tsx:463` `if (result?.text)` is false → nothing happens, no feedback.

## Expected
When a stop resolves with an empty/whitespace transcript, show a brief toast such as
"We didn't catch that — try recording again" so the user understands the outcome.

## Actual
Empty transcript silently does nothing; mic returns to idle with no feedback.

## Notes
STATIC — needs live re-verify. The non-empty error path (transcription_failed) is
handled; this is specifically the SUCCESSFUL-but-empty path with no UI signal.

---
_Filed by `edge-case-qa` on `2026-06-01`._

## Triage note (2026-06-01)

DUPLICATE of **WE-20260601-204** (canonical). Same root cause: empty/failed STT transcript produces no user feedback because `handleMicClick` guards on `if (result?.text)` (Index.tsx:463) and an empty string is falsy. 204 is the more complete report — it covers BOTH the empty-transcript path AND the transcription-failure (null/voiceError) path; 312 is the empty-only subset. Fix in 204; close 312 with it.
