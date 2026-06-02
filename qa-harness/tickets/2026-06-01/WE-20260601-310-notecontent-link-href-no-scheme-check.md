# WE-20260601-310: noteContent.ts stores markdown link `href` verbatim — no scheme validation (defense-in-depth)

| Field | Value |
|---|---|
| **ID** | `WE-20260601-310` |
| **Created** | `2026-06-01T00:00:00Z` |
| **Reporter** | `edge-case-qa` |
| **Severity** | `P3`|
| **Priority** | `P3`|
| **Category** | `edge` |
| **Repo** | `easebot-backend` |
| **Path** | `src/utils/noteContent.ts:44-49` |
| **URL / Page** | Notes editor + public `/n/:id` (SharedNote) |
| **Breakpoint** | `all` |
| **Status** | `triaged`|
| **Assigned** | `fix-backend-api`|

## Description
`noteContent.ts` converts LLM markdown into Tiptap ProseMirror JSON. For links it
captures `[text](url)` and emits `{ type: 'link', attrs: { href: match[7] } }`
(line 48) with NO scheme validation — `javascript:`, `data:`, `vbscript:` hrefs would
be stored verbatim in the note's `content` JSON. This content is rendered in the
authenticated editor AND in the PUBLIC SharedNote page (`SharedNote.tsx:202`,
`NoteEditor` readOnly).

In the CURRENT build this is mitigated, not exploited: `@tiptap/extension-link@3.22.3`
ships `isAllowedUri` with a protocol allowlist (`http/https/ftp/mailto/tel/...` —
`node_modules/@tiptap/extension-link/dist/index.js:190-191`) that strips disallowed
schemes on parse, and `NoteEditor` sets `link: { openOnClick: false }`
(`NoteEditor.tsx:141`). So execution is blocked by the client library version, not by
our own code — a TipTap downgrade or a config change (e.g. `openOnClick: true`, or a
future renderer that trusts stored hrefs) would re-open a stored-link injection on a
public page.

## Steps to reproduce (by reading)
1. LLM (or attacker-influenced append_to_note content) emits `[x](javascript:alert(1))`.
2. `noteContent.ts:48` stores `href: 'javascript:alert(1)'` in the note doc.
3. Currently neutralised by TipTap's `isAllowedUri` allowlist + `openOnClick:false`.

## Expected
Validate the scheme at the source: in `parseInline`, reject/normalise any href whose
protocol is not in an allowlist (`http`, `https`, `mailto`, relative) before emitting
the link node — so safety does not depend solely on the client library version.

## Actual
Href stored verbatim; safety relies entirely on TipTap's runtime allowlist.

## Notes
STATIC — needs live re-verify of the public SharedNote render once MCP restored.
Filed P3 (defense-in-depth) precisely because the current TipTap version neutralises
execution; raise if a TipTap config/version change is planned.

---
_Filed by `edge-case-qa` on `2026-06-01`._
