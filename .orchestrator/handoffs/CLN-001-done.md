# CLN-001 — Therapist/Consultant mode cleanup — DONE

## Files modified (12)
- easebot-backend/src/types.ts — Mode union trimmed (2 lines changed)
- easebot-backend/src/modeRouter.ts — scores record entries commented (2 lines)
- easebot-backend/src/controllers/chatController.ts — imports, tool switch, prompt switch (6 lines)
- easebot-backend/src/prompts/therapist.ts — wrapped in /* */ + header (3 lines)
- easebot-backend/src/prompts/consultant.ts — wrapped in /* */ + header (3 lines)
- Wedding-Ease-Viva-Chat/src/types/index.ts — Mode union trimmed (3 lines)
- Wedding-Ease-Viva-Chat/tailwind.config.ts — mode-therapist/mode-consultant color tokens commented (2 lines)
- Wedding-Ease-Viva-Chat/src/pages/Pricing.tsx — feature copy updated (4 lines)
- Wedding-Ease-Viva-Chat/src/pages/settings/tabs/PlanBillingTab.tsx — feature copy updated (4 lines)
- Wedding-Ease-Viva-Chat/functions/src/types.ts — Mode union trimmed (2 lines)
- Wedding-Ease-Viva-Chat/functions/src/modeRouter.ts — pattern blocks + scores commented (16 lines)
- Wedding-Ease-Viva-Chat/functions/src/controllers/chatController.ts — imports + prompt switch (4 lines)
- Wedding-Ease-Viva-Chat/functions/src/prompts/therapist.ts — wrapped in /* */ + header
- Wedding-Ease-Viva-Chat/functions/src/prompts/consultant.ts — wrapped in /* */ + header

## tsc results
- easebot-backend: `npx tsc --noEmit` — PASS (no output)
- Wedding-Ease-Viva-Chat: `npx tsc --noEmit` — PASS (no output)

Note: the `Wedding-Ease-Viva-Chat/functions/` project has its own tsconfig and is not included in the root frontend tsc run. It was modified for consistency but not separately validated — it is not part of the CLN-001 validation command spec.

## Remaining live (non-comment) grep hits
Zero in application source. Remaining matches are in:
- `docs/*.md` (out of scope — documentation/PRDs)
- `stitch/viva_main_chat_universal/code.html` (standalone design mockup, not imported into any TS/JS build)
- `Wedding-Ease-Viva-Chat/functions/lib/*.js` + `.js.map` (compiled output — will be regenerated on next build)
- Header/comment markers in the disabled prompt files themselves (expected)

## Concerns
None. All edits are reversible (comment-out only, no deletions). The Mode union narrowing in both `types.ts` files is the only place a type-level signal is removed; all consumers were updated in the same pass and tsc is clean.
