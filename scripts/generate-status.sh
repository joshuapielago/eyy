#!/usr/bin/env bash
# Generates STATUS.md at the repo root.
# Parsed by a downstream multi-repo aggregator — frontmatter keys, heading
# order, and section names are part of the contract. Do not rename.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# -----------------------------
# Metadata
# -----------------------------
REMOTE_URL="$(git remote get-url origin 2>/dev/null || echo '')"
REPO="$(printf '%s' "$REMOTE_URL" | sed -E 's#^(https?://[^/]+/|git@[^:]+:)##; s#\.git$##')"
[[ -z "$REPO" ]] && REPO="$(basename "$(pwd)")"

BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --abbrev-ref HEAD)"
COMMIT="$(git rev-parse --short HEAD)"
UPDATED="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
LAST_COMMIT_EPOCH="$(git log -1 --format=%ct)"
DAYS_SINCE=$(( ( $(date +%s) - LAST_COMMIT_EPOCH ) / 86400 ))

# -----------------------------
# gh availability
# -----------------------------
GH_OK=0
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  GH_OK=1
fi

if [[ $GH_OK -eq 1 ]]; then
  PRS_JSON="$(gh pr list --state open --limit 100 --json number,title,author,createdAt 2>/dev/null || echo '[]')"
  ISSUES_JSON="$(gh issue list --state open --limit 100 --json number,title,labels,createdAt 2>/dev/null || echo '[]')"
else
  PRS_JSON='[]'
  ISSUES_JSON='[]'
fi

# -----------------------------
# TODO / FIXME scan
# -----------------------------
EXCLUDES=(
  ':!node_modules/*' ':!vendor/*' ':!dist/*' ':!build/*'
  ':!.next/*' ':!target/*' ':!__pycache__/*' ':!.venv/*'
  ':!*.lock' ':!package-lock.json' ':!yarn.lock' ':!pnpm-lock.yaml'
  ':!STATUS.md'
)
SCAN_RAW="$(git grep -n -E '(TODO|FIXME)' -- "${EXCLUDES[@]}" 2>/dev/null || true)"

# -----------------------------
# Render (Python heredoc — env-passed inputs, stdout → STATUS.md)
# -----------------------------
export REPO BRANCH COMMIT UPDATED DAYS_SINCE GH_OK PRS_JSON ISSUES_JSON SCAN_RAW

python3 - <<'PY' > STATUS.md
import json, os, subprocess
from datetime import datetime, timezone

repo = os.environ["REPO"]
branch = os.environ["BRANCH"]
commit = os.environ["COMMIT"]
updated = os.environ["UPDATED"]
days_since = int(os.environ["DAYS_SINCE"])
gh_ok = os.environ["GH_OK"] == "1"
prs = json.loads(os.environ.get("PRS_JSON") or "[]")
issues = json.loads(os.environ.get("ISSUES_JSON") or "[]")
scan_raw = os.environ.get("SCAN_RAW", "")

now = datetime.now(timezone.utc)

def age(iso: str) -> str:
    d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    days = (now - d).days
    return "today" if days == 0 else f"{days}d"

def cap(items, limit=25):
    if len(items) <= limit:
        return items, 0
    return items[:limit], len(items) - limit

# --- TODO / FIXME split ---
todos, fixmes = [], []
for line in scan_raw.splitlines():
    if not line.strip():
        continue
    parts = line.split(":", 2)
    if len(parts) < 3:
        continue
    path, lineno, content = parts[0], parts[1], parts[2].strip()
    upper = content.upper()
    if "FIXME" in upper:
        fixmes.append((path, lineno, content))
    elif "TODO" in upper:
        todos.append((path, lineno, content))

def render_scan(items):
    if not items:
        return "_None_"
    capped, extra = cap(items)
    lines = [f"- `{p}:{ln}` — {c}" for p, ln, c in capped]
    if extra:
        lines.append(f"_… {extra} more_")
    return "\n".join(lines)

# --- PR section ---
if not gh_ok:
    pr_section = "_gh CLI unavailable_"
elif not prs:
    pr_section = "_None_"
else:
    prs_sorted = sorted(prs, key=lambda p: p["createdAt"])
    capped, extra = cap(prs_sorted)
    lines = []
    for p in capped:
        author = (p.get("author") or {}).get("login", "unknown")
        lines.append(f"- #{p['number']} · {p['title']} · @{author} · {age(p['createdAt'])}")
    if extra:
        lines.append(f"_… {extra} more_")
    pr_section = "\n".join(lines)

# --- Issue section ---
if not gh_ok:
    issue_section = "_gh CLI unavailable_"
elif not issues:
    issue_section = "_None_"
else:
    issues_sorted = sorted(issues, key=lambda i: i["createdAt"])
    capped, extra = cap(issues_sorted)
    lines = []
    for i in capped:
        labels = ", ".join(lbl["name"] for lbl in (i.get("labels") or []))
        lines.append(f"- #{i['number']} · {i['title']} · [{labels}] · {age(i['createdAt'])}")
    if extra:
        lines.append(f"_… {extra} more_")
    issue_section = "\n".join(lines)

# --- Recent commits ---
recent = subprocess.check_output(
    ["git", "log", "-5", "--format=- `%h` · %an · %ad · %s", "--date=short"],
    text=True,
).rstrip()

# --- Heuristics ---
flags = []
if days_since >= 30:
    flags.append(f"- Repo is stale — no commits in {days_since} days. Decide: archive or resume.")
if gh_ok and len(prs) > 5:
    flags.append(f"- PR backlog — {len(prs)} open PRs. Triage before the queue becomes unworkable.")
if len(todos) > 50:
    flags.append(f"- Tech debt signal — {len(todos)} TODOs in tree. Convert the recurring ones to issues.")
if gh_ok and prs:
    oldest = max(
        (now - datetime.fromisoformat(p["createdAt"].replace("Z", "+00:00"))).days
        for p in prs
    )
    if oldest > 14:
        flags.append(f"- Stuck PR — oldest open PR is {oldest} days old. Land it, close it, or say why.")

actions = "\n".join(flags) if flags else "_No flags — repo healthy_"

open_prs = len(prs) if gh_ok else 0
open_issues = len(issues) if gh_ok else 0

md = f"""---
repo: {repo}
updated: {updated}
branch: {branch}
commit: {commit}
counts:
  open_prs: {open_prs}
  open_issues: {open_issues}
  todos: {len(todos)}
  fixmes: {len(fixmes)}
  days_since_last_commit: {days_since}
---

# Status — {repo}

## Recent commits (last 5 on default branch)
{recent}

## Open pull requests
{pr_section}

## Open issues
{issue_section}

## Code TODOs
{render_scan(todos)}

## Code FIXMEs
{render_scan(fixmes)}

## Suggested next actions
{actions}
"""

print(md, end="")
PY

echo "Wrote STATUS.md"
