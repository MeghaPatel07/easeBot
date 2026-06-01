# How to start the QA loop

The QA + Fix harness can run in three modes. Pick one based on your tolerance for autonomous activity.

---

## Mode 1: Manual one-shot (start here)

Just run a single QA sprint, see what it finds, then decide.

```
/qa-sprint
```

What happens:
1. Spawns 8 QA specialist agents in parallel
2. They sweep functional / visual / e2e / state-sync / edge / a11y / perf / eval
3. Tickets land in `qa-harness/tickets/<today>/`
4. `qa-triage` dedupes + assigns
5. Prints a sprint brief with the top P0/P1 queue

Then YOU pick a ticket and run:
```
/qa-fix-cycle --ticket WE-20260527-001
```

Or take the top of the queue:
```
/qa-fix-cycle --auto-take-top
```

This runs ONE fix cycle (one worktree, one PR), reports back, and stops.

---

## Mode 2: Self-paced loop (Claude decides cadence)

Tell Claude to keep running the QA sprint indefinitely, pacing itself:

```
/loop /qa-sprint
```

The `/loop` skill puts Claude into a self-paced mode. After each sprint, Claude decides when to run the next one based on what changed (more often during active dev, less often when idle).

**Important**: this only loops the QA SWEEP, not fixes. Fixes still require manual `/qa-fix-cycle`. This is by design — PRs without human review pile up faster than they can be reviewed.

To loop fixes too (autonomous mode — use with caution):

```
/loop /qa-sprint && /qa-fix-cycle --auto-take-top --max 1
```

This sweeps, then takes the top P0 ticket, fixes it, opens a PR, then idles until you tell it to continue. Reviews still gate merges. You retain the chairman role.

---

## Mode 3: Hard cron schedule (autonomous, scheduled)

Run on a fixed cadence regardless of activity:

### Inside Claude Code (CronCreate)

```
CronCreate(
  cron="0 */6 * * *",
  prompt="/qa-sprint"
)
```

Cron expression `0 */6 * * *` = every 6 hours on the hour. Adjust:
- `0 9,17 * * 1-5` — 9am + 5pm on weekdays
- `0 9 * * *` — daily at 9am
- `*/30 * * * *` — every 30 min (too frequent for production, burns credits)

### OS-level cron (fallback if CronCreate unavailable)

Add to your crontab (`crontab -e`):

```cron
0 */6 * * *  cd /Users/krish/Desktop/easebot && claude -p "/qa-sprint" --output-format text >> qa-harness/cron.log 2>&1
```

---

## Recommended starting cadence

For the first week, while you're getting comfortable with the agents' output quality:

```
# Daily, every morning
CronCreate(cron="0 9 * * *", prompt="/qa-sprint")
```

After a week, decide:
- **Too few findings?** Bump to every 4-6h.
- **Too noisy?** Drop to twice a week, OR tighten the agent triggers in their description fields.
- **Right pace?** Keep it.

---

## What the cron does NOT do (intentional)

- ❌ Does not auto-merge PRs (Krish reviews + merges)
- ❌ Does not auto-trigger `/qa-fix-cycle` (manual gate)
- ❌ Does not push to Firebase (hook-blocked anyway)
- ❌ Does not edit `firebase.json` / `firestore.rules` / `firestore.indexes.json` / `.firebaserc` / `.github/workflows` (hook-blocked)
- ❌ Does not write to `main` branch (hook-blocked)
- ❌ Does not auto-promote screenshots to `qa-screenshots/baseline/`

---

## How to stop the loop

| Mode | How to stop |
|---|---|
| Manual one-shot | Already stops after one run |
| `/loop /qa-sprint` | Interrupt the session (Ctrl+C in Claude Code) — loop pauses; resume next time |
| `CronCreate` | `CronDelete(cron_id="<id>")` or `CronList()` to see active crons |
| OS cron | `crontab -e` and comment out the line |

---

## Verifying the loop is working

```bash
# Recent QA sweep activity
ls -lt /Users/krish/Desktop/easebot/qa-harness/tickets/ | head -5

# Most recent triage summary
cat $(ls -t /Users/krish/Desktop/easebot/qa-harness/tickets/*/_triage-summary.md | head -1)

# Open PRs from fix agents
git -C /Users/krish/Desktop/easebot log Bug-Resolve-claude --oneline -10
```

---

## Cost considerations

A full `/qa-sprint` spawns 8 QA agents + 1 triage agent = 9 subagent runs. Each does meaningful work (reads docs, drives the UI, captures evidence). Rough estimate: a sprint consumes the credits equivalent of 30-60 minutes of focused agent work.

If running 4x/day, that's 2-4 hours of agent-equivalent work daily. Most of it is async / background — you only spend time on PR reviews.

If credits are a concern, run twice-daily or once-daily until you've worked through the initial backlog of tickets, then bump up only if needed.
