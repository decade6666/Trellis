# Assess Selective Sync Candidates from Upstream v0.6.10

## Goal

Produce a reproducible, evidence-backed assessment of the changes introduced by upstream `mindfold-ai/Trellis` v0.6.10, identify which changes are already present or equivalent in this fork, and recommend narrowly scoped follow-up sync work without modifying product code, CI/CD, dependencies, submodules, or release metadata in this task.

## Background and Confirmed Facts

- Fork baseline: `origin/main@d96379a77e33c2b0b61e4d255b91404e5d66c9f4` (`@decade666/trellis@0.6.17`).
- Upstream comparison baseline: v0.6.9 at `12e279a8af00456b1d0d4e3d0f7f59e7b702202e`.
- Upstream target: tag `v0.6.10` at `c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c`, fetched into the isolated ref `refs/remotes/assessment-upstream/v0.6.10`.
- The v0.6.9-to-v0.6.10 range is linear and contains exactly three commits: `621435d1`, `c45f12de`, and `c94d6fc2`.
- The substantive delta is concentrated in post-v0.6.9 task/Codex regression fixes; the remaining commits prepare and publish upstream release identity.
- The Python 3.9 nested-f-string runtime fix (#476) is already equivalent in the fork. The resolved-session cleanup fix (#469), Codex saved-output recovery protocol (#465), and CI Python 3.9 pin are not present and require fork-aware adaptation.
- Prior selective ports for context safety, trusted directories, journal merge-union, and CI Build-before-Test/core boundary are not reopened by v0.6.10 runtime changes.
- Fork red lines remain: `@decade666/*` identity/version line, decade6666 marketplace source, `codeagent-wrapper`, Antigravity integration, Chinese user-facing titles, Codex inline/collaboration behavior, and selective-port-only history policy.

## Requirements

### R1 — Reproducible Baselines

Record the fork baseline, upstream v0.6.9 baseline, upstream v0.6.10 target, ancestry geometry, and commands needed to reproduce the comparison.

### R2 — Complete Delta Inventory

Cover all commits and touched paths in `12e279a8..c94d6fc`, including explicit accounting for task archives, release metadata, package-version changes, and submodule-only changes.

### R3 — Evidence-Based Classification

Classify each commit and independently useful sub-theme as one of:

- already included or semantically equivalent;
- directly syncable;
- requires fork adaptation;
- recommended to skip.

Each classification must cite commit/file/test/spec evidence and explain benefits, conflicts, dependencies, and regression risks.

### R4 — Compatibility and Duplicate-Work Check

Distinguish genuinely new v0.6.10 value from capabilities already selectively ported into the fork, and verify whether v0.6.10 re-touches completed stability-port contracts.

### R5 — Follow-Up Recommendation

Provide a prioritized, independently deliverable follow-up sequence, with required validation and explicit red-line protections. Recommendations must separate runtime fixes, optional regression locks, Codex protocol adaptation, CI/CD work, and skipped release identity.

### R6 — Assessment-Only Boundary

This task may fetch and inspect isolated upstream Git objects and write task planning/research/report artifacts. It must not edit product code, tests, executable specs, CI/CD, dependencies, package versions, migration manifests, submodule pointers, or upstream/local branch history.

## Acceptance Criteria

- [ ] **AC1 / R1:** The final assessment records all three exact baseline/target SHAs and reproducible comparison commands.
- [ ] **AC2 / R2:** The assessment accounts for all three commits and all 36 touched path entries, including the 18 archive paths and release-only paths.
- [ ] **AC3 / R3:** Every commit and substantive theme has a classification, evidence, benefit, conflict/risk analysis, dependency note, and validation recommendation.
- [ ] **AC4 / R4:** The assessment explicitly identifies #476 as equivalent and confirms that the four completed stability-port scopes are not reopened by v0.6.10 runtime changes.
- [ ] **AC5 / R5:** The assessment recommends an ordered set of independently reviewable future sync tasks and identifies CI/CD confirmation and Codex dogfood-policy decisions as future task gates.
- [ ] **AC6 / R5:** Package/version identity, upstream migration manifest, docs-site gitlink, upstream task archives, and whole-branch/whole-file sync are explicitly rejected.
- [ ] **AC7 / R6:** `git diff` shows only task artifacts; no product, test, executable spec, CI/CD, dependency, submodule, or release file is modified.

## Out of Scope

- Cherry-picking, merging, rebasing, or applying upstream patches.
- Editing product code, tests, executable specs, CI/CD workflows, package metadata, dependencies, migration manifests, or submodule pointers.
- Creating the recommended follow-up implementation tasks or choosing their final implementation details.
- Publishing, releasing, committing, pushing, or opening a pull request without a separate explicit request.
- Reassessing deferred pre-v0.6.10 features such as Kimi/Snow or scripts QoL except where needed to explain conflicts or duplicate work.

## Deferred Items (Non-Blocking)

- Whether a future #465 task should align dogfood `.codex/agents/*` with templates or preserve local overrides.
- Whether to add the optional #476 regression-only test despite equivalent runtime behavior.
- Whether to add the CI Python 3.9 pin; this requires explicit CI/CD authorization in its own task.
- How a future local release should describe ported fixes; raw upstream `0.6.10.json` remains out of scope.
