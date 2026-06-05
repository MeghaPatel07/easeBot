# 2026-05-27 — QA + Bug-fix harness ("boil the ocean" mode)

Saved verbatim per Krish's standing instruction: every long-form / substantive prompt gets archived here for future reference.

---

## Part 1 — Main request

> Hey Claude, so now that everything has been set up, I want you to create the perfect quality assurance testing and high-quality software engineering, bug fixing and resolution and tracking and triaging and documenting and writing process that run on and on in order to deliver full fledged QA bug sprint . And I want you to help me set up that system and tell me what prompt to give to the loop command or however so. And also we could use the slash code command here to keep working on this till it do all kind of QA from A to Z through and through. But with all of the slash commands under you, all of the MCPs, skills, hooks, plugins, etc. at the root level and then at every repo level, I want you to study all of that, study all the content and code of the repos to understand where we lie with this project. You know, add the necessary agent native files like Claude.md, etc. And then my ideal goal is, we maintain a Google Sheet where we track all the bugs in a particular sheet within multiple sheets in that larger Google Sheet. And they have a standard tracking mechanism which is akin to JIRA and other ticketing software like Linear, but it's much more simpler because we are just getting started off the ground. A thorough testing of the system as a user itself using the playwright CLI, using Chrome MCP, controlling my computer, using the computer use MCP, and all of those evals, testing, and harness frameworks that are popular as of May 2026. which is today, and with time, the current date will keep updating, so you can make sure that your knowledge is up to date. And as it is testing things, it needs evidence as a user if something is working or not. If something is functionally or visually or in any other way, whether it is a unit, component, regression, chaos, contract, end-to-end playwright, assertion, behavioral, trajectory, any sort of eval test breaks or bug comes up, right, as per maybe Hamil Hussein's taxonomy of agentic evals and harnesses and traceability, or just regular coding bugs that come up, errors in the code, or visually mainly, because that's what a user experiences, so the agent has to experience it as a user, that QA sub-agent or whatever should create bugs, reports, as tickets or as entries in that Google Sheets. If you don't already have the Google Workspace, MCP, CLI plugin, whatever installed, please set that up so that you can do that and make edits and have right access to it. And then, another agent, which would be the bug fixer, the backend or front-end developer, you can actually have two agents, one for backend, one for front-end, and backend also includes DB, auth, and all of these other mission-critical infrastructure in this production app. It will take the task that has been updated or modified or is incomplete at any given point of time after the QA does its job , and then it just keeps on working on that task. It again does the testing by its own self with high standards and following through all the layers, the levels of the pyramid of testing, whether that is unit, component, integration, end-to-end, playwright, and just using the computer and Chrome MCP as the agent itself. Using the website of Redis.ai, like actually getting all the links, all the credentials in the ENV file so it can actually use it and test all its fixes. Once it does that, then it can only and it should only create PRs against the repo where it was working and where it found the bugs because the bug tracking should include the repo and location of the bug and everything as well. It should create PRs denoting the fix based on the ticket and the PR should be descriptive and should have evidence of how and where it fixed the stuff. And it should always maintain a progress.txt or an HTML file showcasing the work that it has done, the audit trail of all the tasks it took and that should be in the PR so that the developer who is the supervisor and the head of all the agents can review it as their chairman and approve or deny the PR. But there should be evidence of it working and it will of course work in its own isolated git work tree and branch and so the developer should be able to check out that proof themselves as the chairman or give it to the agent to continue working at it and deny the PR. And whatever tasks are incomplete, once the QA has done at their job with additional tasks , should be assumed incomplete and the software developer agents will continue working on them. If they are complete, then the chairman, their chairman will mark them as complete and so that's how we close this entire loop and that should be going till whol QA of the platform is delivered properly . It should constantly just improve the systems and fix the bugs. And this bug-fixing harness is what I want you to implement for this project and set up a generic cron loop so that in this root folder where CloudCode is currently initialized, it can start building that to-do list and going from there in a deterministic fashion. I want you to save this prompt, the raw version of what I've just said, locally as well in a folder in this root, just, you know, named user prompts or whatever. And every other prompt that I send you, which is about a task that is longer, you should save it for future reference. And boil the ocean as Gary Tan of Y Combinator in 2026 has said it. Don't leave any stone unturned. Use all the components of your CloudCode harness as Boris Churny made them. And don't stop until you're done, Cloud. You got this.

