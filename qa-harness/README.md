# Easebot QA + Bug-Fix Harness

Autonomous-ish QA loop for the WeddingEase Viva chatbot workspace. Inspired by Hamel Husain's agentic-eval taxonomy, structured as a multi-agent system with strict human-in-the-loop at PR approval.

**Status**: harness scaffolded 2026-05-27. Krish (Chairman) approves all PRs.

---

## What this is

A self-driving QA cycle that:

1. **Tests the platform as a real user** using Playwright + Chrome DevTools MCP, across every page, every flow, every responsive breakpoint, every edge case.
2. **Files bug tickets** to a single Google Sheet (`1DVyv4OUr5eajmDX3-AqH3hzSyYeYAv7WD4lOlJWVelg`) — Jira/Linear-lite schema, evidence attached.
3. **Routes tickets** to specialist fix agents (frontend / backend / state-data / performance).
4. **Fixes in isolated git worktrees** on the `Bug-Resolve-claude` branch (NEVER main, NEVER any other branch).
5. **Opens PRs with evidence + a `progress.html` audit trail.**
6. **Krish reviews, approves, or denies.** Denial → agent iterates. Approval → ticket closed.

## Hard guardrails (do not modify without Krish)

1. **🚫 No Firebase writes ever** — `pretool-firebase-strict.py` blocks 30+ patterns. The QA harness may FLAG firestore.rules / IAM / hosting issues as findings, but may never mutate them.
2. **PRs only to `Bug-Resolve-claude` branch** — never main, never feature branches.
3. **No `--force` pushes** anywhere.
4. **No editing** `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.firebaserc`, `storage.rules`, `database.rules.json`, `.github/workflows/*` — blocked by `pretool-protect-deploy-configs.py`.
5. **Fix agents work in isolated git worktrees** so they can't stomp on each other.
6. **Every PR carries evidence** — screenshots, console logs, test runs, plus a `progress.html` audit trail. No exceptions.

## Sheet structure

The Google Sheet at `1DVyv4OUr5eajmDX3-AqH3hzSyYeYAv7WD4lOlJWVelg` should have these tabs (create them by hand once, or let `/qa-sync-sheet` create them on first run):

| Tab | Purpose |
|---|---|
| `tickets` | All bug tickets (one row per ticket, Jira-lite schema) |
| `qa-runs` | One row per QA sprint run with summary stats |
| `prs` | PR tracking: ticket-ID, PR URL, branch, status (open/approved/denied/merged) |
| `progress` | Cumulative progress: tests run, bugs found, bugs fixed, coverage % |
| `coverage` | What's been tested (page × flow × breakpoint matrix) |

### `tickets` schema (column headers, row 1)

```
ID | created_at | reporter_agent | severity | priority | repo | path | url_or_page | breakpoint | category | title | description | steps_to_reproduce | expected | actual | evidence_path | assigned_agent | status | last_updated | pr_url | progress_html_path | notes
```

### Ticket ID format: `WE-<YYYYMMDD>-<NNN>` (e.g. `WE-20260527-001`)

- `severity`: P0 (blocker / data loss / auth break) | P1 (broken flow) | P2 (degraded UX) | P3 (cosmetic / nice-to-have)
- `priority`: same scale (P0 = ship now)
- `category`: functional | visual | responsive | a11y | perf | state-sync | edge | e2e-flow | contract | trajectory
- `status`: new | triaged | in_progress | in_review (PR open) | approved (PR merged) | denied (back to agent) | wont_fix | duplicate

## Directory layout

```
qa-harness/
├── README.md                      ← this file
├── templates/
│   ├── ticket.md                  ← per-ticket markdown template
│   ├── progress.html              ← audit-trail template (gets copied per PR)
│   └── pr-body.md                 ← PR body template
├── tickets/
│   └── YYYY-MM-DD/                ← daily ticket folders
│       └── WE-YYYYMMDD-NNN.md     ← one file per ticket
├── evidence/
│   └── WE-YYYYMMDD-NNN/           ← per-ticket evidence
│       ├── screenshots/
│       ├── console.log
│       ├── network.har
│       └── test-output.txt
└── progress/
    └── WE-YYYYMMDD-NNN/
        └── progress.html          ← agent's working log; gets copied into PR
```

## Workflow — one full cycle

### Phase 1: QA sweep (orchestrator: `/qa-sprint`)

`/qa-sprint` spawns specialist QA agents IN PARALLEL across the active surface:

| Agent | What it tests |
|---|---|
| `qa-functional` | Every documented flow (login, send message, voice input, image gen, etc.). Verifies functional correctness against PRDs in `easebot/`. |
| `qa-visual-responsive` | Every page in mobile/tablet/desktop. Visual diffs against `qa-screenshots/baseline/`. |
| `qa-e2e-playwright` | Playwright-driven user journeys end-to-end. Captures traces. |
| `qa-state-sync` | State propagation: "if I update my name in Settings, does it reflect in chat header / profile menu / message bubbles without reload?" Specifically tests TanStack Query invalidation, Firestore listener updates, optimistic UI. |
| `qa-edge-cases` | Empty states, max-length input, special chars, network failure, slow 3G, offline mode. |
| `qa-accessibility` | a11y (Axe rules), keyboard nav, focus management, ARIA labels, contrast. |
| `qa-performance` | LCP/CLS/INP, bundle size, first-contentful-paint, hydration mismatches, re-render cascades. |
| `qa-eval-trajectory` | Hamel Husain-style: contract tests, trajectory eval on the AI pipeline (does the LLM output stay on-topic / on-mode), chaos checks (kill the backend mid-stream). |

