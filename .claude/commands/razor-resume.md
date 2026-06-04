---
description: Resume the in-progress Razorpay-gateway feature exactly where it was left off
---

Resume the **Razorpay payment-gateway** feature. The full state lives in the auto-memory file `project_razorpay_gateway.md`.

Do this in order:

1. Read `/Users/krish/.claude/projects/-Users-krish-Desktop-easebot/memory/project_razorpay_gateway.md` in full — it has the task, the locked user decisions, the architecture design, the env-var list, the key file map, the constraints, and a "NEXT STEPS" checklist.
2. Run `git branch --show-current`. Confirm we're on `feat/razorpay-gateway` (created off `main`); if not, `git checkout feat/razorpay-gateway`. Then `git status --short` and `git log --oneline -3` to see what (if anything) has been committed since.
3. Re-orient: figure out which of the memory's NEXT STEPS are already done (check whether `easebot-backend/src/lib/paymentConfig.ts` exists, whether `finalizePaymentCore` is in `paymentController.ts`, whether the razorpay routes are in `payment.ts`, whether the frontend two-button checkout is in `Checkout.tsx`). Don't redo finished work.
4. Briefly tell me where we stand (one short paragraph) and what the immediate next step is, then continue implementing from there.

Honor the constraints called out in the memory: never read/write `.env` (edit `.env.example` and hand me the paste-lines), no Firebase deploys/rules changes (app-level Firestore writes are fine), and don't commit or open a PR until I explicitly say so — when I do, payment files only, PR → Bug-Resolve-claude.

$ARGUMENTS
