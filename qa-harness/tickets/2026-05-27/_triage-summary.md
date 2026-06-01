# Triage Summary — 2026-05-27

**Triage agent:** triage-specialist (Opus)
**Triaged at:** 2026-05-27T16:00Z

## Headline numbers

| Metric | Count |
|---|---|
| Raw tickets filed today | **164** |
| Duplicates collapsed | **6** |
| **Unique tickets in queue** | **158** |
| P0 (ship-blocker) | **7** |
| P1 (major) | **35** |
| P2 (minor) | **72** |
| P3 (nit) | **44** |

### Per-reporter

| Reporter | Filed |
|---|---|
| qa-functional-3 | 45 |
| edge-case-qa | 28 |
| qa-visual | 23 |
| qa-state-sync | 21 |
| qa-performance | 16 |
| a11y-qa | 15 |
| eval-trajectory | 10 |
| qa-e2e-playwright | **0 (still running — ID range 100–149 pending)** |

### Per fix-specialist queue length

| Specialist | Queue |
|---|---|
| `fix-frontend` | 77 |
| `fix-backend-api` | 36 |
| `fix-state-data` | 25 |
| `fix-performance` | 16 |
| `chairman` (Krish-only) | **0** (none of today's tickets require Firestore-rule / IAM / hosting edits) |

---

## 🚨 Security findings (all P0 except where noted)

| ID | Sev | One-line |
|---|---|---|
| **WE-20260527-211** | **P0** | Prompt injection via client-controlled `history[].role='system'` — attacker can override system prompt (CWE-1336). |
| **WE-20260527-353** | **P0** | Azure OpenAI content-filter error leaked verbatim to client with provider name + Microsoft docs URL + 500 status. |
| **WE-20260527-204** | **P0** | `/api/chat` accepts unauthenticated guests — anyone can burn Azure quota with no token. |
| **WE-20260527-227** | **P0** | `/api/generate-image` returns `200 {imageUrl: []}` on Azure failure, still charges tokens — silent debit bug. |
| WE-20260527-200 | P1 | Same Azure vendor leak as 353, but in non-stream path. |
| WE-20260527-201 | P1 | Invalid Firebase token error leaks Admin-SDK internals + docs URL. |
| WE-20260527-202 | P1 | `/api/chat` accepts 19 MB junk `imageData` — DoS / resource exhaustion. |
| WE-20260527-209 | P1 | `/api/transcribe` leaks server-side ffmpeg temp file paths. |
| WE-20260527-212 | P1 | `history[].content` has no max length — 500 KB payload accepted. |
| WE-20260527-214 | P1 | `/api/feedback` allows unauthenticated writes + persists raw HTML to Firestore. |
| WE-20260527-216 | P1 | Schema/controller field-name drift — `imageBase64` / `audioBase64` bypass validation entirely. |
| WE-20260527-205 | P2 | Vite dev server ships frontend with no CSP / no XFO / no security headers. |
| WE-20260527-208 | P2 | promptGuard wraps but does not block — sensitive prompts may still leak. |
| WE-20260527-221 | P2 | Cancellation registry allows cross-guest aborts. |
| WE-20260527-226 | P2 | promptGuard logs IP + 120 chars of user message — privacy concern. |

**All security fixes go to `fix-backend-api` except WE-20260527-220 (client-side file-size cap → `fix-frontend`).**

---

## Top 10 sorted queue (P0 → highest-impact first)

| # | ID | Title | Sev | Assigned |
|---|---|---|---|---|
| 1 | WE-20260527-211 | 🚨 Prompt injection via `history[].role='system'` | P0 | fix-backend-api |
| 2 | WE-20260527-204 | `/api/chat` guest pass-through — unauth LLM access | P0 | fix-backend-api |
| 3 | WE-20260527-353 | Azure content-policy error leaked verbatim + provider URL | P0 | fix-backend-api |
| 4 | WE-20260527-227 | Image-gen returns `200 {imageUrl:[]}` on failure — still charges tokens | P0 | fix-backend-api |
| 5 | WE-20260527-002 | Image generation never completes — 110s timeout, generic "Something went wrong" | P0 | fix-backend-api |
| 6 | WE-20260527-170 | Two sources of truth for user profile (architecture umbrella) | P0 | fix-state-data |
| 7 | WE-20260527-150 | Display name doesn't sync after Settings save (Krish's canonical complaint) | P0 | fix-state-data |
| 8 | WE-20260527-300 | Production LCP 9.9 s on `/` — every primary route fails Core Web Vitals | P1 | fix-performance |
| 9 | WE-20260527-052 | Mobile chat input is 251×37 px — primary CTA below touch-target | P1 | fix-frontend |
| 10 | WE-20260527-251 | Chat stream has no `aria-live` — assistant replies silent to screen readers | P1 | fix-frontend |

