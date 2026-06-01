# Triage Summary — 2026-05-28 (Sprint 2)

**Triage agent:** triage-specialist (Opus, 1M ctx)
**Triaged at:** 2026-05-28T14:30Z
**Sprint:** Sprint 2 of Marathon — partial sweep (session-limit truncation)

---

## Sprint 2 coverage status

**Filed:** 91 tickets across 5 of 8 planned dimensions
**Missing (0 tickets):** visual-responsive-sprint2, edge-cases-sprint2, performance-sprint2 — coverage falls back to Sprint 1 only

| Dimension | Range | Count |
|---|---|---|
| functional-sprint2 | 401–410 | 10 |
| e2e-playwright-sprint2 | 502, 504, 505 (501/503 missing — agent died) | 3 |
| state-sync-sprint2 | 551–575 | 25 |
| a11y-sprint2 | 651–674 | 24 |
| eval-trajectory-sprint2 | 751–778 | 28 |
| visual-responsive-sprint2 | — | 0 (session-limit) |
| edge-cases-sprint2 | — | 0 (session-limit) |
| performance-sprint2 | — | 0 (session-limit) |
| **Total** | | **90 on disk + 1 e2e gap** = 91 expected |

---

## Funnel

| Stage | Count |
|---|---|
| Raw Sprint-2 tickets on disk | **90** |
| After intra-Sprint-2 dedup | **86** (4 intra-dup) |
| After Sprint-1 dedup | **81** (5 against today's 158 actionable) |
| After yesterday-dedup (165 tickets in 2026-05-27) | **80** (1 dup against -162) |
| After in-flight-PR dedup (PRs #32-#43) | **79** (1 partly covered by #41) |
| **Net unique Sprint-2 actionable** | **79** |

Plus 1 self-marked "verified-clean" (-559) reported for completeness.

---

## Intra-Sprint-2 duplicates collapsed

| Duplicate | Canonical | Reason |
|---|---|---|
| WE-20260528-556 | WE-20260528-552 | both multi-tab logout — -552 has the broader symptom; -556 has the queryClient.clear() fix detail. Merge into -552 with -556 notes appended |
| WE-20260528-572 | WE-20260528-555 | both ThemeContext offline rollback — -555 is the root, -572 the symptom path |
| WE-20260528-768 | WE-20260528-753 | both religion-ranking — -753 is the parent eval gap, -768 the concrete repro |
| WE-20260528-559 | _verified-clean_ | self-demoted by reporter (pin/archive/tag sync passes) — skip queue |

## Sprint-1 dedup (today's 158 actionable)

| Sprint-2 ticket | Same root as | Sprint-1 ID | Action |
|---|---|---|---|
| WE-20260528-562 | wedding date countdown stale | WE-20260528-152 (parent: AuthContext getDoc) | mark `subsumed-by` — resolves automatically |
| WE-20260528-563 | useUsageStats 60s polling — tier badge stale | WE-20260528-155 / -160 | mark `subsumed-by` — same root |
| WE-20260528-568 | useAccount mutations don't propagate to AuthContext | WE-20260528-152 | mark `subsumed-by` |
| WE-20260528-574 | TanStack Query architecture mismatch | WE-20260528-152 (architectural parent) | keep as separate architecture ticket — broader scope |
| WE-20260528-575 | onboarding flag stale cross-tab | WE-20260528-152 | mark `subsumed-by` |
| WE-20260528-651 | typewriter + role=log interaction | depends-on WE-20260527-251 (PR #41) | keep (extends -251 with mitigation strategy) |
| WE-20260528-764, -765, -766 | tone slider extension cases | WE-20260528-353 / WE-20260527-353 (slider eval) | keep — each calls out a specific slider |

## Yesterday dedup (2026-05-27/165 tickets)

| Sprint-2 | Same as | Action |
|---|---|---|
| WE-20260528-555 | WE-20260527-162 (ThemeContext fire-and-forget — already triaged) | mark `dup-of` — yesterday's exists but not yet in any PR — keep as regression-confirm |

## PR coverage (PRs #32-#43)

| Sprint-2 | PR | Action |
|---|---|---|
| WE-20260528-651 | partly covered by PR #41 (role=log for -251) | keep — Sprint 2 adds typewriter mitigation; reviewer of #41 should pair |
| (none others overlap PR #32-43 directly) | | |

---

## Severity breakdown (post-dedup)

| Sev | Count |
|---|---|
| **P0** | **2** (552 multi-tab logout, 558 messages not syncing cross-tab) |
| **P1** | **27** |
| **P2** | **34** |
| **P3** | **16** |
| **Total** | **79** |

Reporter recalibrations (overriding self-assigned sev):
- WE-20260528-403 (TTS no cache): kept at P1 (revenue + perf, but not user-blocking)
- WE-20260528-404 (tone-slider has zero effect): kept at P1 (contract violation, UI lies to user)
- WE-20260528-405 (image cap missed in inline-edit): kept at P1 (security/perf, partial-fix gap)
- WE-20260528-406 (HEIC silent fail): kept at P1 (iOS users blocked silently)
- WE-20260528-553 (BroadcastChannel unused): kept at P2 (architectural, not user-facing)
- WE-20260528-554 (note draft race): kept at P1 (silent data loss = high impact)
- WE-20260528-651 (typewriter + live-region): kept at P1 (blocks -251 fix landing safely)
- WE-20260528-754 (image trauma sensitivity): kept at P1 (brand-risk if leaked)
- WE-20260528-756 (system-prompt extraction): kept at P1 (security defense-in-depth)
- WE-20260528-760 (pricing manipulation): kept at P1 (revenue + brand)
- WE-20260528-767 (cheat/abuse empathy gap): kept at P1 (catastrophic blast radius if viral)
- WE-20260528-773 (currency conversion hallucination): kept at P1 (couples make budget decisions on bad data)
- WE-20260528-778 (tool error not handled): kept at P1 (agentic loop quality core)
- WE-20260528-565, -566, -569, -571, -573 (cross-tab P3 minor LS keys): kept at P3

---

## Per-specialist queue length

| Specialist | Count |
|---|---|
| `fix-frontend` | **27** (mostly a11y 651-674 + state-sync UI patches) |
| `fix-backend-api` | **30** (functional 401-410 + most eval-trajectory 751-778) |
| `fix-state-data` | **18** (state-sync 551-575 + e2e 502/504/505) |
| `fix-performance` | **2** (-403 TTS cache, -409 checklist count perf) |
| **chairman / Krish-only** | **2** (-760 pricing prompt anchor needs product confirm, -767 distress-handling rail needs policy call) |

No Firestore-rule edits surfaced this sprint.

---

## TOP 15 NEW (non-dup) findings — sorted P0 → P1 (oldest first within sev)

| # | ID | Title | Sev | Agent |
|---|---|---|---|---|
| 1 | WE-20260528-552 | Multi-tab logout — tab B keeps authed UI for 5-10s | P0 | fix-state-data |
| 2 | WE-20260528-558 | Tab B never sees new chat messages in same conversation — `subscribeToMessages` exists but never called | P0 | fix-state-data |
| 3 | WE-20260528-405 | Inline-edit image attach has NO 4MB cap — bypasses -220 fix in two more file inputs | P1 | fix-frontend |
| 4 | WE-20260528-406 | HEIC photo silently accepted, Azure GPT-4o rejects — iOS users get model "ignores" photo | P1 | fix-frontend |
| 5 | WE-20260528-403 | TTS server has zero caching — every Volume2 click bills Azure Speech | P1 | fix-performance |
| 6 | WE-20260528-404 | Tone sliders saved to Firestore but never piped to SSML — UI lies about voice personalization | P1 | fix-backend-api |
| 7 | WE-20260528-408 | LLM has no `delete_reminder` / `update_reminder` / recurrence — "delete it" hallucinates success | P1 | fix-backend-api |
| 8 | WE-20260528-502 | Browser back/forward mid-stream orphans SSE, partial assistant message vanishes | P1 | fix-state-data |
| 9 | WE-20260528-504 | "Something went wrong" has no retry/resend affordance | P1 | fix-frontend |
| 10 | WE-20260528-554 | Note draft race — two tabs, last-writer-wins silent data loss | P1 | fix-state-data |
| 11 | WE-20260528-560 | Guest msg/img counts not synced cross-tab — open 5 tabs = 5× quota bypass | P1 | fix-state-data |
| 12 | WE-20260528-567 | Conversation summarizer can drop in-flight user messages via setMessages clobber race | P1 | fix-state-data |
| 13 | WE-20260528-570 | Currency override cross-tab — pricing shows wrong currency in tab B | P1 | fix-state-data |
| 14 | WE-20260528-651 | aria-live + TypewriterMarkdown char-by-char = SR garble or silence — blocks PR #41 | P1 | fix-frontend |
| 15 | WE-20260528-754 | Image gen for grief prompts ("late grandmother at wedding") gets Pinterest-aspirational suffix | P1 | fix-backend-api |

Honorable mentions just under (also P1):
- WE-20260528-410 (summarizer silent fallback + role=assistant smell)
- WE-20260528-655 (mode-switch no SR announcement; partial overlap with -263)
- WE-20260528-664 (voice recording state transitions silent for SR)
- WE-20260528-756 (system-prompt extraction via "repeat above")
- WE-20260528-760 (pricing manipulation — needs Krish policy call)
- WE-20260528-767 (cheat/abuse empathy-first gap)
- WE-20260528-773 (currency conversion hallucinated — exchangeRateService unused)

---

## Coverage analysis — what Sprint 2 added that Sprint 1 did NOT have

Sprint 1's 158 actionable tickets covered: security (auth/CORS/SSML), pricing revenue leak, perf (LCP/bundle), state-sync within ONE tab (AuthContext getDoc), basic a11y (axe sweep + WCAG A/AA basics), eval-trajectory single-turn (system-prompt injection, mode enum, named vendors, basic guardrails).

**Sprint 2 NEW surface area:**

1. **Cross-tab everything (25 tickets in 551-575)** — Sprint 1 only had single-tab state sync. Sprint 2 systematically swept: every localStorage key, every Firestore read, BroadcastChannel architecture absence, multi-tab logout (P0), cross-tab message sync (P0), draft races, currency, theme, consent, onboarding, quota bypass. **Whole new dimension Sprint 1 didn't touch.**

2. **Deeper a11y beyond axe basics (24 tickets in 651-674)** — Sprint 1 had axe-rule-driven WCAG A/AA findings (labels, contrast). Sprint 2 went into **interaction-pattern a11y**: streaming live-region + typewriter conflict (-651), tool-call announcements (-653), image-gen completion (-652/654), keyboard 2D grid nav (-668), route-change focus management (-656), reduced-motion infinite-animation gaps (-673), prefers-* + Sonner theme bug (-658). **Higher rung of the a11y ladder.**

3. **Behavioral / agentic eval (28 tickets in 751-778)** — Sprint 1 found 7 eval issues (357 enum, 354 mode, 355 input cap, 352 named vendors). Sprint 2 added **systematic behavioral coverage**: cross-mode hand-off gaps (751/752), neutrality (753/768/769), sensitivity rails (754/767), system-prompt extraction (756), language continuity (758/763), multi-turn memory drift (761), mood persistence (762), missing tools (772 calc, 773 currency, 408 reminder CRUD), chaos suite (774-778), pricing-anchor (760). **Whole behavioral dimension that Sprint 1 only scratched.**

4. **Real e2e flow scenarios (3 of expected 6)** — Sprint 1's "e2e" was actually mostly contract testing. Sprint 2 added scenario-driven walks: back-button-mid-stream (-502), recovery copy (-504), image round-trip (-505). The 2 missing tickets (-501, -503) likely covered the multi-step PayU walk and the planner-mode tool-result rendering.

5. **Functional contract verification of WE-20260527 fixes** — Sprint 2 used the brief to *verify* the WE-20260527-220 fix and found two more uncovered file inputs (-405). Same for documentation drift (PRD-TTS-Pipeline vs real code in -401).

---

## Recommendation for Sprint 3 focus

Sprint 2 had 3 dimension gaps (visual-responsive, edge-cases, performance) AND went DEEPER on the other 5. So Sprint 3 should:

### Must-cover (Sprint 2 didn't reach)
1. **visual-responsive Sprint 2 sweep** — still on Sprint 1 baseline. Need fresh runs at iPhone SE, iPad Mini portrait, Galaxy Fold, ultrawide. Add dark-mode + RTL pass (Hindi/Tamil locales).
2. **edge-cases Sprint 2** — Sprint 1's edge-cases-qa filed 50 tickets (201-250) all security-heavy. Sprint 2 should hit input-edge cases: paste 50KB markdown, paste images of various MIMEs, emoji bombing, RTL+LTR mix, surrogate-pair characters, very-long URLs in text, paste from Word/Pages with smart quotes.
3. **performance Sprint 2** — Sprint 1 perf agent's tickets (301-325) are largely *unfixed*. Need Sprint 3 to re-baseline AFTER fix-performance has worked through 301-304. Add INP/CLS Real-User-Monitoring once instrumentation lands.

### Should-cover (under-covered or paused)
4. **PayU sandbox end-to-end** — still blocked from Sprint 1. Need Krish-issued sandbox card + a test-account to walk `/pricing → /checkout → PayU sandbox → return → /payment/success`. Pair with -011/-012 pricing fix landing.
5. **Auth-gated routes (Checklist/Budget/Reminders/Gallery/Timeline/Notifications)** — still blocked from Sprint 1; needs test-account credentials.
6. **Vibe/Images-Hub end-to-end** — blocked by -101 (vibe 500). Once that PR lands, run the full vibe browse→generate→save→share walk.
7. **Backend `/api/health` endpoint** — still 404 from Sprint 1 (WE-20260527-315). Blocks SSE/image perf measurement.
8. **PostHog payload audit** — Sprint 1 surfaced -242 (script tag in event payload). Sprint 2 didn't audit; Sprint 3 should run a full `posthog.capture` call-site sweep.
9. **Notes GTM B1/B2/B3/C2/D1/E1/E2** — Krish hasn't said "next" so no QA yet.

### NEW area Sprint 3 should add (Sprint 2 brief didn't cover)
10. **Chaos engineering broader** — Sprint 2 hit chaos-eval (774-778) but only on chat path. Sprint 3: chaos on TTS path (Azure 429), image path (Azure GPT-Image 429), Firestore network-loss, slow-3G hold-mode UX, websocket disconnect mid-stream.
11. **Tool-error recovery loop** — Sprint 2 -778 surfaced the gap. Sprint 3 should build a `qa-tool-recovery` agent to systematically inject failures into each plannerTools handler.
12. **Cross-mode contract** — Sprint 2 -751/-752 found planner↔stylist hand-off gap. Sprint 3 should also cover stylist↔knowledge, planner↔image, image↔chat hand-offs.

### Krish-only / strategy items for Sprint 3 entry
- Confirm pricing anchor copy for prompt insertion (-760)
- Approve distress-handling rail wording (-767) — legal/policy implications
- Decide retention for messages stored with `originalLanguage` field (-763) — schema change

---

## Take-next recommendation

`/qa-fix-cycle --auto-take-top` should grab **WE-20260528-558** first — it's a P0 with a one-line fix (`subscribeToMessages` exists and is exported, just never called from `useChat.ts`). Single-file edit in `Wedding-Ease-Viva-Chat/src/hooks/useChat.ts`. Verifies cleanly. Closes the most-painful Sprint-2 finding immediately.

Then **WE-20260528-552 + WE-20260528-556** (collapse-to-one) — multi-tab logout. Touches `AuthContext.tsx` + `authService.ts:signOutUser` + `queryClient.clear()` injection. Pairs cleanly with -558 since both fix state-sync architecture.

Run those two state-data PRs in parallel with **WE-20260528-405** going to fix-frontend (extract `validateChatImage` utility from `Index.tsx`, apply to all 3 file inputs in `ChatMessages.tsx`). Three concurrent PRs with no overlapping files.

After those land, take **WE-20260528-651** because it BLOCKS PR #41 from being merged safely — the live-region wrapping needs the typewriter mitigation strategy first or SR users get garble.
