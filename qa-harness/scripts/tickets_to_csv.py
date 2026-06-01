#!/usr/bin/env python3
"""
Walk qa-harness/tickets/YYYY-MM-DD/WE-*.md and emit a CSV row per ticket
matching the 22-column `tickets` tab schema in the WeddingEase QA sheet.

Schema (row 1 of the sheet):
ID, created_at, reporter_agent, severity, priority, repo, path,
url_or_page, breakpoint, category, title, description, steps_to_reproduce,
expected, actual, evidence_path, assigned_agent, status, last_updated,
pr_url, progress_html_path, notes

Usage:
    python3 tickets_to_csv.py 2026-05-27 > tickets-2026-05-27.csv
    python3 tickets_to_csv.py --all > tickets-all.csv
"""
from __future__ import annotations

import csv
import glob
import os
import re
import sys
from pathlib import Path

ROOT = Path("/Users/krish/Desktop/easebot/qa-harness")

COLS = [
    "ID", "created_at", "reporter_agent", "severity", "priority",
    "repo", "path", "url_or_page", "breakpoint", "category", "title",
    "description", "steps_to_reproduce", "expected", "actual",
    "evidence_path", "assigned_agent", "status", "last_updated",
    "pr_url", "progress_html_path", "notes",
]

# Map ticket-table field names → schema column name
FIELD_MAP = {
    "ID": "ID", "Created": "created_at", "Reporter": "reporter_agent",
    "Severity": "severity", "Priority": "priority", "Repo": "repo",
    "Path": "path", "URL / Page": "url_or_page", "URL": "url_or_page",
    "Breakpoint": "breakpoint", "Category": "category",
    "Assigned": "assigned_agent", "Status": "status",
    "Branch": "notes", "PR": "pr_url", "PR URL": "pr_url",
    "PR command": "notes", "PR (compare URL)": "pr_url",
    "PR create URL": "pr_url", "PR body": "notes",
    "Progress": "progress_html_path", "Progress HTML": "progress_html_path",
    "Evidence": "evidence_path", "WCAG": "notes",
    "Likely closes": "notes", "Commit": "notes",
}

YAML_MAP = {
    "id": "ID", "title": "title", "category": "category",
    "severity": "severity", "date": "created_at", "component": "path",
    "status": "status", "assigned": "assigned_agent",
}


def strip(s: str) -> str:
    # strip surrounding backticks, asterisks, whitespace
    return s.strip().strip("`*").strip()


def parse_yaml_frontmatter(text: str) -> dict:
    m = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not m:
        return {}
    out = {}
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        k = k.strip()
        v = strip(v)
        if k in YAML_MAP:
            out[YAML_MAP[k]] = v
    return out


def parse_md_table(text: str) -> dict:
    out = {}
    # Tables look like: | **Field** | `value` |
    for line in text.splitlines()[:40]:
        m = re.match(r"^\|\s*\*?\*?([\w /\(\)]+?)\*?\*?\s*\|\s*(.+?)\s*\|", line)
        if not m:
            continue
        field = strip(m.group(1))
        val = strip(m.group(2))
        if field in FIELD_MAP and FIELD_MAP[field] not in out:
            out[FIELD_MAP[field]] = val
    return out


def parse_section(text: str, header: str, max_chars: int = 300) -> str:
    # Grab the markdown section starting with `## {header}` until next `## `
    pattern = rf"##\s+{re.escape(header)}\s*\n(.*?)(?=\n##\s|\Z)"
    m = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
    if not m:
        return ""
    body = m.group(1).strip()
    # collapse whitespace, truncate
    body = re.sub(r"\s+", " ", body)
    if len(body) > max_chars:
        body = body[: max_chars - 1] + "…"
    return body


def parse_title(text: str, fallback_id: str) -> str:
    m = re.match(r"^#\s+(.*?)$", text, re.MULTILINE)
    if not m:
        return fallback_id
    title = m.group(1).strip()
    # Remove leading WE-...- prefix if present
    title = re.sub(r"^WE-\d{8}-\d+:\s*", "", title)
    return title


def parse_ticket(fp: Path) -> dict | None:
    text = fp.read_text(encoding="utf-8", errors="replace")
    row = {c: "" for c in COLS}

    # Try YAML first, then markdown table — table is more common
    row.update(parse_yaml_frontmatter(text))
    row.update(parse_md_table(text))

    # ID fallback from filename
    if not row["ID"]:
        m = re.search(r"WE-\d{8}-\d+", fp.name)
        if m:
            row["ID"] = m.group(0)
    if not row["ID"]:
        return None

    # Title fallback from H1
    if not row.get("title"):
        row["title"] = parse_title(text, row["ID"])

    # Description, steps, expected, actual
    if not row["description"]:
        row["description"] = parse_section(text, "Description", 400)
    if not row["steps_to_reproduce"]:
        row["steps_to_reproduce"] = parse_section(text, "Steps to reproduce", 300)
    if not row["expected"]:
        row["expected"] = parse_section(text, "Expected", 200)
    if not row["actual"]:
        row["actual"] = parse_section(text, "Actual", 200)

    # Paths
    if not row["evidence_path"]:
        ev = ROOT / "evidence" / row["ID"]
        if ev.is_dir():
            row["evidence_path"] = f"qa-harness/evidence/{row['ID']}/"
    if not row["progress_html_path"]:
        pg = ROOT / "progress" / row["ID"] / "progress.html"
        if pg.is_file():
            row["progress_html_path"] = f"qa-harness/progress/{row['ID']}/progress.html"

    # last_updated = file mtime
    row["last_updated"] = f"{__import__('datetime').datetime.fromtimestamp(fp.stat().st_mtime).isoformat()}"

    # Defaults
    row["reporter_agent"] = row["reporter_agent"] or "qa-harness"
    row["status"] = row["status"] or "new"
    row["severity"] = (row["severity"] or "P2").upper().lstrip("P") and ("P" + (row["severity"] or "P2").upper().lstrip("P"))
    row["priority"] = row["priority"] or row["severity"]

    return row


def main():
    args = sys.argv[1:]
    if not args:
        print("usage: tickets_to_csv.py <YYYY-MM-DD>|--all", file=sys.stderr)
        return 2

    if args[0] == "--all":
        files = sorted(glob.glob(str(ROOT / "tickets" / "*" / "WE-*.md")))
    else:
        date = args[0]
        files = sorted(glob.glob(str(ROOT / "tickets" / date / "WE-*.md")))

    w = csv.DictWriter(sys.stdout, fieldnames=COLS, quoting=csv.QUOTE_MINIMAL)
    w.writeheader()

    count = 0
    skipped = 0
    for fp in files:
        try:
            row = parse_ticket(Path(fp))
            if row is None:
                skipped += 1
                continue
            w.writerow(row)
            count += 1
        except Exception as e:
            print(f"# skip {fp}: {e}", file=sys.stderr)
            skipped += 1

    print(f"# parsed {count}, skipped {skipped}", file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main() or 0)