---

## Chairman-only items (no fix-agent can touch these)

**None today.** No findings require Firestore rules / IAM / hosting / `firebase.json` / `firestore.indexes.json` edits. Every P0 and P1 is fixable by one of the four specialists.

Possible deploy-side follow-ups (not blocking; can ship after fixes land):
- WE-20260527-205 (security headers in Vite/Express middleware) — solvable in `fix-backend-api`, no rules touched.
- Krish should consider rate-limit per-fingerprint policy after `fix-backend-api` lands WE-204.

---

## Duplicates collapsed

| Dup ID | Canonical | Reason |
|---|---|---|
| WE-20260527-006 | WE-20260527-050 | Both report AnalyticsConsent banner overlay; -050 is the umbrella with broader breakpoint evidence. |
| WE-20260527-004 | WE-20260527-066 | Both are the same Radix `DialogContent` / `DialogTitle` console warning. |
| WE-20260527-009 | WE-20260527-250 | Send-button missing `aria-label` — -250 has WCAG references + Mic/Stop coverage. |
| WE-20260527-047 | WE-20260527-359 | Both are the missing `Retry-After` / RateLimit headers on 429. |
| WE-20260527-061 | WE-20260527-256 | Default-blue focus ring → focus-visible contrast failure; -256 has WCAG mapping + broader file list. |
| WE-20260527-358 | WE-20260527-225 | Same `Last-Event-ID` non-functional reconnection finding. |

WE-20260527-170 is the architectural umbrella for WE-150/153/154/158/159/160/161/163/166/169 but is **kept open** because each child is also independently fixable; -170's fix likely closes all children at once.

---

## Coverage gaps

1. **qa-e2e-playwright is still running** — ID range 100–149 pending. Expect ~20–30 additional tickets focused on end-to-end flows (login → chat → upgrade, share-link round-trip, payment flow). Re-run triage when those land.
2. **Auth-gated routes unreachable as guest** (WE-20260527-049): Checklist CRUD, Budget, Reminders, Gallery, Timeline, Notifications — functional QA could not exercise. Need a Krish-issued test-account credential set for the next sweep.
3. **No backend log access** — WE-20260527-002 (image-gen P0) cannot be root-caused without dev-server stdout; ask Krish to dump `easebot-backend` logs around a failed request.
4. **Backend `/api/health` endpoint returns 404** (WE-20260527-315) — blocks SSE first-token / image-gen latency measurement; once shipped, re-run qa-performance for the latency dimensions we couldn't capture today.
5. **No INP/web-vitals instrumentation** (WE-20260527-312) — runtime perf invisible to PostHog. Fix early so future QA sweeps have observability.
6. **Two security P0s require deeper auth review** — WE-204 + WE-211 together let an unauthenticated attacker run prompt-injection at scale. Treat as a single landing PR if possible.

---

## Take next

`/qa-fix-cycle --auto-take-top` should grab **`WE-20260527-211`** first.

Rationale: it is a security P0 (CWE-1336 prompt injection) that compounds with WE-204 (no auth gate). Closing 211 alone reduces blast radius even before 204 lands; closing both back-to-back removes the entire unauthenticated-LLM-control surface. The fix is small (filter `history[].role !== 'system'` in `ChatRequestSchema`), easy to verify, and unblocks the rest of the security queue.

After 211: take WE-20260527-204, then 353 → 227 → 002 → 170 → 150 (all P0). The two state-sync P0s should go to `fix-state-data` in parallel with the security fixes since they touch different files.
