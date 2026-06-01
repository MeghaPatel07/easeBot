# Marathon Final Brief — 2026-05-28 (Sprints 1+2+3 consolidated)

**Triage agent:** triage-specialist (Opus 4.7, 1M ctx)
**Triaged at:** 2026-05-28T19:30Z
**Marathon scope:** Sprint 1 (188 raw → 158 actionable), Sprint 2 (91 raw → 79 actionable), Sprint 3 (199 raw → see funnel below)
**Authoritative ticket folder:** `/Users/krish/Desktop/easebot/qa-harness/tickets/2026-05-28/`
**Carry-over (yesterday open):** `/Users/krish/Desktop/easebot/qa-harness/tickets/2026-05-27/` — 165 tickets, 12 covered by PRs #32-43

---

## A. HEADLINE

### Sprint 3 funnel

| Stage | Count |
|---|---|
| Raw Sprint-3 tickets on disk (801-811, 851-900, 903-908, 951-1000, 1001-1010, 1051-1100, 1101-1122) | **199** |
| eval-safety planned but BLOCKED (safety classifier failed agent) | (0 filed) |
| Self-marked "no-regression / PASS" status reports (-802, -803, -1111, -1112, -1116, -1121) | **6** |
| Intra-Sprint-3 duplicates collapsed | **3** |
| Sprint-3 dups of Sprint-1 (subsumed by existing root-cause tickets) | **18** |
| Sprint-3 dups of Sprint-2 | **9** |
| Sprint-3 dups of yesterday (2026-05-27) | **2** |
| Sprint-3 covered by in-flight PRs #32-43 (→ `fix_in_review`) | **6** |
| **Net unique Sprint-3 actionable** | **155** |

### Marathon totals (post-dedupe end-to-end)

