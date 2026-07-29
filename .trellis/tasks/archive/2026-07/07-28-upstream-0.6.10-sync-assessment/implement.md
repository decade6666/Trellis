# Implementation Plan: Upstream v0.6.10 Sync Assessment

## 1. Lock and Verify Evidence

- Verify `origin/main` remains `d96379a77e33c2b0b61e4d255b91404e5d66c9f4` for this assessment.
- Verify `refs/remotes/assessment-upstream/v0.6.10` resolves to `c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c`.
- Verify `git rev-list --count 12e279a8..c94d6fc2` returns `3`.
- Treat a changed fork tip or upstream target as evidence drift requiring the report baseline to be refreshed before completion.

## 2. Produce the Assessment Report

Create `assessment.md` in this task directory and synthesize the four research files without copying contradictory or superseded caveats.

Required content:

- exact refs, ancestry, and reproducible commands;
- complete three-commit / 36-path accounting;
- theme-level classification of #476, #469, #465, CI, specs, release identity, docs-site, and archives;
- duplicate-work check against completed v0.6.9 stability ports;
- benefits, dependencies, conflicts, risks, and validation per candidate;
- ordered future delivery units and explicit skip ledger;
- statement that no product synchronization was performed.

## 3. Resolve Evidence Precedence

When research artifacts differ:

1. Prefer the pinned local Git objects over earlier API-only or stale-ref statements.
2. Prefer the v0.6.10 inventory for range completeness.
3. Prefer compatibility research for semantic-equivalence and validation judgments.
4. Preserve local-customization red lines unless a newer repository artifact explicitly supersedes them.
5. Record unresolved uncertainty rather than silently choosing an implementation detail.

## 4. Quality Review

Dispatch `trellis-check` after writing `assessment.md` with the active-task prefix. The check must verify:

- every PRD acceptance criterion is mapped to report evidence;
- counts reconcile: 3 commits, 36 path entries, 18 archive paths;
- no candidate is labeled directly syncable without fork-collision analysis;
- #476 is not proposed as a duplicate runtime patch;
- prior stability scopes are not reopened;
- CI/CD and Codex dogfood decisions remain future task gates;
- no product or executable spec file changed.

Fix only task artifacts if the reviewer finds issues.

## 5. Validation Commands

Run the following read-only checks:

```bash
git rev-parse origin/main refs/remotes/assessment-upstream/v0.6.10
git rev-list --count 12e279a8..c94d6fc2
git diff --name-only 12e279a8..c94d6fc2
git log --oneline 12e279a8..c94d6fc2
git diff --name-only main...HEAD
git status --short
```

For task-artifact hygiene:

```bash
python3 ./.trellis/scripts/task.py current
python3 ./.trellis/scripts/task.py validate
```

No product test suite is required because this task changes only planning/research/report artifacts. The final verification report must explicitly state that runtime tests were not run.

## 6. Completion and Rollback Gate

- Do not start or implement future sync tasks from this assessment.
- Do not edit CI/CD, product code, tests, executable specs, manifests, or submodules.
- If any non-task path appears in the diff, stop and revert only the accidental task-session change after inspecting it.
- Before any later commit, run GitNexus `detect_changes()` as required by project policy; committing remains separately authorized.
