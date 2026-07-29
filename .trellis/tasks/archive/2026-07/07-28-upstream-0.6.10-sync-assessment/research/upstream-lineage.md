# Research: upstream lineage for v0.6.10 sync assessment

- **Query**: Confirm all remotes; local branch vs main; accurate v0.6.10 tag/commit; reproducible compare baselines/commands; commit range of v0.6.10 relative to already-synced upstream baseline
- **Scope**: mixed (local git + GitHub API read-only; no `git fetch`)
- **Date**: 2026-07-29
- **Workdir**: `/root/github/Trellis/.claude/worktrees/upstream-sync-assessment`
- **Active task**: `.trellis/tasks/07-28-upstream-0.6.10-sync-assessment`

## Findings

### 1) Current repository remote identities

#### Configured remotes (`git remote -v`)

| Remote | Fetch | Push |
|---|---|---|
| `origin` | `git@github.com:decade6666/Trellis` | `git@github.com:decade6666/Trellis` |

Notes:

- `git config --get remote.origin.url` returns `https://github.com/decade6666/Trellis` (URL form differs from `git remote -v`, same repo).
- **No** named remote for upstream `mindfold-ai/Trellis` is currently configured (`git remote` lists only `origin`).

#### Residual / non-remote upstream ref (local only)

| Ref | SHA | Provenance |
|---|---|---|
| `refs/remotes/assessment-upstream/main` | `12e279a8af00456b1d0d4e3d0f7f59e7b702202e` | One-shot fetch log: `fetch --no-tags https://github.com/mindfold-ai/Trellis.git main:refs/remotes/assessment-upstream/main` (not registered under `git remote`) |

Tip subject at that ref:

- commit message: `0.6.9`
- author date: 2026-07-24 22:53:52 +0800
- package identity at tip: `@mindfoldhq/trellis` / `@mindfoldhq/trellis-core` both `0.6.9`

#### Submodule URL identities (`.gitmodules`)

| Path | URL |
|---|---|
| `docs-site` | `https://github.com/mindfold-ai/docs.git` |
| `marketplace` | `https://github.com/decade6666/marketplace.git` |

These are submodule identities, not top-level remotes of this worktree.

#### Local package identity (project tip)

| Package | Name | Version |
|---|---|---|
| CLI | `@decade666/trellis` | `0.6.17` |
| Core | `@decade666/trellis-core` | `0.6.8` |

### 2) Local current branch vs `main`

| Ref | Full SHA | Subject |
|---|---|---|
| `HEAD` / `chore/upstream-0.6.10-sync-assessment` | `d96379a77e33c2b0b61e4d255b91404e5d66c9f4` | `chore(sync): merge remote main before push` |
| `main` | `d96379a77e33c2b0b61e4d255b91404e5d66c9f4` | same |
| `origin/main` / `origin/HEAD` | `d96379a77e33c2b0b61e4d255b91404e5d66c9f4` | same |

Relationship:

- `git rev-list --left-right --count main...HEAD` → `0 0`
- Current assessment branch tip **is identical** to local `main` and `origin/main` (no unique commits either side).
- Working tree status: clean on `chore/upstream-0.6.10-sync-assessment`.

### 3) Accurate upstream v0.6.10 tag / commit

#### Local availability

| Source | Result |
|---|---|
| `git tag -l '*0.6.10*' '*v0.6.10*'` | empty (repo has **0 tags** total) |
| Local object `c94d6fc…` | **missing** (`git cat-file -t` fails) |
| Local highest known upstream tip | `assessment-upstream/main` = **0.6.9** (`12e279a8…`) |

**No local tag or commit currently materializes v0.6.10.** A `git fetch` would be required to load the object; this research did **not** fetch.

#### Public GitHub evidence (read-only API, no fetch)

Commands:

```bash
gh api repos/mindfold-ai/Trellis/git/refs/tags/v0.6.10
gh api 'repos/mindfold-ai/trellis/tags?per_page=30' --jq '.[] | "\(.name) \(.commit.sha)"'
gh api repos/mindfold-ai/Trellis/git/commits/c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c
```