| Sprint | Actionable (filed in 2026-05-28 batch) | Notes |
|---|---:|---|
| Sprint 1 | 158 | filed earlier today |
| Sprint 2 | 79 | partial sweep |
| Sprint 3 | 155 | this triage |
| **Marathon NEW total** | **392** | unique tickets across all three sprints |
| Yesterday still-open (not in PRs #32-43) | 153 | carry-forward |
| **GRAND TOTAL actionable across QA harness** | **545** | (392 + 153) |

### Severity histogram (Sprint 3 only, post-dedupe)

| Sev | Count | Notable |
|---|---:|---|
| **P0** | **17** | -801 (system-role still open), -804 (pricing still $10), -809 (AuthContext still getDoc), -951 (offline retry), -952 (queued mutations), -956 (1hr token expiry), -961 (wedding date stale), -967 (cross-tab logout), -968 (consent GDPR), -985 (note-draft race), -987 (deleted thread write), -990 (guest quota bypass), -991 (tier upgrade stale), -999 (PaymentSuccess profile stale), -1001 (GDPR erasure no-op), -1101 (LCP regressed to 10s), -1114 (perf PRs not shipped) |
| **P1** | **57** | bulk of state-sync + a11y + perf + edge-security |
| **P2** | **57** | mostly visual/responsive + a11y polish + edge defense-in-depth |
| **P3** | **24** | nits + observability gaps |
| **N/A** (informational / no-regression / PASS) | 6 | -802, -803, -1111, -1112, -1116, -1121 |

### Marathon severity histogram (Sprints 1+2+3 combined)

| Sev | Sprint 1 | Sprint 2 | Sprint 3 | Total |
|---|---:|---:|---:|---:|
| **P0** | 14 | 2 | 17 | **33** |
| **P1** | 47 | 27 | 57 | **131** |
| **P2** | 63 | 34 | 57 | **154** |
| **P3** | 34 | 16 | 24 | **74** |

### Per-specialist queue (Sprint 3 only, post-dedupe)

| Specialist | Count |
|---|---:|
| `fix-backend-api` | 47 |
| `fix-frontend` | 49 (mostly a11y + visual) |
| `fix-state-data` | 38 |
| `fix-performance` | 13 |
| `chairman` (Krish-only) | 4 (-1001 GDPR purge job + 4 strategy items) |
| no-fix (informational) | 4 |

### Marathon per-specialist (Sprints 1+2+3 — load on fix queue)

| Specialist | S1 | S2 | S3 | Total |
|---|---:|---:|---:|---:|
| `fix-backend-api` | 57 | 30 | 47 | **134** |
| `fix-frontend` | 63 | 27 | 49 | **139** |
| `fix-state-data` | 24 | 18 | 38 | **80** |
| `fix-performance` | 14 | 2 | 13 | **29** |

---

## B. TOP 25 PRIORITY QUEUE (P0 → P3, sorted)

| # | ID | Sprint | Title | Sev | Agent | One-liner |
|---|---|---|---|---|---|---|
| 1 | **WE-20260528-011/012/804** | S1+S3 | Pro tier still $10/$79 on FE+BE+state-machine (locked $14.99/$119) | P0 | fix-frontend + fix-backend-api | Revenue leak 33% on every paid initiate; confirmed unchanged for THIRD consecutive sprint |
| 2 | **WE-20260528-202** | S1 | `requireAuth` silently permissive — guest pass-through everywhere | P0 | fix-backend-api | Auth gate is no-op; compounds with CORS |
| 3 | **WE-20260528-248** | S1 | CORS `*` + guest pass-through = drive-by from any origin | P0 | fix-backend-api | Azure quota theft; P0 umbrella |
| 4 | **WE-20260528-001** | S1 | `/api/speech-token` returns Azure JWT without auth | P0 | fix-backend-api | Anonymous attacker drains Azure |
| 5 | **WE-20260528-002** | S1 | SSML injection in `/api/tts` via unsanitized `voiceName` | P0 | fix-backend-api | Attacker chooses voice / leaks errors |
| 6 | **WE-20260528-203** | S1 | `inputSanitizer` skips `history[].content` — control chars reach LLM | P0 | fix-backend-api | Log poisoning + persisted NUL bytes |
| 7 | **WE-20260528-101** | S1 | Vibe mode `forceImageGeneration` 500 — base64 in RegExp constructor | P0 | fix-backend-api | Whole Vibe path broken |
| 8 | **WE-20260528-102** | S1 | Guest-cap error message links to `/signup` — 404 | P0 | fix-frontend | Conversion killer |
| 9 | **WE-20260528-004** | S1 | PayU redirect to `:8080` (dev frontend on `:8081`) — payment callback dies | P0 | fix-backend-api | Every payment lands blank |
| 10 | **WE-20260528-152/809** | S1+S3 | AuthContext.profile loaded ONCE via `getDoc`, NEVER `onSnapshot` (PR #32 not landed) | P0 | fix-state-data | Architectural root for ~25 stale-everywhere bugs (chain: -150, -153, -155, -158, -160, -166, -167, -169, -562, -563, -568, -575, -955, -961, -986, -991, -999) |
| 11 | **WE-20260528-151** | S1 | Nickname change in SettingsModal never reaches AuthContext.profile | P0 | fix-state-data | #1 user complaint; child of -152 |
| 12 | **WE-20260528-301/1101/1114** | S1+S3 | LCP 10.3s on `/chat` — regressed to 10s on prod build; none of Sprint-1 perf PRs landed | P0 | fix-performance | Catastrophic; 4× target |
| 13 | **WE-20260528-251** | S1 | Main chat composer textarea has NO accessible name | P0 | fix-frontend | Primary input invisible to AT; WCAG 4.1.2 A |
| 14 | **WE-20260528-801** | S3 | System-role prompt-injection channel STILL OPEN on main (PR #33 not landed) | P0 | fix-backend-api | Re-re-confirmation; auto-closes when PR #33 merges |
| 15 | **WE-20260528-552/967** | S2+S3 | Multi-tab logout — tab B keeps authed UI / `isHandlingAuth` swallows broadcast | P0 | fix-state-data | Cross-tab signed-out tab still shows auth UI |
| 16 | **WE-20260528-558** | S2 | Tab B never sees new messages — `subscribeToMessages` exists but never called | P0 | fix-state-data | One-line fix in `useChat.ts` |
| 17 | **WE-20260528-951/952** | S3 | Offline → online recovery — sendMessage orphans user-bubble + queued mutations silently fail | P0 | fix-state-data | No retry queue exists |
| 18 | **WE-20260528-956** | S3 | Firebase ID token expires after 1hr; first chat send after returns 401 with no re-auth | P0 | fix-state-data | Long-session UX cliff |
| 19 | **WE-20260528-968** | S3 | AnalyticsConsent banner — Accept in tab A, tab B still shows banner — GDPR liability | P0 | fix-state-data | localStorage + no `storage` event |
| 20 | **WE-20260528-985** | S3 | Note-draft race — two tabs editing same note, second-saver clobbers silently | P0 | fix-state-data | Data loss; compound of S2 -554 |
| 21 | **WE-20260528-987** | S3 | Delete conversation in tab A → tab B sends to removed thread (permission-denied) | P0 | fix-state-data | Cross-tab thread state |
| 22 | **WE-20260528-990** | S3 | Guest quota bypass — `easebot-guest-msg-count` not cross-tab synced → 3 tabs = 3× quota | P0 | fix-state-data | Revenue leak via quota |
| 23 | **WE-20260528-991/999** | S3 | Tier upgrade — Tab B / ProfileMenu still show free tier after PayU webhook | P0 | fix-state-data | "Did my payment go through?" panic; child of -152 |
| 24 | **WE-20260528-1001** | S3 | GDPR Right-to-Erasure NOT implemented — `/api/account/delete` only sets flag | P0 | chairman + fix-backend-api | GDPR Article 17 violation; needs purge job + Krish policy call |
| 25 | **WE-20260528-153/155** | S1 | Voice change + tier change don't reflect (Settings TTS regression / TokenPoolBar stale) | P0 | fix-state-data | Children of -152 |

(Stretch Top 30 — also P0/P1 cluster leaders):
- WE-20260528-302/303/304/1102/1103/1117 — perf bundle/route-split/TipTap/TTI/sharp/prod-score
- WE-20260528-103 — mode enum drift FE/BE
- WE-20260528-405 — inline-edit image attach bypasses 4MB cap (Sprint 2)
- WE-20260528-403/404 — TTS no cache / tone sliders never piped (S2)
- WE-20260528-805 — guest→signup data loss (S3)
- WE-20260528-1051/1053/1054/1055/1056/1063/1067/1078/1082/1086/1095 — a11y P1 cluster (autocomplete/audio-control/reduced-motion/lang/Voice Control)

---

## C. REPEAT OFFENDERS / ROOT-CAUSE CLUSTERS

### Cluster #1 — AuthContext `getDoc`-once snapshot (THE megabug)

**Surfaced framings across all sprints:**
- S0 (yesterday): WE-20260527-170 (origin) — `AuthContext.profile` loaded via `getDoc`, never `onSnapshot`. PR #32 not merged.
- S1: WE-20260528-152 (root), -151 (nickname), -153 (voice), -155 (tier), -104, -166, -167, -168, -169, -158, -159, -160, -161, -173
- S2: -562 (wedding-date countdown), -563 (useUsageStats polling), -568 (useAccount mutations), -574 (TanStack architecture), -575 (onboarding cross-tab)
- S3: -809 (re-re-confirmation), -955 (cross-browser sync), -961 (wedding date in 3 views), -986 (onboarding modal), -991 (tier upgrade tab B), -999 (PaymentSuccess profile), -972 (onIdTokenChanged never subscribed)

**Total ticket count root-caused here: ~27.** Landing PR #32 closes most; the remaining residue (cross-tab via BroadcastChannel — see Cluster #4) is independent.

### Cluster #2 — Cross-tab BroadcastChannel architecture missing

**Framings:**
- S2: -551 (toast view-state), -552 (logout), -553 (BroadcastChannel unused arch), -554 (note race), -555 (theme rollback), -558 (messages), -560 (guest quota), -565 (image ratio), -566 (audio speed), -567 (summarizer clobber), -570 (currency), -571 (PostHog), -573 (remember-me), -575 (onboarding)
- S3: -967 (cross-tab logout), -968 (consent), -971 (BC arch — root architectural), -985 (note race), -987 (deleted thread), -988 (remember-me), -989 (currency), -990 (guest quota), -991 (tier upgrade), -993 (provider linking), -996 (notification badge)

**Total: ~25.** Sprint 2 -553 + Sprint 3 -971 are the architecture-ticket parents; landing a single BroadcastChannel-based sync layer + a `storage` event fallback closes the majority.

### Cluster #3 — Pricing $10/$79 drift (revenue leak, THREE sprints)

**Framings:**
- S1: -011 (FE PRICING_DATA), -012 (BE PRICING table)
- S3: -804 (FE + BE + state-machine simultaneously; THIRD confirmation)

**Total: 3 tickets, ONE root.** No fix-agent has touched it. Memory `project_pricing_rollout.md §6` says locked = $14.99/$119. **This is the single biggest revenue-impact carry-forward.**

### Cluster #4 — Streaming SSE lifecycle / abort semantics

**Framings:**
- S1: -315 (SSE first-token blocker, perf cannot measure) — also S3 -1119 confirmed still open
- S2: -502 (back/forward orphans SSE), -651 (typewriter + role=log conflict)
- S3: -811 (logout doesn't abort), -966 (no keepalive ping), -978 (abort mid-stream — tokens already deducted), -1067 (no "stream complete" SR announcement), -1094 (Voice Control overload)

**Total: 8.** No SSE lifecycle owner. Touches `easebot-backend/src/controllers/chatController.ts` streaming + `Wedding-Ease-Viva-Chat/src/hooks/useChat.ts` AbortController. Fix should land before -301/-302 perf chain.

### Cluster #5 — Auth + CORS + speech-token security triad

**Framings:**
- S1: -001 (speech-token public), -002 (SSML injection), -202 (permissive requireAuth), -203 (history sanitizer skip), -248 (CORS wildcard), -016/-201 (system-role)
- S3: -801 (system-role re-confirm), -1002 (provider enumeration), -1003 (shared note PII), -1004 (X-Forwarded-For spoof), -1006 (feedback impersonation), -1007 (requireStrictAuth fail-open), -1008 (CORS mutation preflight), -1009 (per-process rate limiter), -1010 (raw err.message leak)

**Total: 14 security tickets, mostly one root cluster — "the API does not authenticate the caller / does not authorize the action / leaks raw internals". Needs a security pass owned by Krish before fix-backend ships piecemeal.**

### Honorable mentions (smaller clusters)

- **Cluster #6 — i18n/RTL infrastructure** — S3 -851, -866, -867, -869, -875, -1056, -1070 (7 tickets, all root in `index.html lang="en"` hardcode + zero logical-properties usage; needs i18next setup)
- **Cluster #7 — Empty states & error recovery** — S2 -504, S3 -855, -861, -884, -892, -893, -896, -897, -1058, -1078 (10 tickets, generic "Nothing here" / "Something went wrong" without next-action)
- **Cluster #8 — Reduced-motion + animations** — S1 -266, S3 -1055, -1066, -1076, -1093 (5 tickets, prefers-reduced-motion not respected at JSX/JS layer)

---

## D. ALREADY COVERED BY IN-FLIGHT PRs (#32-#43)

Mark `fix_in_review` — these close automatically when PR merges to Bug-Resolve-claude.

| PR | Closes Sprint-3 ticket(s) | Reason |
|---|---|---|
| **#32** (AuthContext onSnapshot) | **-809** (re-confirm), reduces blast on -955/-961/-986/-991/-999/-972 (still open after merge for cross-tab residue) | Root of Cluster #1 |
| **#33** (drop system role + filter) | **-801** (re-confirm) | Root of S1 -016/-201 prompt-injection |
| **#34** (image empty refund) | **-802** (PASS report — no regression) | Already protected |
| **#35** (content-filter brand-agnostic) | **-803** (PASS report — no regression) | Already protected |
| **#41** (chat stream role=log) | **partially covers -1067** (still need stream-complete announce strategy beyond role=log) | Sprint-2 -651 typewriter conflict is precondition |
| **#42** (visible focus ring) | reduces scope of **-1075** (focus ring 2px/3:1 spec) | Still need WCAG 2.4.12 audit |

PRs #36, #37, #38, #39, #40, #43 close only yesterday's tickets — no Sprint-3 dup.

**Net new actionable after PR-coverage subtraction: 155 - 6 = 149 unique-and-uncovered Sprint-3 tickets.**

---

## E. KRISH-ONLY ITEMS (no fix-agent can ship)

1. **WE-20260528-011/012/804 — Pricing reconciliation (THIRD sprint)** — Confirm $14.99/$119 still locked OR update `project_pricing_rollout` memory. Until you decide, fix-agents will revert each other. **Highest urgency: revenue leak today.**

2. **WE-20260528-1001 — GDPR Right-to-Erasure policy + purge job** — Soft-delete only; no cron purges Firestore data. Article 17 violation. Strategy call: (a) build purge Cloud Function (requires Firebase write you must run), (b) shorten retention to N days, or (c) document risk acceptance. Firestore-rule edit may be needed depending on choice.

3. **Cluster #5 security triad — Auth model decision** — S1 -202/-248/-001 + S3 -1002/-1003/-1004/-1006/-1007/-1008/-1009 all root in "permissive auth + wildcard CORS + leaky errors". Choose: tighten `requireAuth` to reject guests on burn-quota routes, allowlist CORS origins, rotate to JSON error envelope. Will break any guest flow that currently relies on permissive auth. **Needs explicit go-ahead.**

4. **WE-20260528-552/967/985/987/990/991/999 cross-tab cluster — BroadcastChannel adoption** — Architectural decision; either build the BC layer per S2 -553 / S3 -971 OR document acceptance that cross-tab desyncs persist. Touches AuthContext, ThemeContext, useNoteEditor, Index guest counts, PaymentSuccess.

5. **S2 -760 pricing prompt anchor + -767 distress-handling rail** — policy/legal wording for system prompt; carry-forward from Sprint 2.

6. **S3 -1114 perf PRs not shipped** — Sprint 1 perf agent's -301..-315 + S3 -1101..-1122 won't help until fix-performance branches land. Strategy: do you want to batch perf PRs separately on a `perf/sprint-bundle` branch?

**No Firestore-rules edits surfaced this triage.** (Items 2 and 3 may require rule edits depending on direction chosen.)

---

## F. COVERAGE MATRIX (category × sprint)

| Category | S1 | S2 | S3 | Status |
|---|:-:|:-:|:-:|---|
| Functional (chat/contract/regression) | 16 | 10 | 11 | dense — well-covered |
| Visual / Responsive | 23 | 0 | 50 | gap closed in S3 |
| E2E (Playwright) | 10 | 3 | 6 | thin; PayU sandbox still blocked |
| State-sync (single-tab) | 25 | 25 | 50 | very dense; BC arch still missing |
| Edge / Security | 50 | 0 | 10 | S3 backfilled the S2 gap |
| A11y | 32 | 24 | 50 | very dense; covers WCAG 2.2 + Voice Control |
| Performance | 25 | 2 | 22 | dense; prod-vs-dev split now visible |
| Eval-trajectory / Safety | 7 | 28 | **0** | **GAP — eval-safety classifier blocked S3 agent** |

---

## G. COVERAGE GAPS STILL REMAINING

1. **Eval-safety Sprint-3 NOT FILED** — agent errored on safety classifier; needs an eval-trajectory rerun before the next marathon. Sprint-2 -754/-767 distress-handling tickets are still the only baseline.
2. **PayU sandbox end-to-end** — Krish-issued sandbox card + test account needed. -011/-012/-804 pricing fix should land first.
3. **Auth-gated routes (Checklist/Budget/Reminders/Gallery/Timeline/Notifications)** — still blocked since S0. Need test-account credentials.
4. **Vibe / Images-Hub e2e** — blocked by -101 (vibe 500). Once that lands, run full vibe browse → generate → save → share.
5. **Backend `/api/health` from outside dev** — still 404 per S1 -315 / S3 -1119. Blocks SSE measurement.
6. **PostHog payload audit** — S1 -242 surfaced sanitization gap; S3 didn't sweep. Needs full `posthog.capture` call-site audit.
7. **Notes GTM B1/B2/B3/C2/D1/E1/E2** — paused per CLAUDE.md "wait for next from Krish".
8. **Therapist + consultant modes** — commented out per CLAUDE.md; no regression baseline if Krish re-enables.
9. **Authed perf measurement (S3 -1108)** — perf agent could only test unauthed routes. Needs Krish-issued test user for streaming + image gen perf.
10. **Cold-start measurement (S3 -1112)** — can't restart backend without disrupting other agents. Need maintenance window.

---

## H. RECOMMENDED FIX CYCLE ORDER (`/qa-fix-cycle --auto-take-top`)

The first 10 tickets fix-agents should pick up next, in this order. Each is selected for: (a) blast radius, (b) cleanly isolated file scope, (c) no overlap with another in the same batch.

| # | Ticket | Specialist | File scope | Rationale |
|---|---|---|---|---|
| 1 | **WE-20260528-558** | fix-state-data | `src/hooks/useChat.ts` (1-line call) | One-line fix; closes S2 P0; no overlap |
| 2 | **WE-20260528-011/012/804** | fix-frontend + fix-backend-api (paired PR) | `Pricing.tsx:30,53` + `paymentController.ts:42-43` + `subscriptionStateMachine.ts` | Revenue leak; **needs Krish confirmation BEFORE agent runs** (see Krish item #1) |
| 3 | **WE-20260528-552 + WE-20260528-967** (collapse to one) | fix-state-data | `AuthContext.tsx` + `authService.ts:signOutUser` + queryClient.clear() | Multi-tab logout; pairs naturally with -971 BC scaffold |
| 4 | **WE-20260528-202 + WE-20260528-248 + WE-20260528-001** (security triad PR) | fix-backend-api | `requireAuth.ts` + `app.ts` CORS + `speechController.ts` | **Needs Krish go-ahead (Krish item #3)**; after go: single PR to tighten gates |
| 5 | **WE-20260528-101** | fix-backend-api | `imageController.ts` forceImageGeneration regex | Vibe path 500; isolated to one file; unblocks Sprint-2 vibe e2e coverage |
| 6 | **WE-20260528-405** | fix-frontend | Extract `validateChatImage` from `Index.tsx`; apply to 3 inputs in `ChatMessages.tsx` | Sprint-2 P1; no overlap with -552/-558 |
| 7 | **WE-20260528-251** | fix-frontend | `ChatInput.tsx` textarea aria-label | A11y P0; trivial; no overlap |
| 8 | **WE-20260528-102** | fix-frontend | `useChat.ts:829` link + add `/signup` route OR rewrite to `/pricing` | Conversion killer; quick |
| 9 | **WE-20260528-302/303/304** (perf bundle trio) | fix-performance | `vite.config.ts` chunk split + TipTap lazy boundary + Index.tsx route split | Big LCP win; -1101 says regressed to 10s on prod |
| 10 | **WE-20260528-985 + WE-20260528-554** (collapse) | fix-state-data | `useNoteEditor.ts` + BC scaffold from -971 | Note-draft race; sets architecture for Cluster #2 |

After this batch lands, the next 10 should be the remaining cross-tab cluster (-961, -986, -987, -989, -990, -991, -993, -996, -999, -1000) since they all share the BC scaffold from #10.

---

## File pointers

- This brief: `/Users/krish/Desktop/easebot/qa-harness/tickets/2026-05-28/_marathon-final.md`
- Sprint 1 triage: `/Users/krish/Desktop/easebot/qa-harness/tickets/2026-05-28/_triage-summary.md`
- Sprint 2 triage: `/Users/krish/Desktop/easebot/qa-harness/tickets/2026-05-28/_triage-summary-sprint2.md`
- Sprint 3 raw tickets: `/Users/krish/Desktop/easebot/qa-harness/tickets/2026-05-28/WE-20260528-{801..811,851..900,903..908,951..1000,1001..1010,1051..1100,1101..1122}.md`
- Yesterday's open tickets: `/Users/krish/Desktop/easebot/qa-harness/tickets/2026-05-27/` (165, minus 12 covered by PRs #32-43)
- Session handoff: `/Users/krish/.claude/projects/-Users-krish-Desktop-easebot/memory/session_handoff_2026_05_28.md`
