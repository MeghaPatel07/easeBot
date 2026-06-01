# WE-20260601-256: After upgrade, tier entitlement gating contradicts itself — resolveTier(AuthContext.profile) gates lag the tier badge

| Field | Value |
|---|---|
| **ID** | `WE-20260601-256` |
| **Created** | `2026-06-01` |
| **Reporter** | `qa-state-sync` |
| **Severity** | `P1`|
| **Priority** | `P1`|
| **Category** | `state-sync` |
| **Repo** | `Wedding-Ease-Viva-Chat` |
| **Path** | `src/components/chat/ChatSidebar.tsx:109` (badge via accountPlan) vs `:321,:463` (gates via resolveTier(profile)) ; `src/components/RemindersView.tsx:283` ; `src/pages/PaymentSuccess.tsx:44-47` (refetches only ['account','me'], not usage, not AuthContext) |
| **URL / Page** | PayU `/payment/success` → "Back to app" (client-side nav) → sidebar gates / reminders / token-meter pool |
| **Breakpoint** | all |
| **Status** | `triaged`|
| **Assigned** | `fix-state-data`|
| **PR** | |
| **Progress** | |

## Description

DEDUP NOTE: WE-20260527-151 covers "tier BADGE in ProfileMenu stale up to 60s after upgrade." This ticket files the DISTINCT, more severe defect 151 did not call out: tier-derived ENTITLEMENT GATING is read from a different source than the badge, so after an upgrade the same screen contradicts itself and a paying user is gated out of features they just bought.

Within `ChatSidebar` alone, tier is read from TWO sources:

- Line 109: `resolvedTier = accountPlan?.tier ?? profile?.plan ...` — prefers `useAccount().plan` (which `PaymentSuccess` DOES refetch, PaymentSuccess.tsx:47). The bottom badge therefore flips to the new tier.
- Lines 321 (chat search availability gate) and 463 (retention notice) — `resolveTier(profile)` using the `AuthContext` profile prop, which `PaymentSuccess` does NOT refresh (and the return path is a client-side `<Link to="/">`, not a hard reload). These gates stay on the OLD tier.

Other tier-gated surfaces also read AuthContext: `RemindersView.tsx:283` (`resolveTier(profile)`), and the token-meter pool limits are tier-derived from `useUsageStats` which `PaymentSuccess` does NOT invalidate either (no `['account','usage']` refetch).

Result right after upgrade (no hard reload): sidebar badge shows "Pro" while the search gate / retention notice in the SAME sidebar still enforce free-tier limits, Reminders gating still treats the user as free, and the token meter still shows the free pool. The user paid but cannot use the unlocked features and sees contradictory tier UI.

This is partly mitigated once #170/#32 (AuthContext onSnapshot) lands AND the PayU webhook has written the new tier to the Firestore user doc — but the timing is racy and `PaymentSuccess` deliberately only refreshes the `useAccount` cache, leaving the AuthContext-based gates and the usage query stale on the return path.

## Steps to reproduce (by reading)

1. Free user upgrades to Pro via PayU; lands on `/payment/success`.
2. `verifyPayment` succeeds; `refetchQueries(['account','me'])` runs; ID token refreshed. AuthContext.profile NOT refreshed; `['account','usage']` NOT invalidated.
3. Click "Back to app" (`<Link to="/">`, client-side nav, no full reload).
4. ChatSidebar badge (line 109, accountPlan) shows "Pro", but the search gate (321) and retention notice (463) compute `resolveTier(profile)` = "free"; RemindersView (283) gates as "free"; token meter pool still free-tier.

## Expected

After upgrade, ALL tier-derived surfaces — badge, search/retention gates, reminders/notes gating, token-meter pool, upgrade CTAs — reflect the new tier within ~1s with no internal contradiction and no hard reload.

## Actual

Badge updates (useAccount) while gating (AuthContext) and the usage pool lag, producing a paying user who is still gated and sees contradictory tier UI on the same screen.

## Evidence

- STATIC — needs live re-verify when MCP + backend restored.
- Code: `ChatSidebar.tsx:109,321,463`, `RemindersView.tsx:283`, `NotesView.tsx:103`, `PaymentSuccess.tsx:44-47,100-105`, `tierConfig.ts:104-106`, `useUsageStats.ts:7-18`.

## Notes

Specialist: `fix-state-data`. Fixes: on the upgrade-return path also refresh `AuthContext.profile` AND invalidate `['account','usage']`; and route ALL `resolveTier(...)` callsites through ONE tier source (`useAccount().plan.tier`) so gating and the badge cannot disagree. Entitlement field for a paying user → P1 (could argue P0). Net-new relative to WE-20260527-151 (badge-only / 60s delay).

---

_Filed by `qa-state-sync` on `2026-06-01`._
