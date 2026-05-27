# User Prompts Index

Archive of long-form / task-defining prompts from Krish, saved verbatim per the standing instruction. The `/save-prompt` skill maintains this index.

Each entry links to a file in this folder. Files are dated `YYYY-MM-DD_short-slug.md`. The slug describes the prompt's topic.

---

## 2026

### May

- **2026-05-27** — [QA + bug-fix harness setup](2026-05-27_qa-bugfix-harness.md) — "boil the ocean" autonomous QA loop with Google Sheet ticketing, expert QA agents per category, specialist fix agents, isolated git worktrees, progress.html audit trails, PRs only to `Bug-Resolve-claude` branch. Strict permanent rule: no Firebase pushes ever.
- **2026-05-27** — [Open PRs into Bug-Resolve-claude + continue loop](2026-05-27_qa-harness-prs-into-bug-resolve-claude.md) — Follow-up: harness already built; open PRs for all 12 fix branches with real commits into `Bug-Resolve-claude` and run the QA loop continuously thereafter. Pinned Google Sheet `1DVyv4OUr5eajmDX3-AqH3hzSyYeYAv7WD4lOlJWVelg`.

---

## Conventions

- One file per substantive prompt (~500+ chars, multi-paragraph task brief)
- Filenames: `YYYY-MM-DD_short-kebab-slug.md`
- Frontmatter inside each file lists original prompt + distilled requirements
- Add an entry to this INDEX whenever a new prompt is saved
- Skill `/save-prompt` automates this

## Privacy

If a prompt contains a leaked secret (API key, token, etc.), it gets redacted to `[REDACTED]` in the saved file. The intent of the message is preserved; the secret is not.
