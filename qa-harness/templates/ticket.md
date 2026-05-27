# {{TICKET_ID}}: {{TITLE}}

| Field | Value |
|---|---|
| **ID** | `{{TICKET_ID}}` |
| **Created** | `{{CREATED_AT_ISO}}` |
| **Reporter** | `{{REPORTER_AGENT}}` |
| **Severity** | `{{SEVERITY}}` (P0/P1/P2/P3) |
| **Priority** | `{{PRIORITY}}` |
| **Category** | `{{CATEGORY}}` (functional/visual/responsive/a11y/perf/state-sync/edge/e2e-flow/contract/trajectory) |
| **Repo** | `{{REPO}}` (Wedding-Ease-Viva-Chat / easebot-backend / ...) |
| **Path** | `{{PATH}}` (file:line where the bug lives if known) |
| **URL / Page** | `{{URL_OR_PAGE}}` (e.g. `http://localhost:5173/chat` or `Settings → Profile`) |
| **Breakpoint** | `{{BREAKPOINT}}` (mobile / tablet / desktop / all) |
| **Status** | `new` |
| **Assigned** | _(set by triage)_ |
| **PR** | _(set when in_review)_ |
| **Progress** | _(set when in_progress, links to progress.html)_ |

## Description

{{DESCRIPTION}}

## Steps to reproduce

1. {{STEP_1}}
2. {{STEP_2}}
3. {{STEP_3}}

## Expected

{{EXPECTED}}

## Actual

{{ACTUAL}}

## Evidence

- Screenshot(s): `qa-harness/evidence/{{TICKET_ID}}/screenshots/`
- Console log: `qa-harness/evidence/{{TICKET_ID}}/console.log`
- Network (HAR): `qa-harness/evidence/{{TICKET_ID}}/network.har`
- Test output: `qa-harness/evidence/{{TICKET_ID}}/test-output.txt`

## Notes

{{NOTES}}

---

_Filed by `{{REPORTER_AGENT}}` on `{{CREATED_AT_ISO}}`. Synced to sheet row when `/qa-bug-report` runs._
