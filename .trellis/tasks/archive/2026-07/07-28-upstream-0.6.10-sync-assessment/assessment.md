# Assessment: Upstream v0.6.10 Selective-Sync Candidates

- **Task**: `.trellis/tasks/07-28-upstream-0.6.10-sync-assessment`
- **Date**: 2026-07-29
- **Workdir**: `/root/github/Trellis/.claude/worktrees/upstream-sync-assessment`
- **Scope**: Assessment only — no product, test, executable-spec, CI/CD, dependency, package, migration, or submodule edits were performed.
- **Status**: Complete for planning; no synchronization applied.

## 1. Executive Verdict

Upstream `mindfold-ai/Trellis` **v0.6.10** (`c94d6fc2`) is a small, linear post-v0.6.9 release: **3 commits**, **36 path entries**, concentrated on three regression fixes plus release packaging.

| Theme | Classification | Action |
|---|---|---|
| **#476** Python 3.9–3.11 nested multiline f-string fix in `task_context.py` | **Already included / equivalent** | Do **not** re-port runtime code; optional regression-only test lock is a future micro-gate |
| **#469** `clear_active_task` deletes **resolved** session key | **Requires fork adaptation** | Highest-value next sync unit (dual-mirror + 4 tests + script-conventions) |
| **#465** Codex SubagentStart “Full hook output saved to:” recovery | **Requires fork adaptation** | Separate PR; preserve fork `multi_agent` / recursion guards; dogfood policy is a planning gate |
| **CI** pin minimum Python 3.9 | **Requires fork adaptation** (process high-risk) | Separate CI/CD-authorized task; keep Build-before-Test |
| Spec additive rows for #469 / #465 / CI | **Requires fork adaptation** | Bundle with their code PRs; section-level only |
| Package version bumps `@mindfoldhq/*` 0.6.9→0.6.10 | **Recommended to skip** | Fork red line (`@decade666/trellis@0.6.17`, `@decade666/trellis-core@0.6.8`) |
| Upstream `migrations/manifests/0.6.10.json` | **Recommended to skip** | Dual migration line; fork uses `0.6.17`/`0.6.18` |
| `docs-site` submodule tip | **Recommended to skip** | Release/docs noise; not CLI runtime |
| 18 upstream task-archive paths | **Recommended to skip** | Workspace archive noise |
| Whole-branch merge / whole-file checkout of forked files | **Rejected** | Established selective-port policy |

**No theme is “directly syncable.”** Every remaining product path collides with fork drift (dual mirrors, CI customizations, Codex agent local guards, or package identity).

**Prior stability ports are not reopened** by v0.6.10 runtime changes: context-safety / injection caps, channel trusted dirs, journal `merge=union`, and CI Build-before-Test / core-sdk Boundary remain intact. The only adjacency is an additive Python setup step on the already-ported CI workflow and a syntax-guard test near the context-injection suite.

**Product synchronization was not performed in this task.**

---

## 2. Baselines and Reproducible Commands (AC1 / R1)

### 2.1 Pinned refs

| Role | Label | Full SHA |
|---|---|---|
| Fork tip / `origin/main` / assessment branch `chore/upstream-0.6.10-sync-assessment` | Project baseline | `d96379a77e33c2b0b61e4d255b91404e5d66c9f4` |
| Upstream v0.6.9 comparison boundary | Prior local upstream snapshot | `12e279a8af00456b1d0d4e3d0f7f59e7b702202e` |
| Upstream v0.6.10 target | `refs/remotes/assessment-upstream/v0.6.10` | `c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c` |
| Shared historical merge-base (fork ↔ upstream line) | Last common ancestor | `04f78e0d1f6aa290e139ec9bf9db4c66d2a1ecfe` |

Verified at assessment time:

