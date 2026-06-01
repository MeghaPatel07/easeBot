## {{TICKET_ID}} — {{TITLE}}

**Severity**: {{SEVERITY}} · **Category**: {{CATEGORY}} · **Repo**: {{REPO}}

### What was broken

{{BUG_DESCRIPTION}}

### What this PR does

{{FIX_SUMMARY}}

### Files changed

<!-- auto-filled from git diff --stat -->

### Evidence

- 📸 Before: `qa-harness/evidence/{{TICKET_ID}}/screenshots/before-*.png`
- ✅ After: `qa-harness/evidence/{{TICKET_ID}}/screenshots/after-*.png`
- 📊 Network trace: `qa-harness/evidence/{{TICKET_ID}}/network.har`
- 📜 Audit trail: `qa-harness/progress/{{TICKET_ID}}/progress.html`

### Tests run

| Layer | Command | Result |
|---|---|---|
| Unit | `{{UNIT_CMD}}` | {{UNIT_RESULT}} |
| Component | `{{COMP_CMD}}` | {{COMP_RESULT}} |
| Integration | `{{INTEG_CMD}}` | {{INTEG_RESULT}} |
| E2E (Playwright) | `{{E2E_CMD}}` | {{E2E_RESULT}} |
| Visual (responsive) | mobile/tablet/desktop | {{VISUAL_RESULT}} |

### How to reproduce locally (Chairman review)

```bash
git fetch origin Bug-Resolve-claude
git worktree add ../easebot-review-{{TICKET_ID}} Bug-Resolve-claude
cd ../easebot-review-{{TICKET_ID}}
# then follow the steps in the ticket to repro the original bug; it should be gone
```

### Ticket

📋 [`qa-harness/tickets/{{DATE}}/{{TICKET_ID}}.md`]({{TICKET_PATH}})

### Hard rules respected

- [x] No Firebase write commands run
- [x] No edits to firebase.json, firestore.rules, firestore.indexes.json, .firebaserc
- [x] No force-push, no main-branch push
- [x] All commits atomic and conflict-free against `Bug-Resolve-claude`
- [x] Evidence attached + progress.html maintained

### Chairman action

- ✅ **Approve** — squash + merge to `Bug-Resolve-claude`
- 🔁 **Deny** — comment on this PR; agent reads + iterates
- 🗑️ **Wont-fix** — close PR with reason; ticket → `wont_fix`

---

🤖 Filed by `{{FIX_AGENT}}` · Reviewed by Krish.