Results:

| Field | Value |
|---|---|
| Upstream repo | `mindfold-ai/Trellis` |
| Tag | `v0.6.10` (annotated/ref under `refs/tags/v0.6.10`) |
| Tag object target commit | `c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c` |
| Commit subject | `0.6.10` |
| Committer date | `2026-07-28T10:05:51Z` |
| Parent | `c45f12defb449f88cc160f4b2162035f07127866` |
| HTML | https://github.com/mindfold-ai/Trellis/commit/c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c |

Adjacent published tags (API):

| Tag | Commit |
|---|---|
| `v0.6.9` | `12e279a8af00456b1d0d4e3d0f7f59e7b702202e` (matches local `assessment-upstream/main`) |
| `v0.6.10` | `c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c` |
| `v0.7.0-beta.0` | `ef91afee611e6c2f7a2555516815af0dc59d8bfd` |

Note: `gh api repos/mindfold-ai/trellis/releases/tags/v0.6.10` returned **404** (tag exists; GitHub Release entity may not). Tag ref path is authoritative for the commit SHA.

### 4) Recommended reproducible Git compare baselines and commands

#### Baselines (use these labels in later assessment steps)

| Label | Ref / SHA | Role |
|---|---|---|
| **Project tip** | `origin/main` = `d96379a77e33c2b0b61e4d255b91404e5d66c9f4` | decade6666 fork current line (same as assessment branch) |
| **Shared historical merge-base** | `04f78e0d1f6aa290e139ec9bf9db4c66d2a1ecfe` | last common ancestor of fork tip and local upstream snapshot; subject `chore: refresh WeChat group QR … (#432)`; CLI version at base `@mindfoldhq/trellis@0.6.7` |
| **Local upstream snapshot (max available without fetch)** | `assessment-upstream/main` = `12e279a8…` = upstream **v0.6.9** | last previously fetched mindfold-ai `main` |
| **Target release (API-only until fetch)** | `v0.6.10` → `c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c` | desired assessment target |

#### Commands that work **now** (local objects only)

```bash
# geometry vs last local upstream snapshot (v0.6.9)
git merge-base origin/main assessment-upstream/main
# → 04f78e0d1f6aa290e139ec9bf9db4c66d2a1ecfe

git rev-list --left-right --count origin/main...assessment-upstream/main
# → 55  68   (left=origin-only, right=upstream-only)

git log --oneline --format='%h %ci %s' \
  $(git merge-base origin/main assessment-upstream/main)..assessment-upstream/main

git log --oneline --format='%h %ci %s' \
  $(git merge-base origin/main assessment-upstream/main)..origin/main

# non-destructive conflict preview vs local upstream tip
git merge-tree $(git merge-base origin/main assessment-upstream/main) \
  origin/main assessment-upstream/main
```

Prior assessment of the same snapshot geometry (older origin tip) is archived at:

- `.trellis/tasks/07-27-upstream-sync-assessment/research/direct-sync-risk.md`

#### Commands that require an **explicit** read-only fetch first

v0.6.10 object is not local. If a later step is authorized to fetch (this research did not):

```bash
# example only — DO NOT run unless authorized
git fetch --no-tags https://github.com/mindfold-ai/Trellis.git \
  'refs/tags/v0.6.10:refs/tags/v0.6.10' \
  'main:refs/remotes/assessment-upstream/main'

git rev-parse v0.6.10
# expected: c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c

# delta from last local upstream snapshot (v0.6.9) → v0.6.10
git log --oneline 12e279a8af00456b1d0d4e3d0f7f59e7b702202e..v0.6.10
git diff --stat 12e279a8af00456b1d0d4e3d0f7f59e7b702202e..v0.6.10

# full fork-vs-target after fetch
git merge-base origin/main v0.6.10
git rev-list --left-right --count origin/main...v0.6.10
git log --oneline $(git merge-base origin/main v0.6.10)..v0.6.10
```

### 5) v0.6.10 relative to already-synced upstream baseline

#### What “already-synced baseline” means in this fork