---

## Part 2 — Coverage and rules

> In this do all kinf of QA , make sure you do all the functional checking all the attached usecases reflectionns edge cases etc . Have nno crumble left for the QA . For an example if iam updating the name then where ever it is ther is should reflect without any reload . Check all the pages in responsieve mode too . All loops , functionality , features etc should be checked . Make sure to also look our product to be in most optimal and optimized way . have expers QA agents for each differernt QA basedd task in which each agent are expert in that particular type of testing . Also same for the bug solving , have that particular agent that is exper in that type of bug solving . Make sure the commits you make should not return in conflicts while reging . to raise the PR create one branch called Bug-Resolve-claude in which all theese bugs pr will be raised and not in main .

---

## Part 3 — Strict permanent rule

> STRICT RULE . DO NOT EVER PUSH ANYTHING IN FIREBASE , DO NOT CHNAGE THE ACCESS RIGHT , RULES , PERMISSION IN FIREBASE . DO NOT DO ANY FIREBSAE PUSH OR PUBLISH COMMAND , REMEMBER THIS PERMENENTLy .

---

## Part 4 — Google Sheet (provided in follow-up)

> this is the sheet of google that already exist so add and use this only https://docs.google.com/spreadsheets/d/1DVyv4OUr5eajmDX3-AqH3hzSyYeYAv7WD4lOlJWVelg/edit?gid=0#gid=0

**Sheet ID**: `1DVyv4OUr5eajmDX3-AqH3hzSyYeYAv7WD4lOlJWVelg`
**URL**: https://docs.google.com/spreadsheets/d/1DVyv4OUr5eajmDX3-AqH3hzSyYeYAv7WD4lOlJWVelg/edit

---

## Distilled requirements (Claude's read)

### Process loop

1. **QA agents** test the platform AS A USER (Playwright + Chrome MCP + visual evidence + responsive modes + every page + every flow + edge cases + state-sync reflection like "name update propagates everywhere without reload").
2. **Bug reporter** writes findings to the Google Sheet above with Jira/Linear-style ticket schema (ID, title, severity, repo, file path, repro, evidence link, status).
3. **Triage** assigns Frontend vs Backend (incl DB, auth, infra) fixer.
4. **Fix agents** work in isolated git worktrees on the `Bug-Resolve-claude` branch (never main, never feature branches, never any other branch), do their own testing through the full pyramid (unit → component → integration → e2e), maintain `progress.html` audit trail, then open PRs with evidence.
5. **Chairman (Krish)** reviews PR + evidence + progress.html, approves or denies. Denied PRs go back to the agent with feedback.
6. Loop runs via `/loop` or cron until QA coverage is delivered end-to-end.

### Expert agents required

**QA side** (one expert per type — agents named to their specialty):
- Functional
- Visual + responsive (mobile/tablet/desktop)
- E2E user-journey (Playwright + Chrome MCP)
- State-sync / reflection (data propagation without reload)
- Edge cases (boundaries, malformed input, empty states)
- Accessibility (a11y, keyboard nav, screen reader)
- Performance (LCP/CLS/FID + perceived perf)
- Eval-trajectory (Hamel Husain-style: unit / component / contract / chaos / behavioral / trajectory)

**Fix side** (one expert per domain):
- Frontend (React/Vite/TS, shadcn/Radix, TipTap)
- Backend API (Express, Azure Speech, OpenAI, PostHog)
- State / data-model (TanStack Query, Firestore reads, type contracts)
- Performance (bundle, hydration, re-renders)
- (NO firestore-rules writer — rules are READ-ONLY per Strict Rule)

### Hard constraints

- **PRs only to `Bug-Resolve-claude` branch.** Never main. Never any other.
- **NO Firebase push / publish / deploy / IAM / rules / permission changes — PERMANENT.**
- Commits must not conflict on rebase (small, atomic, often).
- Evidence required: screenshots, console logs, network traces, test output.
- Each agent works in its OWN git worktree to avoid stomping.
- Progress.html in every PR shows the agent's audit trail.

### Infrastructure I need to wire

- Google Sheets MCP write access to the user's existing sheet
- `Bug-Resolve-claude` branch in the relevant repo(s)
- progress.html template
- Cron/`/loop` invocation prompt
- A skill that auto-saves long user prompts going forward to `user_prompts/`

---

*End of saved prompt.*
