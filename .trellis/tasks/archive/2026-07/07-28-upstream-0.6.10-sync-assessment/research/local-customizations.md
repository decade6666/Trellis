# Research: Local customizations and prior upstream sync boundaries

- **Query**: 梳理本仓库相对上游的本地定制与既往上游同步边界；识别已同步/等价实现的上游能力、明确本地定制区、以及评估 v0.6.10 时最可能冲突的文件/流程
- **Scope**: internal
- **Date**: 2026-07-28

## Findings

### 1. Baselines (reproducible refs)

| Role | Ref | Commit | Evidence |
|---|---|---|---|
| Local HEAD / `origin/main` / branch tip | `chore/upstream-0.6.10-sync-assessment` | `d96379a77e33c2b0b61e4d255b91404e5d66c9f4` | `git rev-parse HEAD origin/main` |
| Prior assessment local baseline | `origin/main` (2026-07-27) | `372ccec1a82fd138ddb02b6cdc752edd8ebf1e1f` | archive PRD/design |
| Upstream tip (local remote name `assessment-upstream/main`) | tagged `0.6.9` | `12e279a8af00456b1d0d4e3d0f7f59e7b702202e` | `git log -1 assessment-upstream/main`; `git tag` shows tip annotated as `0.6.9` |
| Merge base | — | `04f78e0d1f6aa290e139ec9bf9db4c66d2a1ecfe` | `git merge-base origin/main assessment-upstream/main` |
| Divergence | local-only **55** / upstream-only **68** | — | `git rev-list --left-right --count origin/main...assessment-upstream/main` → `55	68` |

**Upstream identity**

- Origin: `https://github.com/decade6666/Trellis` (fork).
- Authoritative upstream used in prior assessment: `mindfold-ai/Trellis` `main`, mirrored locally as `assessment-upstream/main@12e279a8` (see archive design.md §2 and prd.md Background).
- **No `0.6.10` tag/commit is present** in this worktree’s tags or `git log --all --grep=0.6.10`. The reachable upstream tip is **`0.6.9` @ `12e279a8`**. Any “v0.6.10” assessment must first confirm whether a newer remote tip exists beyond the currently fetched `assessment-upstream/main`; with current evidence the comparison baseline remains **0.6.9**.

**Local package line (fork identity)**

- CLI: `@decade666/trellis@0.6.17` with bins `trellis` / `tl` / `codeagent-wrapper` — `packages/cli/package.json:2-11`
- Core: `@decade666/trellis-core@0.6.8` — `packages/core/package.json:2-3`
- Local migration manifests include `0.6.18.json` (PRESENT); upstream release identity uses `0.6.8` / `0.6.9` manifests (skipped by prior policy).

### 2. Prior upstream sync task map (completed)

Parent + four stability PRs from 2026-07-27 assessment, all archived `status: completed` on 2026-07-27/28:

| Task | Scope | Upstream SHAs targeted | Local implementation commits | PR (origin) |
|---|---|---|---|---|
| `archive/2026-07/07-27-upstream-sync-assessment` | Research + plan only; no product code | full 68 upstream-only inventory | research only | PR #5 `179a6587` |
| `07-27-upstream-ci-spec-sync` | CI Build-before-Test + task schema Boundary doc | `65a83d7d`, `dc68f5a9`, `2d638230` | `ae675a0c` (ci.yml/publish.yml), `ffd8f616` (spec append), `ac23e536` (test/workflow contract align) | PR #8 `30c2f86f` |
| `07-27-upstream-context-safety-sync` | context caps, OpenCode caps, binary skip, no-trellis | `ea399def`, `bc36a0ed`, `f7d8c32f`, `64df8759` | `d8e43aad` | PR #6 `15a65c49` |
| `07-27-upstream-channel-trusted-dirs` | trusted context dirs for symlink workspaces | `530d2091` | `1a57854d` | PR #7 `e76546bd` |
| `07-27-upstream-journal-merge-union` | journal `merge=union` + worktree warning | `a5374864` | `81cae073` | PR #9 `9c38872a` |

Evidence: each archive `task.json` (`status: completed`); implement commits via `git show --stat`; parent PRD Task Map at `.trellis/tasks/archive/2026-07/07-27-upstream-sync-assessment/prd.md:37-45`; workspace index `.trellis/workspace/decade6666/index.md:32` lists implementation SHAs.

**Earlier selective ports (pre-stability wave)**