```text
git rev-parse origin/main
→ d96379a77e33c2b0b61e4d255b91404e5d66c9f4

git rev-parse refs/remotes/assessment-upstream/v0.6.10
→ c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c

git rev-list --count 12e279a8..c94d6fc2
→ 3

git rev-list --left-right --count d96379a7...c94d6fc2
→ 55  71   (left=fork-only, right=upstream-only from shared history)

git merge-base --is-ancestor 12e279a8 c94d6fc2  → yes
git merge-base --is-ancestor c94d6fc2 d96379a7  → no
```

Package identity at tips:

| Side | CLI | Core |
|---|---|---|
| Fork `d96379a7` | `@decade666/trellis@0.6.17` (bins: `trellis`, `tl`, `codeagent-wrapper`) | `@decade666/trellis-core@0.6.8` |
| Upstream `c94d6fc2` | `@mindfoldhq/trellis@0.6.10` (bins: `trellis`, `tl`) | `@mindfoldhq/trellis-core@0.6.10` |

### 2.2 Reproducible comparison commands

```bash
# Lock tips
git rev-parse origin/main refs/remotes/assessment-upstream/v0.6.10

# Range geometry (v0.6.9 → v0.6.10)
git log --oneline 12e279a8af00456b1d0d4e3d0f7f59e7b702202e..c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c
git rev-list --count 12e279a8..c94d6fc2
git diff --name-only 12e279a8..c94d6fc2
git diff --stat 12e279a8..c94d6fc2

# Per-commit files
git show --name-status --format=fuller 621435d1
git show --name-status --format=fuller c45f12de
git show --name-status --format=fuller c94d6fc2

# Ancestry vs fork (all expected NO for v0.6.10 chain members as ancestors of main)
git merge-base --is-ancestor 12e279a8 origin/main; echo $?
git merge-base --is-ancestor 621435d1 origin/main; echo $?
git merge-base --is-ancestor c45f12de origin/main; echo $?
git merge-base --is-ancestor c94d6fc2 origin/main; echo $?
```

**Evidence precedence** (when research notes disagree): pinned local Git objects > v0.6.10 inventory for range completeness > compatibility research for semantic judgments > local-customization red lines. Early “no local v0.6.10 object” caveats in `upstream-lineage.md` are superseded by the isolated ref `refs/remotes/assessment-upstream/v0.6.10@c94d6fc2`.

---

## 3. Complete Delta Inventory (AC2 / R2)

### 3.1 Range statistics

