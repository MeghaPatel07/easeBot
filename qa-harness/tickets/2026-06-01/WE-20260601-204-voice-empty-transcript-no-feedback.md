# WE-20260601-204: Voice journey — empty/failed STT transcript gives no user feedback (Flow C step 3)

| Field | Value |
|---|---|
| **ID** | `WE-20260601-204` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `qa-e2e-playwright` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `e2e-flow` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/Index.tsx:459-478` (handleMicClick) ; `src/hooks/useVoice.ts:211-215, 230-258` |
| **URL / Page** | `/` voice input (mic button) |
| **Breakpoint** | all |
| **Status** | `triaged`|
| **Assigned** | `fix-frontend`|
| **PR** | |
| **Progress** | |

## Description
Flow C step 3 expects "STT transcription appears in input box." Two code paths silently produce
nothing visible to the user:

1. **Empty transcript (short / silent recording).** `useVoice.stopRecording` returns
   `{ text: '', detectedLanguage: 'en' }` when the audio is under ~500 chars of base64
   (useVoice.ts:211-215). `handleMicClick` then runs `if (result?.text) setInputText(result.text)`
   (Index.tsx:463) — an empty string is falsy, so NOTHING happens. No toast, no "didn't catch that,"
   the input stays empty and the user has no idea why their speech vanished.

2. **Transcription failure.** On a real transcribe error, `stopRecording` sets the hook's internal
   `error` and returns `null` (useVoice.ts:249-257). The comment at useVoice.ts:256 says "Surface to
   the UI via toast in the caller," but `handleMicClick` (Index.tsx:461-468) only handles the success
   `result?.text` branch — it never reads `voiceError` after the await, and there is no toast. The
   only place `voiceError` is referenced is the pre-recording clear at Index.tsx:460. So a failed
   transcription is invisible to the user.

Either way the voice journey dead-ends with zero feedback after the user has spoken and tapped stop.

## Steps to reproduce (by reading)
1. Tap mic, speak nothing (or <~1s), tap stop. `useVoice.ts:211-215` returns `{ text: '' }`.
2. `Index.tsx:463`: `if (result?.text)` is false → input unchanged, no message, no toast.
   OR: transcribe POST fails → `useVoice.ts:249` sets error, returns null →
   `Index.tsx` success branch skipped, no error surfaced.

## Expected
Empty transcript → brief non-blocking hint ("Didn't catch that — try again"). Transcription failure →
error toast (the hook comment explicitly expects the caller to do this). Voice error state should be
surfaced after the stop await, not only cleared before start.

## Actual
Both empty-transcript and transcription-failure paths produce no visible feedback.

## Evidence
- STATIC — needs live re-verify when MCP+backend restored.
- Caller: `src/pages/Index.tsx:459-478`. Hook: `src/hooks/useVoice.ts:211-215, 230-258`.

## Notes
fix-frontend. Distinct from voice-preview TTS race (WE-20260528-1091, PR #84) and from mic-permission
denial (which IS handled at Index.tsx:470-476). Not in marathon-master-2026-05-29.csv.

---
_Filed by `qa-e2e-playwright` on `2026-06-01T00:00:00Z`._

## Triage note (2026-06-01)

CANONICAL for the empty-STT-feedback cluster. WE-20260601-312 (edge-case-qa) is a duplicate (empty-transcript subset) and is closed against this ticket. Fix here must cover both the empty-transcript (`{text:''}`) AND the transcription-failure (`null` + voiceError) branches.
