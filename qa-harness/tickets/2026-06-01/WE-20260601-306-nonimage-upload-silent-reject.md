# WE-20260601-306: Selecting a non-image file (PDF/exe) in the attach picker fails silently — no error, no feedback

| Field | Value |
|---|---|
| **ID** | `WE-20260601-306` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `edge-case-qa` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `edge` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/Index.tsx:365-378` |
| **URL / Page** | `/chat` |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-frontend`|

## Description
`handleFileSelected` rejects non-images with a bare early return:
`if (!file || !file.type.startsWith('image/')) return;` (Index.tsx:367). The
`<input accept="image/...">` filter is only a hint — on every OS the user can switch
the file dialog to "All Files" and pick a PDF, .docx, .exe, etc. When they do, the
handler silently returns: no toast, no alert, no inline message. From the user's
perspective they picked a file and absolutely nothing happened — they'll assume the
attach feature is broken.

Additionally, the >4MB branch uses a native blocking `alert('Image must be under
4MB')` (line 368), inconsistent with the app's `sonner` toast system, and there is no
`reader.onerror` handler (line 369) so a FileReader failure on a corrupt/permission-
denied file is also a silent no-op.

## Steps to reproduce (by reading)
1. Tap attach → choose "All Files" → select a `.pdf` (or `.exe`).
2. `file.type` is `application/pdf` → `!startsWith('image/')` → bare `return`.
3. No feedback of any kind.

## Expected
Reject non-images with a clear toast: "That file type isn't supported — please
attach a PNG, JPEG, GIF, or WebP image." Replace the >4MB `alert()` with a toast for
consistency. Add `reader.onerror` to toast "Couldn't read that file — try again."

## Actual
Non-image selection is a silent no-op; oversize uses a jarring native `alert()`;
FileReader errors are unhandled.

## Notes
STATIC — needs live re-verify. The 4MB size cap itself is correct/intentional
(WE-20260527-220 covered >10MB; WE-20260528-405 covered the inline-edit caps). This
ticket is specifically the missing rejection FEEDBACK for non-images, which prior
sweeps did not flag.

---
_Filed by `edge-case-qa` on `2026-06-01`._
