# Decision-Clearing Marathon — 2026-06-01

Chairman: Krish. Mode: decision-clearing (chosen over fix-execute because 69 PRs unmerged + backlog decision-gated).
Branch base for any dispatched agent: **fresh `origin/Bug-Resolve-claude`** (local stale branch + staged dupes left untouched).

Legend: ✅ ruled · ⏳ pending · 🚫 not agent-executable even after ruling (needs your manual step)

---

## Round 1 (ruled)

| # | Item | Ruling | Becomes executable? | Dispatch |
|---|---|---|---|---|
| 1 | Pricing $10/$79 vs locked $14.99/$119 (-011/-012/-804) | **Keep locked $14.99/$119** — fix the code drift | ✅ yes | paired fix-frontend + fix-backend-api PR: correct PRICING_DATA.ts, backend PRICING table, subscription state machine |
| 2 | Auth model fail-open (-202, -1007) | **Fail-closed on burn/sensitive routes**; preserve guest only via dedicated guest-session path; requireStrictAuth fails CLOSED | ✅ yes | fix-backend-api (umbrella; also frames -001/-248/-1006) |
| 3 | BC-ARCH cross-tab sync (~25 children) | **Thin BroadcastChannel + localStorage-event fallback**, no new dep | ✅ yes | fix-state-data builds layer, then ports children (separate wave after layer lands) |
| 4 | GDPR Art. 17 purge (-1001) | **Risk-accept + document** | ✅ doc only | I write a risk-acceptance note; no code, no Cloud Function |

## Round 2 (ruled)

| # | Item | Ruling | Becomes executable? | Dispatch |
|---|---|---|---|---|
| 5 | CORS wildcard (-248/-1008) | **Env-driven allowlist** (ALLOWED_ORIGINS, defaults localhost:8081 dev; you set prod in .env) | ✅ yes | folds into the auth/security fix-backend-api PR |
| 6 | speech-token anon JWT (-001) | **Scope to valid auth/guest-session, short TTL** — keeps guest TTS, kills anon theft | ✅ yes | fix-backend-api |
| 7 | Hardening bundle (-1002/-1003/-1006/-1010/-1004) | **Approve all w/ defaults**: opaque auth errors · /share PII scrub (drop ownerEmail+lastEditedBy) · feedback authed-only · {code,message} envelope · trust-proxy via env(default 1). **-1009 Redis deferred (infra)** | ✅ yes (−1009 🚫 infra) | fix-backend-api (one PR) |
| 8 | PERF-BATCHING | **Single perf/sprint-bundle branch** off fresh origin; re-measure once | ✅ yes | fix-performance assembles bundle; you merge as one unit |

## Round 3 (ruled)

| # | Item | Ruling | Becomes executable? | Dispatch |
|---|---|---|---|---|
| 9 | Prompt wording -760/-767 | **Draft conservative wording, flag needs-review** — strip hard-coded prices (→ pricing page), tighten distress rail (encourage professional help, no therapist persona). PR opened but NOT auto-merged | ✅ draft only | fix-backend-api; you approve final copy before merge |
| 10 | RTL -851 | **Decompose into per-component tickets, defer build until GTM confirmed** | ⏳ tickets only | I file shovel-ready RTL tickets; no build until you confirm UAE/Saudi |
| 11 | PaymentFailure -1078 | **Generic graceful + Help link** (no PayU-code guessing) | ✅ yes | fix-frontend |
| 12 | Dual write-paths -105 | **Draft canonical-write-path design for approval first** | ⏳ design gate | fix-backend-api + fix-state-data draft proposal; dispatch impl after your sign-off |

## Round 4 (ruled)

| # | Item | Ruling | Becomes executable? | Dispatch |
|---|---|---|---|---|
| 13 | -888 GSTIN misfile | **Close misfiled** (GSTIN is correct, 15-char by law) **+ file new phone-field ticket** | ✅ close + new ticket | I close -888, file phone-field ticket; build deferred to your go-ahead |
| 14 | Placeholders -001/-016/-204 | **Abandon + clean up** | ⚠️ partial | -204 removed (clean). **-001/-016 had UNCOMMITTED WIP** — saved to `qa-harness/abandoned-worktree-wip/*.patch`, worktrees kept pending your look (see note below) |
| 15 | ESLINT-FUNCTIONS | **Scope ESLint to src/ only** | ✅ yes | fix-frontend (small config PR) |
| 16 | Vibe-copy -1098/-1057 | **Keep terms + add inline tooltip/glossary** | ✅ yes | fix-frontend |

---

## ⚠️ Placeholder-cleanup deviation (needs your eyes)
You approved abandoning -001/-016/-204 on the basis they had **zero commits**. True for commits — but -001 and -016 carried **uncommitted working-tree edits** that force-remove would have destroyed:
- `fix-WE-20260527-001`: `.env.example`, `src/lib/analytics.ts`, `vite.config.ts` (analytics/build config WIP)
- `fix-WE-20260527-016`: `useChat.ts`, `Index.tsx`, `types/index.ts`, `chatController.ts`, `schemas/chat.ts` (a chat-feature WIP)

I saved both as patches (`qa-harness/abandoned-worktree-wip/`) and **left the worktrees standing**. -204 (clean) was removed. Say "discard 001/016" once you've confirmed the WIP is junk and I'll remove them; the patches make it recoverable either way.

---

## Dispatch plan (executing now, off fresh `origin/Bug-Resolve-claude` @ bf1e3a8)

**PR-producing fix agents (parallel):**
| Tag | Agent | Scope | Risk |
|---|---|---|---|
| PRICING | fix-backend-api | $14.99/$119 across PRICING_DATA.ts + backend table + state machine | med (revenue values) |
| SEC-AUTH | fix-backend-api | fail-closed burn routes + requireStrictAuth fail-closed + speech-token session-scope + feedback authed-only | **high — auth contract; guest-flow regression tests required** |
| SEC-HYGIENE | fix-backend-api | env CORS allowlist + trust-proxy(env) + opaque auth errors + /share PII scrub + {code,message} envelope | med |
| BC-LAYER | fix-state-data | BroadcastChannel + storage-event wrapper module (no child porting yet — children blocked on PR #32) | low |
| PROMPTS | fix-backend-api | strip $ anchors (→pricing page) + tighten distress rail; **PR labeled needs-review, not auto-merged** | low (copy) |
| PAYFAIL | fix-frontend | PaymentFailure generic graceful + Help link | low |
| ESLINT | fix-frontend | scope lint to src/ | low |
| VIBE | fix-frontend | keep terms + tooltip/glossary | low |
| PERF-BUNDLE | fix-performance | assemble perf/sprint-bundle from #49(304)/#52(302)/#56(303)/#66(305), re-measure | med (integration) |

**Verify:** security-reviewer audits SEC-AUTH + SEC-HYGIENE diffs before declaring done.

**Doc/ticket-producing (no PR):**
- DESIGN-105: canonical-write-path proposal (for your sign-off before impl)
- RTL-DECOMP: decompose -851 into per-component shovel-ready tickets (no build)
- GDPR doc: risk-acceptance note (this file's sibling)
- phone-field ticket: filed for your go-ahead

**Not dispatched (deferred per ruling):** -1009 Redis (infra), RTL build (GTM gate), -105 impl (design gate), prompt-copy merge (your approval gate), phone-field build (your go-ahead).