| Metric | Value |
|---|---|
| Commits in `12e279a8..c94d6fc2` | **3** (linear, **0** merges) |
| Path entries touched (union) | **36** |
| Archive noise paths | **18** under `.trellis/tasks/archive/2026-07/` |
| Non-archive paths | **18** |
| Product-touching commit | 1 (`621435d1` #477) |
| Release-prepare commit | 1 (`c45f12de` #480) |
| Version-tag commit | 1 (`c94d6fc2`) |
| Journal / QR / workspace noise in range | **0** |
| Diff size | **+771 / −52** (`git diff --stat 12e279a8..c94d6fc2`) |

### 3.2 Commit table

| # | SHA | Subject | Primary classification | Notes |
|---|---|---|---|---|
| 1 | `621435d143d352ac1db4ab077d682716fd6d5afd` | `fix: resolve post-0.6.9 task and Codex regressions (#477)` | **Requires fork adaptation** (mixed themes) | Decompose: #476 equivalent; #469 / #465 / CI / specs adapt; 18 archives skip |
| 2 | `c45f12defb449f88cc160f4b2162035f07127866` | `chore: prepare v0.6.10 release (#480)` | **Requires fork adaptation** (manifest only) + **skip** docs-site | Do not import raw upstream identity |
| 3 | `c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c` | `0.6.10` | **Recommended to skip** | Package.json version bumps only |

None of the three SHAs are ancestors of `origin/main`; any future uptake is cherry-pick / path-level port, not fast-forward.

### 3.3 Full 36-path ledger

#### A. Product / test / spec / CI (14) — from `621435d1`

| Status | Path |
|---|---|
| M | `.github/workflows/ci.yml` |
| M | `.trellis/scripts/common/active_task.py` |
| M | `.trellis/scripts/common/task_context.py` |
| M | `.trellis/spec/cli/backend/platform-integration.md` |
| M | `.trellis/spec/cli/backend/script-conventions.md` |
| M | `.trellis/spec/cli/unit-test/index.md` |
| M | `packages/cli/src/templates/codex/agents/trellis-check.toml` |
| M | `packages/cli/src/templates/codex/agents/trellis-implement.toml` |
| M | `packages/cli/src/templates/codex/agents/trellis-research.toml` |
| M | `packages/cli/src/templates/trellis/scripts/common/active_task.py` |
| M | `packages/cli/src/templates/trellis/scripts/common/task_context.py` |
| M | `packages/cli/test/regression.test.ts` |
| M | `packages/cli/test/scripts/context-injection-limits.integration.test.ts` |
| M | `packages/cli/test/templates/codex.test.ts` |

#### B. Archive noise (18) — from `621435d1`

| Status | Path |
|---|---|
| A | `.trellis/tasks/archive/2026-07/07-27-codex-hook-truncation-recovery/{check.jsonl,implement.jsonl,prd.md,task.json}` |
| A | `.trellis/tasks/archive/2026-07/07-27-fallback-session-cleanup/{check.jsonl,implement.jsonl,prd.md,task.json}` |
| A | `.trellis/tasks/archive/2026-07/07-27-post-069-regression-fixes/{check.jsonl,design.md,implement.jsonl,implement.md,prd.md,task.json}` |
| A | `.trellis/tasks/archive/2026-07/07-27-python-task-script-compat/{check.jsonl,implement.jsonl,prd.md,task.json}` |

Count: 4 + 4 + 6 + 4 = **18**.

#### C. Release prepare (2) — from `c45f12de`

| Status | Path |
|---|---|
| A | `packages/cli/src/migrations/manifests/0.6.10.json` |
| M | `docs-site` (submodule `160000`: `ec91a942` → `1b530128`) |

#### D. Version tag (2) — from `c94d6fc2`

| Status | Path |
|---|---|
| M | `packages/cli/package.json` |
| M | `packages/core/package.json` |

**Reconciliation:** 14 + 18 + 2 + 2 = **36** path entries. Matches `git diff --name-only 12e279a8..c94d6fc2 | wc -l`.

---

## 4. Theme-Level Classification Matrix (AC3 / R3)

Classification contract (from `design.md`):

- **Already included / equivalent** — fork outcome matches even if SHA/syntax differ.
- **Directly syncable** — clean apply without fork-specific adaptation (**unused** for this range).
- **Requires fork adaptation** — valuable but collides with dual mirrors, local guards, or process gates.
- **Recommended to skip** — noise, release identity, or red-line conflict without offsetting value.

### 4.1 Theme #476 — Python 3.9–3.11 nested multiline f-string

| Field | Content |
|---|---|
| **Upstream** | `621435d1` / issue #476 — hoist warning text out of nested multiline f-string inside `colored(...)` in dogfood + template `task_context.py`; add vitest syntax guard |
| **Classification** | **Already included / equivalent** |
| **Evidence** | Fork dogfood + template use `msg = (...)` then `print(f"  {colored(msg, ...)}")` (see `.trellis/scripts/common/task_context.py` ~L239–249). Upstream 0.6.9 used nested `colored(f'…'\n f'…')` inside outer f-string; 0.6.10 uses `warning_message = (...)`. Fork variable name differs (`msg` vs `warning_message`); semantic fix is present. Provenance on fork attributes the safe construction to prior context-safety work (`d8e43aad`). |
| **Benefit if re-applied** | None for runtime; only an explicit `#476` regression lock is missing |
| **Conflicts** | Whole-file replace would thrash dual-maintained scripts unrelated to this theme |
| **Dependencies** | None |
| **Regression risk if skipped** | **None** for runtime on current tip |
| **Validation (future, optional)** | Add upstream-style regex/describe lock to `packages/cli/test/scripts/context-injection-limits.integration.test.ts`; `uv run --no-project --python 3.9 python -m py_compile` on both `task_context.py` copies; `pnpm --filter @decade666/trellis exec vitest run test/scripts/context-injection-limits.integration.test.ts` |
| **Recommendation** | **Do not** re-port runtime code. Optional test-only lock may bundle with #469 or a tiny follow-up |

### 4.2 Theme #469 — Resolved fallback-session cleanup

| Field | Content |
|---|---|
| **Upstream** | `621435d1` / issue #469 — `clear_active_task` deletes `_context_path(repo_root, previous.context_key)` after requiring `previous.task_path` and `previous.context_key`; four `[issue #469]` cases in `regression.test.ts`; `script-conventions.md` contract update |
| **Classification** | **Requires fork adaptation** |
| **Evidence (gap)** | Fork dogfood + template still: resolve process `context_key`, delete `_context_path(repo_root, context_key)`, docstring “current session context file”. No `[issue #469]` tests on `origin/main`. Upstream body: early-return when resolution has no unique task; delete **resolved** key. |
| **Benefit** | Correct sole-fallback finish (must clear **old** session file, not process-derived current key); preserve ambiguous multi-session / malformed exact cases (delete nothing) |
| **Conflicts** | Dual-mirror mandatory (`.trellis/scripts/common/active_task.py` ↔ template copy). Full file also diverges on platform key sets (fork trae/zcode/grok vs upstream kimi/snow partial) — **path-level edit of `clear_active_task` only**; no whole-file checkout |
| **Dependencies** | None within v0.6.10 range; independent of #465 and CI |
| **Regression risk if ported poorly** | Wrong session deleted |
| **Regression risk if skipped** | **Sole-fallback finish leaves stale session**; ambiguous cases may clear process key incorrectly |
| **Validation (future)** | Port 4× `[issue #469]` into fork `regression.test.ts` session suite; dual-mirror function; update `script-conventions.md` resolved-source wording; `pnpm --filter @decade666/trellis exec vitest run test/regression.test.ts`; manual Python repro with mismatched process key vs sole fallback file |
| **Recommendation** | **Primary next delivery unit** |

### 4.3 Theme #465 — Codex SubagentStart saved-output recovery

| Field | Content |
|---|---|
| **Upstream** | `621435d1` / issue #465 — prefer `Full hook output saved to: <path>` before marker / Active-task fallback in `trellis-{check,implement,research}.toml`; extend `codex.test.ts`; `platform-integration.md` Codex subsection |
| **Classification** | **Requires fork adaptation** |
| **Evidence (gap)** | Fork template agents: **0** hits for `Full hook output saved to`. Check/implement lack upstream Context Loading Protocol shape; research on fork uses `task.py current --source` as step 1. Fork **has** critical local pins: `multi_agent = false` + multi_agent_v2 / spawn recursion guards — **absent** on upstream 0.6.9/0.6.10 templates. Dogfood `.codex/agents/*` further diverges (manual “Required: Load Trellis Context First”). |
| **Benefit** | When Codex truncates SubagentStart, children can recover full saved hook output instead of trusting a partial marker preview |
| **Conflicts** | Cannot checkout upstream TOMLs (would drop multi_agent / recursion guards and fight dogfood overrides). `platform-integration.md` is heavily dual-maintained — section-level edit only. Research agent policy: fork allows `task.py current`; upstream forbids it in favor of dispatch payload |
| **Dependencies** | Independent of #469; spec rows couple to this PR |
| **Regression risk if ported poorly** | Loss of fork recursion / multi_agent deadlock guards; research isolation drift |
| **Regression risk if skipped** | Truncated hook context may be incomplete for Codex sub-agents (research may still partially recover via `task.py current`) |
| **Validation (future)** | Surgical protocol insert into three **template** TOMLs preserving `[features]` / recursion; extend `codex.test.ts`; section edit `platform-integration.md`; `vitest run test/templates/codex.test.ts`; `trellis init --codex` smoke on built CLI |
| **Future gate** | Explicit planning decision: align dogfood `.codex/agents/*` with templates vs preserve local overrides |
| **Recommendation** | **Second delivery unit** (separate PR) |

### 4.4 Theme CI — Minimum Python 3.9 pin

| Field | Content |
|---|---|
| **Upstream** | `621435d1` — `actions/setup-python@v7` with `python-version: "3.9"` after Setup Node.js; `unit-test/index.md` CI row text update |
| **Classification** | **Requires fork adaptation** (code risk low; **process high-risk**) |
| **Evidence (gap)** | Fork CI has typecheck → lint → **Build before Test** (from PR #8 / `ae675a0c`) but **no** `setup-python` step. `unit-test/index.md` CI row on fork is already stale vs live workflow (omits typecheck) |
| **Benefit** | Catch Python 3.9 syntax regressions on GHA (aligns with #476 support floor) |
| **Conflicts** | Must **not** reorder Build/Test or replace whole workflow; path filters / typecheck / local comments stay |
| **Dependencies** | None; can conceptually parallelize after #469 |
| **Regression risk if ported poorly** | Workflow break if action/version wrong |
| **Regression risk if skipped** | Syntax regressions can hide on newer runner Python |
| **Validation (future)** | Add additive step only; align unit-test index row with live order including typecheck; confirm CI green |
| **Future gate** | **Explicit CI/CD high-risk authorization** (same class as prior ci-spec task) |
| **Recommendation** | **Third delivery unit** only after confirmation |

### 4.5 Spec contract rows (coupled)

| Spec | Couples to | Classification | Handling |
|---|---|---|---|
| `.trellis/spec/cli/backend/script-conventions.md` | #469 | Requires fork adaptation | Additive/section edit for resolved-session finish semantics |
| `.trellis/spec/cli/backend/platform-integration.md` | #465 | Requires fork adaptation | Codex native SubagentStart subsection only (+ saved-output order) |
| `.trellis/spec/cli/unit-test/index.md` | CI pin | Requires fork adaptation | Update CI stage row; include typecheck + Python 3.9 |

Do **not** whole-file replace any of these dual-maintained specs.

### 4.6 Release identity / docs-site / archives

| Theme | Classification | Reason |
|---|---|---|
| `packages/cli/package.json` + `packages/core/package.json` version bumps (`c94d6fc2`) | **Recommended to skip** | Would rename/regress `@decade666/*` and version line; drops `codeagent-wrapper` bin if replaced wholesale |
| `packages/cli/src/migrations/manifests/0.6.10.json` (`c45f12de`) | **Recommended to skip** (as raw upstream) | Fork migration line is `0.6.17`/`0.6.18`; upstream 0.6.8–0.6.10 manifests absent by prior policy. If user-visible notes are needed later, author a **local** migration (e.g. next `0.6.19.json`) describing adapted fixes — not a copy of upstream `0.6.10.json` |
| `docs-site` gitlink (`c45f12de`) | **Recommended to skip** | Submodule tip chase; not CLI runtime; separate decision domain |
| 18 archive paths (`621435d1`) | **Recommended to skip** | Upstream task-archive noise; no runtime behavior |

### 4.7 Whole-commit labels vs mixed themes

| Commit | Whole-commit label | Hidden mix |
|---|---|---|
| `621435d1` | Requires fork adaptation | #476 equivalent; archives skip; #469/#465/CI/specs adapt |
| `c45f12de` | Requires fork adaptation (manifest) / skip (docs-site) | Split by path |
| `c94d6fc2` | Recommended to skip | Pure identity |

**Directly syncable count: 0.**

---

## 5. Duplicate-Work and Prior Stability Ports (AC4 / R4)

### 5.1 #476 equivalence (required AC callout)

#476 is **already equivalent** on fork tip `d96379a7`. Re-applying the runtime patch would be duplicate work. Only an optional regression-lock test remains as non-behavior debt.

### 5.2 Completed 07-27 stability ports — re-touch audit

Compared `git diff --name-only 12e279a8..c94d6fc2` against paths owned by completed selective ports:

| Prior port | Local implement / PR | Re-touched by v0.6.10 runtime? |
|---|---|---|
| Context safety / injection caps / binary skip / `no-trellis` | `d8e43aad` / PR #6 | **No** product paths. Only test file `context-injection-limits.integration.test.ts` gained a **#476 syntax guard** (does not change injection runtime) |
| Channel trusted dirs | `1a57854d` / PR #7 | **No** (`context-trust.ts`, channel cmds, trusted config keys clean) |
| Journal `merge=union` | `81cae073` / PR #9 | **No** (`.gitattributes`, `gitattributes.txt`, `ensureGitattributes`, `add_session` clean) |
| CI Build-before-Test + core-sdk Boundary | `ae675a0c` / `ffd8f616` / PR #8 | **CI file touched only to add Python 3.9 setup** — does **not** reorder Build/Test; `publish.yml` clean; `trellis-core-sdk.md` clean |

Live fork still shows prior-port markers: `context-trust.ts` present; `.gitattributes` journal `merge=union`; CI documents Build before Test; template/dogfood retain `context_injection` / `trusted_context_dirs` / `skip_keyword` commentary from prior ports.

**Conclusion:** v0.6.10 does **not** reopen the four completed stability-port runtime contracts. Do not re-scope those themes in follow-up tasks unless a **later** upstream tip retouches them.

### 5.3 Already-included / equivalent ledger (topic level)

| Capability | Status on fork |
|---|---|
| #476 nested f-string hygiene in `task_context.py` | Equivalent |
| CI Build-before-Test | Present (prior port); not part of v0.6.10 delta semantics beyond additive Python pin |
| Context injection caps / binary skip / no-trellis | Present; untouched by v0.6.10 product delta |
| Trusted context dirs | Present; untouched |
| Journal merge=union | Present; untouched |

### 5.4 Pre-v0.6.10 deferred items (out of scope except conflict notes)

Kimi/Snow CLI wiring, scripts QoL remainder, Codex model preserve/hint remain **deferred** from the v0.6.9 inventory. They are **not** delivery units of this assessment. Mention only because `active_task.py` platform-key drift and Codex TOML drift explain why whole-file checkout is unsafe.

---

## 6. Risk and Fork Red-Line Matrix

| Red line | Hit by v0.6.10 delta? | Handling |
|---|---|---|
| `@decade666/*` package identity / version / migration line | Yes (`package.json`, `0.6.10.json`) | **Skip** those files |
| decade6666 marketplace / `template-fetcher` | No | — |
| `codeagent-wrapper` bin + collab | No (would be harmed only by package.json replace) | Protect via skip of package.json |
| Antigravity adapter/registry | No | — |
| Chinese user-facing command titles | No | — |
| Codex `dispatch_mode: inline` narrative in config.yaml | No | — |
| Dual-mirror scripts | Yes (#469; #476 already ok) | Path-level dual-write |
| CI/CD high-risk gate | Yes (python setup) | Confirm before edit |
| No whole-branch merge / no whole-file checkout of forked files | Policy | Future syncs remain selective |
| Prior stability contracts | Adjacent CI only | Do not reopen scopes |

| Candidate | Risk if ported poorly | Risk if skipped |
|---|---|---|
| #476 runtime | N/A (equivalent) | None |
| #469 | Delete wrong session | Stale sole-fallback session; wrong clear on ambiguous cases |
| #465 | Drop multi_agent/recursion guards | Incomplete truncated hook context |
| CI Python 3.9 | Workflow failure | Hidden 3.9 syntax breaks |
| Identity/manifest/docs/archives | Publish/migrate corruption or noise | None for fork users |

---

## 7. Prioritized Future Delivery Units (AC5 / R5)

Planning only — **this task must not create, start, or implement** these units.

### Unit 1 — #469 session cleanup correctness (primary)

- **Scope**: dual-mirror `clear_active_task` body only; four `[issue #469]` regressions; `script-conventions.md` section update.
- **Optional bundle**: #476 regression-only test lock (no runtime code).
- **Depends on**: nothing in v0.6.10 range.
- **Gates**: none beyond normal code review.
- **Validation**: vitest `regression.test.ts`; dual-mirror parity check; optional py_compile 3.9 on `task_context.py` if #476 lock bundled.
- **Forbidden**: whole-file `active_task.py` checkout; platform-key rewrites; package/migration edits.

### Unit 2 — #465 Codex saved-output recovery (adapt)

- **Scope**: surgical protocol text in three **template** TOMLs; `codex.test.ts` asserts; `platform-integration.md` Codex subsection.
- **Depends on**: nothing hard; better after or parallel to Unit 1 as separate PR.
- **Gates**: **Codex dogfood policy decision** — regenerate/align `.codex/agents/*` vs preserve local overrides; must be decided in that task’s planning, not here.
- **Validation**: `vitest run test/templates/codex.test.ts`; init --codex smoke; red-line grep that `multi_agent = false` / recursion guards remain.
- **Forbidden**: wholesale TOML replace; removing fork multi_agent pins; silent dogfood overwrite without decision.

### Unit 3 — CI minimum Python 3.9 (high-risk)

- **Scope**: additive `setup-python@v7` / `3.9` step; align `unit-test/index.md` CI row with live order (typecheck + pin + lint + build + test).
- **Depends on**: nothing.
- **Gates**: **explicit CI/CD authorization** before any workflow edit.
- **Validation**: CI pipeline green; confirm Build-before-Test comments/order unchanged; `publish.yml` untouched.
- **Forbidden**: reordering Build/Test; expanding to publish workflow; unrelated path-filter changes.

### Explicit non-units (AC6)

- Package/version identity sync
- Raw upstream `0.6.10.json` migration manifest
- `docs-site` gitlink chase
- Upstream task archives under `.trellis/tasks/archive/**`
- Whole-branch merge/rebase of upstream into fork main
- Whole-file checkout of forked dual-maintained files
- Re-opening context-safety / trusted-dirs / journal-union / Build-before-Test product scopes

### Suggested order

```text
1. Unit 1 (#469 [+ optional #476 test lock])
2. Unit 2 (#465) — independent PR; dogfood gate first inside that task
3. Unit 3 (CI Python 3.9) — only after CI/CD confirmation
```

Units 1 and 2 are file-independent and may be planned in parallel once authorized; Unit 3 is process-gated, not code-dependent.

### Post-port red-line greps (for future implementers)

After any port: confirm `@decade666`, `codeagent-wrapper`, `antigravity`, Chinese H1 samples, `dispatch_mode: inline`, journal `merge=union`, `context-trust`, and Build-before-Test comment still present.

---

## 8. Explicit Skip Ledger (AC6)

| Item | SHA / location | Skip rationale |
|---|---|---|
| `@mindfoldhq` / version 0.6.10 package bumps | `c94d6fc2` | Fork identity red line |
| Upstream `0.6.10.json` as-is | `c45f12de` | Dual migration line; release voice |
| `docs-site` submodule move | `c45f12de` | Non-runtime; separate domain |
| 18 archive files | `621435d1` | Task-archive noise policy |
| #476 runtime re-port | theme inside `621435d1` | Already equivalent |
| Full merge / rebase / whole-file checkout | process | CRITICAL from prior direct-sync-risk; reaffirmed |
| Pre-v0.6.10 deferred features (Kimi/Snow, scripts QoL, Codex model hints) | outside range | Out of scope for this assessment |

---

## 9. Assessment Boundary and Work Not Performed (AC7 / R6)

### 9.1 What this task did

- Pinned and verified Git baselines for fork tip, v0.6.9, and v0.6.10.
- Inventoried all 3 commits and 36 paths.
- Classified themes with evidence from source comparison, prior research, and live greps.
- Wrote this report under the task directory only.

### 9.2 What this task did **not** do

- No cherry-pick, merge, rebase, or patch apply.
- No edits to product code, tests, executable specs, CI/CD, dependencies, package metadata, migration manifests, or submodule pointers.
- No creation or start of follow-up implementation tasks.
- No commit, push, publish, or PR.
- **Runtime test suites were not run** (assessment-only; not required by `implement.md`).
- Vitest / pnpm build / full merge-tree re-run against post-stability main were not required for this report; classifications use source/diff/test-presence evidence. Residual uncertainty: behavioral sole-fallback failure mode is inferred from code+upstream tests, not re-executed here.

### 9.3 Task-artifact hygiene expectation

`.trellis/tasks/` is gitignored in this repository, so a clean assessment session yields **empty** `git status --short` and empty `git diff --name-only` / `git diff --name-only main...HEAD` (no product, test, executable-spec, CI/CD, dependency, package, migration, or submodule path). Live task artifacts still exist only under:

`.trellis/tasks/07-28-upstream-0.6.10-sync-assessment/`

If any **tracked** non-task path appears dirty, stop and revert the accidental change.

---

## 10. Acceptance Criteria Traceability

| AC | Requirement | Report evidence |
|---|---|---|
| **AC1 / R1** | Exact baseline/target SHAs + reproducible commands | §2 |
| **AC2 / R2** | All 3 commits; all 36 paths including 18 archives and release-only paths | §3 |
| **AC3 / R3** | Every commit/theme: classification, evidence, benefit, conflict/risk, dependency, validation | §3–§4 |
| **AC4 / R4** | #476 equivalent; four stability ports not reopened | §4.1, §5 |
| **AC5 / R5** | Ordered independent future units; CI/CD and Codex dogfood as gates | §7 |
| **AC6 / R5** | Identity, manifest, docs-site, archives, whole-branch/file sync rejected | §4.6, §7 non-units, §8 |
| **AC7 / R6** | Diff only task artifacts; no product sync | §1 verdict, §9 |

---

## 11. Related Artifacts

| Path | Role |
|---|---|
| `research/upstream-lineage.md` | Ref provenance (API-era caveats superseded for object presence) |
| `research/local-customizations.md` | Fork red lines + prior port map |
| `research/v0.6.10-commit-inventory.md` | Complete three-commit / path inventory |
| `research/v0.6.10-compatibility.md` | Semantic equivalence, risk, validation |
| `prd.md` / `design.md` / `implement.md` | Requirements, report shape, execution gates |
| Archive `07-27-upstream-{context-safety,channel-trusted-dirs,journal-merge-union,ci-spec-sync}` | Completed stability ports |
| Live specs: `platform-integration.md`, `script-conventions.md`, `unit-test/index.md`, `filesystem-safety.md`, `directory-structure.md`, `trellis-core-sdk.md` | Current fork contracts |

---

## 12. Limitations

1. Classifications are from pinned objects + static comparison; **no vitest/pnpm suite execution** in this task.
2. Dogfood vs template Codex agent drift pre-existed v0.6.10; Unit 2 must decide policy explicitly.
3. `docs-site` submodule content at upstream tip was not expanded (gitlink-only classification).
4. Fork `unit-test/index.md` already disagreed with live CI before v0.6.10; fixing the row is doc hygiene bundled with Unit 3, not new upstream behavior.
5. Evidence is pinned to the SHAs in §2; a moved `origin/main` or new upstream tip requires a **new** assessment task.

**End of assessment. No product synchronization was performed.**