This project does **not** track upstream as a continuous merge. Evidence shows **selective ports** after the 2026-07-15 fork point:

| Evidence | Meaning |
|---|---|
| merge-base with `assessment-upstream/main` = `04f78e0d…` (2026-07-15) | histories diverged; neither tip is ancestor of the other |
| `ce6666c6` `feat(upstream): selective port…` (PR #1) | first large selective port of post-fork upstream value |
| `1ce6f36f` / `70670c35` (PRs #2/#3) | further adapt ports (Planning Contract / SessionStart / max_depth) |
| `0216596e` marketplace sync | upstream marketplace content port |
| `d8e43aad` + PRs #6–#9 (context limits, trusted dirs, journal union, CI/spec) | stability ports from 2026-07-27 assessment of **v0.6.9** tip |
| journal sessions 3–6 in `.trellis/workspace/decade6666/journal-1.md` | records selective-port workflow, not full merge |

#### Local vs last fetched upstream tip (v0.6.9)

Measured today:

| Side | Count | Range |
|---|---:|---|
| origin/main-only | **55** | `assessment-upstream/main..origin/main` |
| assessment-upstream-only | **68** | `origin/main..assessment-upstream/main` |

Interpretation:

- The **68** upstream-only commits are the complete local-known upstream delta from shared base through **v0.6.9** (`12e279a8`).
- Many of those topics were **partially/selectively** already ported into the fork (not as identical SHAs; as adapted commits listed above). Therefore “already synced” is **topic-level**, not “all 68 commits are ancestors of main”.
- `assessment-upstream/main` is **not** an ancestor of `main` (`merge-base --is-ancestor` fails).

#### Where v0.6.10 sits

| Segment | Status |
|---|---|
| Shared base → v0.6.9 (`04f78e0d..12e279a8`) | Present locally as `assessment-upstream/main` history; partial selective ports already on `origin/main` |
| v0.6.9 → v0.6.10 (`12e279a8..c94d6fc`) | **Not present locally**; only known via GitHub tag/API. Parent of `0.6.10` is `c45f12de…` (also not local). Exact commit list/diff **cannot** be enumerated until fetch |
| Fork tip relative to v0.6.10 | Cannot compute merge-base / left-right counts until `c94d6fc…` is fetched |

**Conclusion for range wording usable by planners:**

1. **Last locally materialized upstream baseline for comparison:** `assessment-upstream/main` @ `12e279a8` = **upstream v0.6.9**.
2. **Already-synced content:** selective ports on `origin/main` covering subsets of the 68 upstream-only commits through v0.6.9 (not a full SHA-equivalent sync).
3. **v0.6.10 delta beyond that baseline:** commits strictly after `12e279a8` up to `c94d6fc` (`v0.6.10`), currently **API-identified only**; requires authorized fetch before file/commit inventory.

## External References

- Upstream repo: https://github.com/mindfold-ai/Trellis
- Tag ref API: `GET /repos/mindfold-ai/Trellis/git/refs/tags/v0.6.10` → commit `c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c`
- Prior local assessment (v0.6.9 tip): `.trellis/tasks/07-27-upstream-sync-assessment/research/direct-sync-risk.md`
- Workspace journal of prior selective syncs: `.trellis/workspace/decade6666/journal-1.md`

## Caveats / Not Found

- **No `git fetch` was performed** (per task instruction). v0.6.10 commit object and its parent chain beyond local v0.6.9 tip are not in the object database.
- `assessment-upstream` is a **stale residual ref**, not a configured remote; it freezes mindfold-ai `main` as of the 07-27 assessment fetch at v0.6.9 and may lag current upstream `main`.
- Local tag namespace is empty; do not assume release tags exist locally.
- GitHub **Release** entity for `v0.6.10` was 404; tag ref still resolves.
- “Already synced” cannot be reduced to a single upstream SHA on `main`; use selective-port commit list + topic mapping, not `git merge-base` alone.
- Submodule working copies may not match `.gitmodules` remotes in this worktree; top-level lineage conclusions above do not depend on submodule tip SHAs.
- This file records lineage only; it does not classify candidate ports or recommend product changes.