Each agent writes findings to `qa-harness/tickets/YYYY-MM-DD/WE-...-NNN.md` with evidence in `qa-harness/evidence/WE-...-NNN/`.

### Phase 2: Triage + reporting (`/qa-bug-report`)

After QA sweep, `/qa-bug-report` runs:

1. Dedupe tickets (same root cause, same flow).
2. Severity + priority assignment based on user impact.
3. Assign each ticket to a fix specialist (FE / BE / state / perf).
4. Sync to Google Sheet (via Drive MCP — see "Sheet sync" below).
5. Output a triage summary for Krish: "N new tickets, X are P0, Y are P1, FE has K, BE has M".

### Phase 3: Fix loop (`/qa-fix-cycle`)

For each P0/P1 ticket (Krish picks which to start, or `/qa-fix-cycle --auto-take-top` picks the top of the queue):

1. Spawn fix agent (FE / BE / state / perf) in its own git worktree at `worktrees/fix-WE-...-NNN/`, branched off `Bug-Resolve-claude`.
2. Agent reads the ticket + evidence.
3. Agent runs through the test pyramid:
   - Unit (vitest / npm test)
   - Component (react-testing-library)
   - Integration (running backend + frontend together)
   - E2E (Playwright + Chrome DevTools MCP for real-user verification)
4. Agent maintains `qa-harness/progress/WE-...-NNN/progress.html` — appends every action, screenshot, test run with timestamps.
5. When agent believes ticket is fixed: commits small atomic commits, pushes `Bug-Resolve-claude`, opens PR with body from `templates/pr-body.md`, links progress.html in PR.
6. Ticket status → `in_review`.

### Phase 4: Chairman review (Krish, manual)

Krish reviews each PR:
- Reads progress.html for the audit trail
- Checks the evidence in `qa-harness/evidence/WE-...-NNN/`
- Optionally checks out the worktree (`git worktree list` shows them) and reproduces the fix locally
- **Approve** → merge to `Bug-Resolve-claude`, ticket → `approved`
- **Deny** → comment on PR with what's wrong, ticket → back to `in_progress`, agent iterates
- **Wont-fix** → ticket → `wont_fix` with reason

### Phase 5: Loop

`/loop 6h /qa-sprint` runs the whole thing every 6 hours (or whatever cadence Krish picks). New QA passes find new tickets, fix agents work the queue, Krish reviews PRs. The Bug-Resolve-claude branch accumulates approved fixes until Krish decides to merge it back into main (manual decision).

## Sheet sync — without the gsheets MCP

We use the claude.ai Google Drive MCP (OAuth, already connected) to read/write the sheet. Limitations:

- Drive MCP exposes file-level ops, not row-level. So:
  - **Read**: `read_file_content` on the sheet returns CSV.
  - **Write**: there's no native append-row tool. The sync skill reads the current sheet, merges in new tickets, then `create_file` overwrites the sheet content.
  - This is **last-write-wins** — if you edit the sheet in the browser at the same time as a sync runs, your edits could be overwritten. Mitigation: only run sync during quiet hours, or pause the sync skill while you're editing manually.

If row-level safety becomes a problem, Krish can (manually, off-Claude):
1. Create a Sheets-scoped service account in GCP
2. Share the sheet with its email
3. Add the dedicated `mcp-gsheets` MCP per the docs in `claude_code_setup.md`

But the file-level Drive MCP is plenty to start.

## Files of interest

- `templates/ticket.md` — copy this per ticket
- `templates/progress.html` — copy this per fix
- `templates/pr-body.md` — PR body template
- `~/.claude/skills/qa-sprint/SKILL.md` — orchestrator
- `~/.claude/skills/qa-bug-report/SKILL.md` — triage + sheet sync
- `~/.claude/skills/qa-fix-cycle/SKILL.md` — single-ticket fix workflow
- `~/.claude/agents/qa-*.md` — 8 specialist QA agents
- `~/.claude/agents/fix-*.md` — 3-4 specialist fix agents

## Starting the loop

```
# One-shot QA sweep (no fixes)
/qa-sprint

# Take the top P0 ticket and have an agent fix it (manual control)
/qa-fix-cycle

# Auto-pace: run a QA sweep, file tickets, then idle until you say "go"
/loop /qa-sprint

# Hard recurring schedule: every 6 hours
# (use CronCreate inside Claude Code OR the OS-level cron — see "Cron" section)
```

## Cron + /loop semantics

- `/loop /qa-sprint` — runs the orchestrator on dynamic cadence (Claude paces itself between sweeps).
- `/loop 6h /qa-sprint` — runs every 6 hours.
- `CronCreate` inside Claude Code — sets up a scheduled recurring remote agent that fires the harness automatically.

**Important**: the cron loop does QA + triage + ticket-filing AUTONOMOUSLY. Fix agents are NOT auto-spawned by the cron — Krish kicks off `/qa-fix-cycle` when he's ready. This keeps PR creation tied to a human green-light.

Reason: even though every PR needs human review, the act of opening one consumes credits and clutters the PR list. Better to QA-sweep automatically (find bugs continuously) and fix on-demand (when Krish has time to review).

If Krish prefers fully autonomous fix cycles too, change the cron prompt from `/qa-sprint` to `/qa-sprint && /qa-fix-cycle --auto-take-top --max 1`.
