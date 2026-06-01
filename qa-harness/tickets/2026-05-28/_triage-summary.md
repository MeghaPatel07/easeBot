# Triage Summary — 2026-05-28

**Triage agent:** triage-specialist (Opus, 1M ctx)
**Triaged at:** 2026-05-28T12:30Z
**Sprint:** Sprint 1 of Marathon (Megha's QA squad day-2 sweep)

---

## Headline numbers

| Metric | Count |
|---|---|
| Raw tickets filed today | **188** |
| Self-marked duplicates (070, 071, 073, 261, 273, 278, 269, 201) | **8** |
| Intra-Sprint-1 duplicates collapsed (today vs today) | **9** |
| Already covered by in-flight PRs (#32–#43) → `fix_in_review` | **7** |
| Re-confirmations of yesterday's known bugs (no fix-PR yet) → `regression-check` | **6** |
| **Unique, actionable tickets in queue** | **158** |

### Severity breakdown (after dedup + PR-coverage subtraction)

| Sev | Count | Notable |
|---|---|---|
| **P0** | **14** | revenue (pricing $10 vs $14.99), auth-bypass, SSML injection, CORS+guest, profile-sync, LCP 10.3s |
| **P1** | **47** | bundle size, render-blocking, Google btn dark mode, focus rings, share-PII, planner cap |
| **P2** | **63** | mostly UX/a11y polish, edge-cases, contract drift |
| **P3** | **34** | nits / minor schema / over-broad inputs |

### Per-reporter

| Reporter | Filed | Avg sev |
|---|---|---|
| `qa-functional-megha` (001–016) | 16 | mostly P0/P1 — strong findings |
| `qa-visual` (051–073) | 23 | P2/P3 — visual/responsive sweep |
| `qa-e2e-playwright` (101–110) | 10 | P0/P1 — flow-level |
| `state-sync-qa` (151–175) | 25 | P0/P1 — many caused by AuthContext cache |
| `edge-case-qa` (201–250) | 50 | P0–P3 mixed; security-heavy |
| `a11y-qa` (251–282) | 32 | P0–P3 WCAG findings |
| `qa-performance` (301–325) | 25 | P0/P1 — perf regressions |
| `eval-trajectory` (351–357) | 7 | P1/P2 — model behavior |

### Per fix-specialist queue length (excluding PR-covered)

| Specialist | Queue |
|---|---|
| `fix-frontend` | **63** |
| `fix-backend-api` | **57** |
| `fix-state-data` | **24** |
| `fix-performance` | **14** |
| `chairman` (Krish-only) | **0 firestore-rule, but 5 strategy items below) |

---

## 🚨 In-flight PR coverage (collapse — do NOT re-assign)

Sprint-1 agents independently rediscovered bugs already in Sprint-0 PRs. Mark these `status: fix_in_review`, add note "covered by PR #NN":

| Today ID | Same bug as | PR | Action |
|---|---|---|---|
| `WE-20260528-016` | `WE-20260527-211` (system-role injection) | **#33** | merge PR → close 016 |
| `WE-20260528-201` | `WE-20260527-211` (system-role injection) | **#33** | merge PR → close 201; also dup-of-016 |
| `WE-20260528-204` | `WE-20260527-220` (10MB cap) | **#40** | merge PR → close 204 |
| `WE-20260528-261` | `WE-20260527-256` (focus ring contrast) | **#42** | merge PR → close 261 |
| `WE-20260528-273` | `WE-20260527-251` (chat aria-live / role=log) | **#41** | merge PR → close 273 |
| `WE-20260528-278` | `WE-20260527-252` (Login htmlFor/labels) | _open_ | needs PR — NOT in #32-43 batch |
| `WE-20260528-269` | `WE-20260527-253` (Index h1 hierarchy) | _open_ | needs PR — NOT in #32-43 batch |

> Note: 278 and 269 are regression-checks of yesterday's known bugs but no PR was opened. Keep these in the fix queue as `regression-check`, NOT `fix_in_review`. They block on a real fix.

---

## Intra-Sprint-1 duplicates collapsed (canonical chosen by detail)

| Duplicate | Canonical | Reason |
|---|---|---|
| `WE-20260528-009` | `WE-20260528-206` | both textarea maxLength; -206 has line-num + paste step |
| `WE-20260528-008` | `WE-20260528-208` | both Express HTML 404; -208 has explicit code expectation |
| `WE-20260528-015` | `WE-20260528-248` | both CORS+guest pass-through; -248 written as P0 umbrella |
| `WE-20260528-007` | `WE-20260528-103` | both mode-enum drift; -103 has FE+BE+stream/non-stream cross-check |
| `WE-20260528-354` | `WE-20260528-103` | same enum drift (eval-trajectory rediscovered) |
| `WE-20260528-209` | `WE-20260528-357` | malformed-JSON 500-instead-of-400 (-357 has eval evidence) |
| `WE-20260528-104` | `WE-20260528-151` | nickname not visible — -151 has AuthContext root cause |
| `WE-20260528-166` | `WE-20260528-151` | AccountTab reset stale — same profile cache |
| `WE-20260528-167` | `WE-20260528-151` | ChatSidebar profile row stale — same root cause |
| `WE-20260528-168` | `WE-20260528-152` | SettingsModal bypass useAccount; same getDoc-once root |

> WE-20260528-006 (planner 15 items) is a re-confirm of WE-20260527-350; keep as `regression-check`, NOT collapsed (yesterday's ticket is still open).

---

## TOP 20 P0/P1 in priority order

| # | ID | Title | Sev | Assigned | Why-it-matters |
|---|---|---|---|---|---|
| 1 | **WE-20260528-011** | Pricing FE: Pro = $10/$79 instead of locked $14.99/$119 | P0 | fix-frontend | **Revenue leak today** — every PayU initiate undercharges 33% |
| 2 | **WE-20260528-012** | Pricing BE: paymentController PRICING table has $10/$79 | P0 | fix-backend-api | Companion to 011; ship as one PR or pricing drifts again |
| 3 | **WE-20260528-202** | `requireAuth` is silently optional auth — guest pass-through everywhere | P0 | fix-backend-api | Whole "auth gate" is a no-op. Compounds with CORS finding |
| 4 | **WE-20260528-248** | CORS `*` + guest pass-through = drive-by chat from any origin | P0 | fix-backend-api | Azure quota theft via XSS-style iframe. P0 umbrella |
| 5 | **WE-20260528-001** | `/api/speech-token` returns Azure JWT with NO auth | P0 | fix-backend-api | Anonymous attacker drains Azure Speech tier; subscription IDs in payload |
| 6 | **WE-20260528-002** | SSML injection in `/api/tts` via unsanitized `voiceName` | P0 | fix-backend-api | Attacker chooses voice / leaks vendor errors |
| 7 | **WE-20260528-203** | `inputSanitizer` skips `history[].content` — control chars reach LLM | P0 | fix-backend-api | NUL bytes + ANSI escapes persisted; log-poisoning |
| 8 | **WE-20260528-101** | Vibe mode `forceImageGeneration` returns 500 — base64 PNG in RegExp constructor | P0 | fix-backend-api | Entire Vibe / Images-Hub path broken |
| 9 | **WE-20260528-102** | Guest-cap error message links to `/signup` — route 404s | P0 | fix-frontend | Every guest who hits cap dead-ends. Conversion killer |
| 10 | **WE-20260528-004** | PayU return redirects to `:8080` — dev frontend on `:8081`; payment callback dies | P0 | fix-backend-api | Every payment completion lands on blank page in dev |
| 11 | **WE-20260528-005** | `authflow.md` documents routes/files that don't exist | P0 | fix-frontend | Verification-email deep links 404; docs/code drift |
| 12 | **WE-20260528-301** | LCP 10.3s on `/chat` — fails Core Web Vitals (4× target) | P0 | fix-performance | Catastrophic; bounce rate / SEO impact |
| 13 | **WE-20260528-151** | Nickname change in SettingsModal never reaches AuthContext.profile | P0 | fix-state-data | Krish's #1 complaint; umbrella for 104/166/167 |
| 14 | **WE-20260528-152** | AuthContext.profile loaded ONCE via getDoc — no listener, no cross-tab sync | P0 | fix-state-data | Architectural; umbrella for 168 + 153 + 155 + 173 |
| 15 | **WE-20260528-153** | Voice change in Settings doesn't affect next TTS (profile cache + Firestore-only) | P0 | fix-state-data | TTS regression after every settings save |
| 16 | **WE-20260528-155** | Tier change in Firestore not reflected in TokenPoolBar / ProfileMenu | P0 | fix-state-data | Post-upgrade UI shows free tier; user thinks payment failed |
| 17 | **WE-20260528-251** | Main chat composer textarea has no accessible name | P0 | fix-frontend | Primary input invisible to AT users; WCAG 4.1.2 A |
| 18 | **WE-20260528-302** | Vendor chunk 324KB gzipped (1.2MB raw) — exceeds 200KB target | P1 | fix-performance | Drives LCP across all routes |
| 19 | **WE-20260528-303** | `Index.js` route bundle 1.3MB / 354KB gz, 250KB unused on `/chat` | P1 | fix-performance | The big monolith (1668 lines) — code-split before perf wins land |
| 20 | **WE-20260528-304** | TipTap NoteEditor (504KB raw) eagerly loaded on `/chat`, 90% unused | P1 | fix-performance | Lazy-load — biggest single win |

---

## Other P0/P1 not in top-20

- WE-20260528-054 (Google btn dark mode invisible — P1, fix-frontend)
- WE-20260528-056 (secondary buttons invisible in dark — P1, fix-frontend)
- WE-20260528-105 (dual write paths: SDK + REST race — P1, fix-state-data)
- WE-20260528-106 (sharedChats has no revoke API + persists guest PII — P1, fix-backend-api)
- WE-20260528-108 (image-gen 47–55s p50 with no progress — P2 BE / P1 UX-perf, fix-performance)
- WE-20260528-109 (guest cap is localStorage-only — incognito bypass — P1, fix-backend-api)
- WE-20260528-014 (InvitePartner lies "email sent" + /invite 404 — P1, fix-frontend)
- WE-20260528-103 (mode enum drift FE/BE/strict-vs-permissive — P1, fix-backend-api)
- WE-20260528-013 (PRD-TTS docs Gemini, code is Azure — P1, fix-backend-api)
- WE-20260528-006 (planner 15 items vs 3-5 cap; regression-check of 27-350 — P1, fix-backend-api)
- WE-20260528-156–161, 167, 175 (state-sync long tail — mostly P1, fix-state-data)
- WE-20260528-256, 257, 260, 262, 265, 275, 276, 281, 282 (a11y P1, fix-frontend)
- WE-20260528-305, 308, 310, 311, 312, 313, 314, 316, 321, 325 (perf P1, fix-performance)
- WE-20260528-352 (model recommends named luxury resorts — P1, fix-backend-api)
- WE-20260528-355 (no input-length cap on `message` — P1, fix-backend-api)

---

## Top 5 Krish-only / strategy items (no fix-agent can ship these)

1. **WE-20260528-011/012 — Pricing reconciliation** — Need product confirmation that $14.99/$119 is still the locked Pro price, NOT $10/$79 as currently shipped. If $10 is intentional and memory is stale, update `project_pricing_rollout` first. **Otherwise fix-agents will revert each other.**

2. **WE-20260528-202 + WE-20260528-248 + WE-20260528-001 — Auth model decision** — Three findings all root in "requireAuth is permissive + CORS is wildcard + speech-token is public". Choose: (a) tighten requireAuth to reject guests on the burn-quota routes (chat/tts/transcribe/speech-token/generate-image), AND/OR (b) tighten CORS allowlist. Both recommended. Needs explicit go-ahead because it will break any guest flows that rely on permissive auth.

3. **WE-20260528-005 + WE-20260528-013 + WE-20260528-007 — Documentation source-of-truth** — `authflow.md`, `PRD-TTS-Pipeline.md`, `CLAUDE.md "Active modes"` all describe non-existent or wrong code. Strategy call: rewrite docs to match running code, or revert code to match docs? fix-agents will rewrite docs by default — confirm that's desired.

4. **WE-20260528-106 — Shared-chat retention & PII policy** — sharedChats persists guest PII to a public-read collection with no revoke API and no TTL. Strategy call: (a) add TTL + revoke endpoint, (b) require auth before share, or (c) document acceptance of the privacy posture. Firestore-rule edits likely needed for (a)/(b) — Krish-only.

5. **WE-20260528-301 + 302 + 303 + 304 — Perf budget owner** — LCP 10.3s on chat needs a coordinated fix across vendor chunk split, route-level code-split, TipTap lazy-load, and PostHog defer. fix-performance can land patches but the BUDGET (target LCP, target chunk sizes, acceptable INP) needs Krish to set. Suggested: LCP ≤3s by EOD next sweep, vendor ≤200KB gz, TipTap behind lazy boundary.

**No Firestore-rules edits** are in today's queue. (Item 4 may require one if (a)/(b) chosen.)

---

## Coverage gaps — suggested Sprint 2 focus

Sprint 1 under-covered these areas; Sprint 2 should target:

1. **Auth-gated routes still unreachable as guest** (rolled over from yesterday's WE-20260527-049 — Checklist CRUD, Budget, Reminders, Gallery, Timeline, Notifications). Need Krish-issued test-account credentials before next sweep can exercise them.

2. **PayU sandbox round-trip end-to-end** — today's WE-20260528-004 caught the dev redirect bug via curl, but no agent walked a *real* sandbox transaction from `/pricing → /checkout → PayU sandbox → return → /payment/success`. Sprint 2 should run that flow once 004/011/012 land.

3. **No `prefers-reduced-motion` global audit** — a11y-qa filed one ticket (266) but didn't sweep across all `animate-*` Tailwind utilities. Multiple non-chat pages and EmptyState mascot use ping/spin animations.

4. **PostHog event correctness** — WE-20260528-242 (script tag echoed in event payload) hints that capture-side sanitization is weak. Sprint 2 should run a payload audit on ALL `posthog.capture(...)` call sites.

5. **Image-gen latency baseline** (WE-20260528-108) — 47–55s is unacceptable; needs backend log access. Ask Krish to dump `easebot-backend` stdout around an image-gen request so root cause can be filed.

6. **Backend `/api/health` still 404** (yesterday's WE-20260527-315) — blocks SSE/image perf measurement. Sprint 2 will continue to be blind here until shipped.

7. **No INP / web-vitals telemetry** — perf agent could only estimate INP from synthetic profiling. Yesterday's WE-20260527-312 (instrumentation) is unfixed; ship before Sprint 3.

8. **Vibe / Images-Hub end-to-end blocked** by WE-20260528-101 — currently 500s; once fixed, Sprint 2 should run the full vibe flow (browse → select → generate → save → share).

9. **Notes GTM B1/B2/B3/C2/D1/E1/E2 items** — paused per CLAUDE.md "Wait for explicit next from Krish". No QA was run against them today.

10. **Therapist + consultant modes** — currently commented out per CLAUDE.md. If Krish plans to re-enable, Sprint 3 should baseline now so regressions are visible.

---

## Take-next recommendation

`/qa-fix-cycle --auto-take-top` should grab **`WE-20260528-011` + `WE-20260528-012`** as a paired PR.

Rationale: revenue leak today, source-of-truth pricing memory exists, change is two-file constant edit (FE PRICING_DATA + BE PRICING table), unit-testable against `payuHash.test.ts` fixture (`1299.00` INR = $14.99 × ~86). Fix in one PR so the two never drift again.

After 011/012: take **WE-20260528-202** (auth bypass — root cause of half the security queue), then 248 (CORS), then 001 (speech-token), then 101 (vibe 500). The state-sync P0s (151/152/153/155) can go to `fix-state-data` in parallel since they touch only `Wedding-Ease-Viva-Chat/src/contexts/AuthContext.tsx` + hook files; no overlap with the backend security work.

