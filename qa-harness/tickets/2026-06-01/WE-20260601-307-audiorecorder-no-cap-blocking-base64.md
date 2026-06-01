# WE-20260601-307: AudioRecorder has no in-class duration cap + byte-by-byte base64 loop blocks the main thread on long recordings

| Field | Value |
|---|---|
| **ID** | `WE-20260601-307` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `edge-case-qa` |
| **Severity** | `P3`|
| **Priority** | `P3`|
| **Category** | `edge` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/services/audioRecorder.ts:82-98` |
| **URL / Page** | `/chat` (voice) |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-performance`|

## Description
The 60s auto-stop cap lives in the hook (`useVoice.ts:42`), not in `AudioRecorder`
itself, and only fires while the hook's timer is running. In `AudioRecorder.stop()`
the captured blob is base64-encoded with a tight per-byte loop:

```
for (let i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]) }
const audioBase64 = btoa(binary)
```

The comment claims "Convert to base64 in chunks to avoid call stack overflow on large
buffers" but the code is NOT chunked — it appends one char at a time to a growing JS
string. For a long recording (the legacy `AudioRecorder` path is used on Safari <14.1,
where the 60s cap still allows ~1–2 MB of webm/ogg), this is a synchronous O(n) string
build + `btoa` on the main thread, causing a visible UI freeze right when the user
expects the "Transcribing…" spinner. There is also no defensive per-class max so a
direct/edge caller that bypasses the hook timer is unbounded.

## Steps to reproduce (by reading)
1. On a browser that selects the legacy `AudioRecorder` (Safari <14.1), record ~60s.
2. `stop()` runs the per-byte string build over ~1–2 MB then `btoa` — all sync.
3. Main thread blocks; UI janks during the record→transcribe transition.

## Expected
Encode via `FileReader.readAsDataURL` (off-thread) or chunked `String.fromCharCode`
over typed-array slices (`apply` over ~8KB windows), and add a defensive size/duration
guard inside the class so it degrades gracefully regardless of caller.

## Actual
Unchunked per-byte base64 build on the main thread; no in-class cap.

## Notes
STATIC — needs live re-verify (perf). 0.1s-silence and 5-min cases ARE handled at the
hook level (short-recording guard `useVoice.ts:211`; 60s auto-stop `useVoice.ts:42`),
so this is purely the encoding/perf + defense-in-depth gap, not a missing cap.

---
_Filed by `edge-case-qa` on `2026-06-01`._
