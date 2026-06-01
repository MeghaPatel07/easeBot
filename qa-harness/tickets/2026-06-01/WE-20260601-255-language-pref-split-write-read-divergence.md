# WE-20260601-255: Language preference is written to TWO fields via TWO paths (one silently best-effort) — STT vs chat can diverge

| Field | Value |
|---|---|
| **ID** | `WE-20260601-255` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-state-sync` |
| **Severity** | `P2`|
| **Priority** | `P2`|
| **Category** | `state-sync` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/pages/settings/tabs/AppearanceTab.tsx:133-157` (dual write, second is best-effort) ; reads: `src/hooks/useVoice.ts:219-222` (STT → preferences.language) vs `src/pages/Index.tsx:252-253` (chat → preferredLanguage) |
| **URL / Page** | Settings → Appearance (Language) → chat send language vs voice STT language |
| **Breakpoint** | all |
| **Status** | `triaged`|
| **Assigned** | `fix-state-data`|
| **PR** | |
| **Progress** | |

## Description

DEDUP NOTE: WE-20260527-160 already covers "preferred-language change does not propagate to STT/system prompts because AuthContext is stale" (the getDoc/onSnapshot staleness, addressed by #170/#32). This ticket files a SEPARATE design defect 160 did not cover: the language preference is written to two DIFFERENT fields via two DIFFERENT paths, and the readers split across those two fields — so even with a live AuthContext, STT and chat can disagree.

`AppearanceTab.onLanguageChange` (lines 133-157) writes:

1. `updatePreferences(mergedPrefs({ language: next }))` → backend `PATCH /api/account/preferences` → field `preferences.language`.
2. `updatePreferredLanguage(user.uid, next)` → direct `updateDoc(users/{uid}, { preferredLanguage: next })` (authService.ts:472-473) → DIFFERENT field `preferredLanguage` (legacy). This second write is explicitly best-effort and SWALLOWS errors: the catch comment says "Non-fatal: legacy back-compat best-effort only" (AppearanceTab.tsx:143-145).

The readers are split across the two fields:

- Voice STT resolves language server-side from `users/{uid}.preferences.language` (useVoice.ts:219-222).
- Chat send copies `profile?.preferredLanguage` (the legacy field) into local `preferredLang` (Index.tsx:252-253).

So if write #1 (preferences.language) succeeds but write #2 (preferredLanguage) fails — which is silent — STT will use the new language while chat keeps the old one (or the reverse on a different failure ordering). No error is surfaced. This is a state-sync inconsistency independent of the AuthContext-staleness in 160: two canonical fields that can drift apart, with one writer that fails silently.

## Steps to reproduce (by reading)

1. Settings → Appearance → change Preferred language (e.g. Auto → Hindi).
2. `onLanguageChange` issues write #1 (backend `preferences.language`) and write #2 (`preferredLanguage`, best-effort, errors swallowed).
3. If write #2 throws (network blip, rules) while write #1 succeeds: STT (reads `preferences.language`) now uses Hindi; chat (reads `preferredLanguage`) still uses the old value. No toast.

## Expected

A single language change updates both STT and chat consistently; one canonical field/source so STT and chat cannot diverge, and any write failure is surfaced (not silently swallowed) and rolled back.

## Actual

Two fields written via two paths; the legacy-field write fails silently; STT and chat read different fields and can therefore disagree.

## Evidence

- STATIC — needs live re-verify when MCP + backend restored.
- Code: `AppearanceTab.tsx:133-157`, `authService.ts:472-473`, `useVoice.ts:219-222`, `Index.tsx:252-253`.

## Notes

Specialist: `fix-state-data` (+ possible `fix-backend-api` to consolidate the field). Recommend collapsing onto ONE canonical language field + ONE write path read from a single live source. Net-new relative to WE-20260527-160 (which only covers AuthContext staleness, not the dual-field/silent-failure divergence).

---

_Filed by `qa-state-sync` on `2026-06-01`._