| Commit | What landed | Boundary preserved |
|---|---|---|
| `ce6666c6` | Selective port: update safety, task.py `--json`/base_branch, mem sqlite-readonly, Grok platform, platforms `--json`, channel `--sandbox`, related fixes; Pi migration id **0.6.18** (not upstream 0.6.8) | decade6666 marketplace, codeagent-wrapper/collab, antigravity, 0.6.17 line — commit message + `git show ce6666c6 --stat` |
| `70670c35` | Codex dogfood `max_depth=1` | template already in `ce6666c6` |
| `1ce6f36f` | Brainstorm Planning Contract + adaptive SessionStart | path-level adapt |
| `0216596e` | Marketplace submodule content sync (Grok/Kimi/Snow) | gitlink only; **CLI Kimi/Snow configurators still absent** |
| `8c356c83` | Chinese user-facing command titles | SKILL routing descriptions stay English |

### 3. Already synced or equivalently implemented upstream capabilities

These upstream commits are **present on local main in fork-adapted form** and should not be re-ported wholesale:

| Upstream capability | Upstream SHA(s) | Local evidence |
|---|---|---|
| CI build-before-test | `65a83d7d`, `dc68f5a9` | `ae675a0c` — `.github/workflows/ci.yml`, `publish.yml` (+10/−6) |
| Core task schema vs Python scripts Boundary | `2d638230` | `ffd8f616` — append-only to `.trellis/spec/cli/backend/trellis-core-sdk.md` (+19) |
| Sub-agent context injection caps | `ea399def` (#441) | `d8e43aad` — shared-hooks + OpenCode/Pi + config keys `context_injection` |
| OpenCode sub-agent context cap follow-up | `bc36a0ed` (#456) | same commit `d8e43aad` (opencode lib/plugins) |
| Skip binary context files | `f7d8c32f` (#471) | same; config comment “Binary content (NUL or invalid UTF-8) is never inlined” at `config.yaml:129` |
| `no-trellis` skip keyword | `64df8759` (#427) | same; `prompt_injection.skip_keyword` comments at template/dogfood `config.yaml:146` |
| Channel trusted context dirs | `530d2091` (#414) | `1a57854d` — `context-trust.ts` PRESENT; config keys at `config.yaml:94-108` |
| Journal `merge=union` + worktree note | `a5374864` (#415) | `81cae073` — `.gitattributes:9`, template `gitattributes.txt`, `ensureGitattributes` in workflow/update, `add_session.py` warn |
| Update safety / task JSON / Grok / sandbox (batch) | various pre-`12e279a8` | `ce6666c6` selective port |
| Codex max_depth pin | `ccd29ac5` (dogfood half) | `70670c35` |
| Marketplace platform content (not CLI wiring) | submodule bumps | `0216596e` |

### 4. Explicit local customization zones (fork red lines)

Documented as non-overwritable in archive design.md §5 and direct-sync-risk.md CRITICAL sections. Live evidence:

#### 4.1 Package / publish identity

- Scope `@decade666/*` not `@mindfoldhq/*` — `packages/cli/package.json:2`, `packages/core/package.json:2`
- CLI version line **0.6.17+** with local migration `0.6.18.json`; do not import upstream `0.6.8`/`0.6.9` release manifests as package identity
- Commits establishing scope: `8ae9e800`, `f02fe8af`, version bumps `7ad35dab`…`da8134b0`

#### 4.2 Marketplace source (decade6666 fork)

- `.gitmodules:4-6` → `https://github.com/decade6666/marketplace.git`
- Default fetch URLs in `packages/cli/src/utils/template-fetcher.ts:4-5,18-21`:
  - `TEMPLATE_INDEX_URL = https://raw.githubusercontent.com/decade6666/marketplace/main/index.json`
  - `TEMPLATE_REPO = "gh:decade6666/marketplace"`
- Commits: `99c039c0`, `b2e960da`, `b62c5fad`, `0216596e`

#### 4.3 codeagent-wrapper + collab

- Bin entry `codeagent-wrapper` → `./bin/codeagent-wrapper.mjs` — `packages/cli/package.json:11`; file PRESENT under `packages/cli/bin/`
- Multi-backend wrapper history: `8dd77687`, `a2bee483`, `f48cdeee`, `a9a908be`, `da8134b0`
- `config.yaml` collab block documents default `driver: codeagent-wrapper` — template/dogfood ~lines 156–170

#### 4.4 Antigravity adapter / registry

- `packages/cli/src/commands/channel/adapters/antigravity.ts` PRESENT (local-only vs upstream)
- Registry includes `antigravity:` — `adapters/index.ts` (grep hits at ~L189–224)
- Provider union includes `"antigravity"` in `agent-loader.ts:27`, `channel/index.ts` flags
- Upstream tip **lacks** this adapter; prior merge-tree marked `adapters/index.ts` as both-changed with no safe auto-merge (direct-sync-risk.md §3)

#### 4.5 Chinese user-facing command titles

- H1 titles: e.g. `packages/cli/src/templates/common/commands/start.md:1` `# 开始会话`; `finish-work.md:1` `# 完成工作`; `.claude/commands/trellis/*` Chinese H1s
- Palette blurbs Chinese — `packages/cli/src/configurators/shared.ts:281-285` (`COMMAND_DESCRIPTIONS`)
- Landed in `8c356c83` (30 files); routing `description:` metadata remains English by design

#### 4.6 Codex dispatch default narrative = `inline`

- Template/dogfood `config.yaml:113-121` document default `dispatch_mode: inline` (not upstream auto/sub-agent long-form default)
- Context-safety implement.md explicitly forbade overwriting this when porting caps

#### 4.7 Platform extras local-only or partial

- Trae/ZCode support: `560b0065` (local platform expansion)
- Grok configurator present via `ce6666c6`; **Kimi/Snow CLI configurators still MISSING** (`packages/cli/src/configurators/kimi.ts`, `snow.ts` absent) despite marketplace content sync

### 5. Deferred / not-yet-ported upstream (as of prior inventory @ `12e279a8`)

Still open relative to upstream tip `12e279a8` (from inventory §4 + live MISSING checks):

| Item | Upstream SHA | Status on local |
|---|---|---|
| Kimi Code platform | `bfa7f99d` (+ follow-up `7df965f0`) | CLI wiring MISSING |
| Snow CLI platform | `3dc7ba07` | CLI wiring MISSING |
| Scripts QoL batch (journal structured flags, task-tree orphan, meta access) | `53a29d41` | not taken as full port (task.py `--json` already partial via `ce6666c6`) |
| Codex preserve user sub-agent model keys | `ee4bffcc` | no local `preserveCodex` matches |
| Codex recommended model hint `gpt-5.6-terra/high` | `402653bd` | no local match |
| Upstream 0.6.8/0.6.9 release identity + docs-site changelog pointers | `c9011ae0`, `26ca25f8`, `12e279a8`, `4a5a8df3` | **policy skip** |
| Journal/task-archive/QR noise commits | 14 SHAs (N1–N3 filter) | **policy skip** |

### 6. Highest-conflict files / flows for a v0.6.10-class assessment

Prior non-destructive `merge-tree` of `assessment-upstream/main` into `origin/main@372ccec1` (archive `research/direct-sync-risk.md`):

- **Overall risk: CRITICAL** — 54 true text-conflict paths, submodule conflict on `marketplace`, dual package identity
- Strategy already chosen and re-confirmed by completed PRs: **path-level selective port only**; no full merge/rebase of upstream main

#### 6.1 Identity / always-manual paths (CRITICAL)

| Path / flow | Why it collides |
|---|---|
| `packages/cli/package.json`, `packages/core/package.json` | name/version/bin conflict (`@decade666` + 0.6.17 vs `@mindfoldhq` + 0.6.9; local `codeagent-wrapper` bin) |
| `packages/cli/bin/codeagent-wrapper.mjs` | local-only file |
| `packages/cli/src/migrations/manifests/*` | dual lines 0.6.17/0.6.18 vs 0.6.8/0.6.9 |
| `.gitmodules` + `marketplace` gitlink | decade6666 URL/SHA vs mindfold-ai |
| `packages/cli/src/utils/template-fetcher.ts` | default marketplace host |
| `packages/cli/src/commands/channel/adapters/antigravity.ts` | local-only |
| `packages/cli/src/commands/channel/adapters/index.ts` | registry both-changed; “theirs” drops antigravity |
| README / command title surfaces / `shared.ts` COMMAND_DESCRIPTIONS | CN UI vs EN upstream |

#### 6.2 Shared behavioral paths already dual-maintained (HIGH — re-conflict on next upstream touch)

These were path-ported once; any newer upstream commit touching them needs **re-diff against local adapted form**, not checkout:

| Path cluster | Local owners / recent commits |
|---|---|
| `packages/cli/src/templates/trellis/config.yaml` + `.trellis/config.yaml` | collab + codeagent-wrapper + inline Codex + context_injection + trusted_context_dirs stacked comments — `d8e43aad`, `1a57854d` |
| shared-hooks / dogfood hooks (`inject-subagent-context.py`, `inject-workflow-state.py`) + OpenCode/Pi mirrors | `d8e43aad` large dual-write |
| `packages/cli/src/commands/channel/{spawn,context-loader,agent-loader,context-trust}.ts` | trust port kept `@decade666` imports + antigravity provider — `1a57854d` |
| `packages/cli/src/commands/update.ts` + `configurators/workflow.ts` | `ensureGitattributes` without upstream `preserveCodexAgentModelKeys` import hunk — `81cae073` implement.md B5 |
| `.trellis/scripts/**` ↔ `packages/cli/src/templates/trellis/scripts/**` | mandatory dual mirror (task/config/add_session) |
| `.github/workflows/ci.yml`, `publish.yml` | order already flipped — `ae675a0c`; further upstream CI edits need high-risk reconfirm |
| `.gitattributes` / `gitattributes.txt` | journal union only; not `index.md` — `81cae073` |
| Command/skill title templates under `templates/common/commands`, platform command mirrors | Chinese H1 — `8c356c83` |

#### 6.3 Process / policy boundaries (from prior parent PRD)

1. **No whole-branch merge or rebase** of upstream into fork main (CRITICAL).
2. **No whole-file checkout** from upstream for forked files; path-level port only (`a5374864` and all adapt-class commits).
3. **Four independent PR / rollback units** pattern established; parent task does not carry product code.
4. **CI/CD edits** require explicit high-risk confirmation (ci-spec `task.json` notes record 2026-07-27 authorization limited to Build/Test order only).
5. **config.yaml** is intentionally **not** whole-blob-synced between template and dogfood; only owned comment blocks are dual-written (design.md §4).
6. Upstream package/release identity, workspace journal noise, task archive trees, QR refreshes are **skip**.
7. After each stability wave: re-fetch upstream and report **new drift only**; do not silently expand approved scope (implement.md §3.1).

### 7. Related specs / research artifacts

| File | Role |
|---|---|
| `.trellis/tasks/archive/2026-07/07-27-upstream-sync-assessment/prd.md` | Prior baseline, 33-commit window closure, 4-child map, fork red lines |
| `.../design.md` | Selective-port architecture, delivery order, compatibility contract |
| `.../implement.md` | Child execution order + integration red-line greps |
| `.../research/upstream-commit-inventory.md` | Full 68/33 classification |
| `.../research/direct-sync-risk.md` | merge-tree 54 conflicts, CRITICAL verdict |
| `.../research/compatibility-and-validation.md` | package/migration/template validation |
| Child archive `prd/design/implement.md` under `07-27-upstream-{ci-spec,context-safety,channel-trusted-dirs,journal-merge-union}` | Per-batch path lists and forbidden paths |
| `.trellis/spec/cli/backend/trellis-core-sdk.md` | Boundary section from `ffd8f616` |
| `.trellis/spec/cli/backend/filesystem-safety.md` | Channel Context Trust Set from `1a57854d` |
| `.trellis/spec/cli/backend/directory-structure.md` | Workspace Journal Merge Behavior from `81cae073` |
| `.trellis/spec/cli/backend/platform-integration.md` | Updated with injection limits notes in `d8e43aad` |
| `.trellis/workspace/decade6666/journal-1.md` + `index.md` | Human session record of selective port and stability PRs |

### 8. Implications for current task `07-28-upstream-0.6.10-sync-assessment`

1. **Baseline for “already done”** is local `d96379a7` (includes all four stability PRs + merge commits), not the older `372ccec1`.
2. **Upstream ref currently available here is still `0.6.9` @ `12e279a8`**. Label “v0.6.10” is not yet bound to a tag/commit in this clone; next research step for candidate inventory must re-fetch and pin the real 0.6.10 object (or document that tip has not advanced).
3. Anything already listed in §3 is **equivalent/adapted** — re-sync only if newer upstream commits modify those paths beyond the ported SHAs.
4. Conflict hotspots for any new upstream tip remain §6; fork red lines in §4 are hard exclusions.
5. Largest remaining **value** gaps vs last inventoried tip: Kimi/Snow CLI platforms, scripts QoL remainder, Codex model preserve/hint — all previously **deferred** (non-stability).

## Caveats / Not Found

- `0.6.10` tag/commit: **not found** in local tags or commit messages; upstream remote URL for `assessment-upstream` is not printed by `git remote -v` in this worktree (only `origin` listed), but ref `assessment-upstream/main` resolves to `12e279a8` / `0.6.9`.
- Live re-run of `merge-tree` against post-PR main (`d96379a7`) was **not** repeated in this research pass; conflict counts (54) are cited from 2026-07-27 research against `372ccec1`. Qualitative hotspots remain valid because red-line files were intentionally preserved, not converged to upstream.
- Marketplace submodule working tree content completeness for Kimi/Snow was not re-audited file-by-file; CLI configurator absence is verified by filesystem MISSING checks.
- This document does **not** classify new commits beyond `12e279a8`; it only establishes local customization and prior sync boundary for the v0.6.10 assessment.
