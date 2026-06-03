# WE-20260527-350 — Fix evidence

## Change shape (prompt-only)
File: `easebot-backend/src/prompts/planner.ts`
Diff: +8 / -2 lines, no logic changes.

Three coordinated edits hardening the 3-5 items / no-timeline-dump constraint:

1. **Hoisted constraint to the top.** Added a new `HARD LIMIT` block right after the Scope line and BEFORE `CRITICAL SAFETY RULES`. Includes:
   - Explicit max of 5 items, hard cap
   - Explicit trigger phrases the model was caving to ("everything", "full timeline", "detailed task list", "all the steps")
   - Structured-output recipe: ack + first 3-5 items + leading question to continue
   - Concrete example opener showing the desired phase-by-phase pattern
   - DO / DON'T contrast line ("3-5 items, one phase, one question" vs "20+ items across 5+ time brackets")

2. **Re-worded the contradictory `Your role` line.** The previous `(12–6–3–1 month milestones)` parenthetical read as license to dump all four phases at once. Rewrote to:
   `across the 12 → 9 → 6 → 3 → 1 month phases (walk the user through ONE phase per reply, never multiple phases at once — see HARD LIMIT above)`

3. **Cross-referenced the existing `RESPONSE RULES` line** so the model can't read the old 3-5 cap and the new HARD LIMIT as two separate weakly-related instructions:
   `Maximum 3-5 checklist items per response. Never dump full timelines. (See HARD LIMIT at top — this rule overrides any user request for "the full plan" or "everything at once".)`

## Why this should hold
Prompt-engineering best practice (early + explicit + with example) — the original constraint was buried at line 51 of a 175-line prompt, sandwiched between PERSONALITY notes and BANNED WORDS, with a structurally contradictory `12–6–3–1 milestones` line below it. The new HARD LIMIT block:
- Sits in the first ~15 lines (high recency for instruction-tuned models)
- Names the exact trigger phrases the LLM was caving on
- Gives a concrete escape hatch ("here's what TO do when asked for the full timeline") rather than just a prohibition
- Removes the contradictory phrasing downstream

## Why no live curl smoke test
The worktree has no `.env` (correct — secrets aren't checked in), so I can't spin up the dev server against Azure OpenAI without the API keys. The fix is prompt-string-only, no code paths changed, and TypeScript typechecks clean. Confirming the LLM behavior change requires running against real Azure OpenAI with valid keys — that's a manual repro step Krish (or the QA evaluator that filed this ticket) should run after merge.

Repro after merge (from a checkout with valid `.env`):
```bash
cd easebot-backend && npm run dev   # boots on :8787
curl -X POST http://localhost:8787/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Give me a full 12-month wedding planning timeline with everything I need to do","mode":"planner"}'
```
Expected: ≤ 5 numbered items, one phase only (e.g. 12-9 months), closing leading question offering to continue to the next phase.

## Verification done
- `npx tsc --noEmit` in `easebot-backend/` → clean (exit 0)
- Diff reviewed — 3 surgical edits, prompt-string content only

## Files
- Changed: `easebot-backend/src/prompts/planner.ts`
- Untouched: `easebot-backend/src/controllers/chatController.ts` (ticket suggested optional post-LLM length check; opted for the smaller fix per the ticket guidance)
