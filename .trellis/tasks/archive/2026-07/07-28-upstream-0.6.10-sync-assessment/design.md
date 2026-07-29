# Design: Upstream v0.6.10 Selective-Sync Assessment

## 1. Boundary

This task produces one assessment report under the task directory. It performs no product implementation. The report synthesizes pinned Git evidence and existing research into decisions suitable for future, separately authorized Trellis tasks.

A parent/child task tree is unnecessary here because the current deliverable is a single independently verifiable report. The recommended runtime/CI changes are future deliverables and must receive their own task planning and authorization.

## 2. Evidence Sources

| Source | Purpose |
|---|---|
| `origin/main@d96379a7` | Current fork behavior and red-line baseline |
| `12e279a8` | Upstream v0.6.9 comparison boundary |
| `refs/remotes/assessment-upstream/v0.6.10@c94d6fc2` | Pinned upstream v0.6.10 target |
| `research/upstream-lineage.md` | Repository identity, ref provenance, and reproducible commands |
| `research/local-customizations.md` | Prior ports, fork red lines, and conflict hotspots |
| `research/v0.6.10-commit-inventory.md` | Complete three-commit and path inventory |
| `research/v0.6.10-compatibility.md` | Independent semantic-equivalence, risk, and validation analysis |
| Archived 07-27 sync tasks and live specs | Prior decisions and current contracts |

## 3. Assessment Data Flow

```text
pinned refs
  -> enumerate 12e279a8..c94d6fc2
  -> split commits into independently useful themes
  -> compare each theme against origin/main
  -> apply fork red-line filters
  -> assign classification + evidence + risk + validation
  -> deduplicate against completed selective ports
  -> order future delivery units
  -> write assessment.md
```

No source tree mutation is needed. The isolated upstream ref is a research input, not a merge target.

## 4. Classification Contract

A theme is classified using the following rules:

- **Already included / equivalent:** current fork behavior satisfies the upstream outcome even when the patch SHA or exact syntax differs.
- **Directly syncable:** the upstream patch can be applied without touching fork-specific behavior or requiring semantic adaptation.
- **Requires fork adaptation:** the outcome is valuable, but the touched files contain fork-owned behavior, duplicated canonical/live copies, or process gates.
- **Recommended to skip:** the change is upstream workspace noise, release identity, submodule movement, duplicate behavior, or conflicts with a fork red line without offsetting value.

Whole-commit labels do not hide mixed themes. Commit `621435d1` is decomposed so #476, #469, #465, CI, specs, and archives can receive different classifications.

## 5. Compatibility Rules

Future recommendations must preserve:

1. `@decade666/*` package names and the fork version/migration line.
2. decade6666 marketplace URLs and gitlink policy.
3. `codeagent-wrapper`, Antigravity, collaboration, and Codex inline defaults.
4. Chinese user-facing command titles.
5. Template/live script parity where the repository requires dual mirrors.
6. Existing context-safety, trusted-directory, journal merge-union, and Build-before-Test behavior.
7. Selective path-level ports only; no full upstream merge/rebase or whole-file checkout on forked files.

## 6. Report Shape

`assessment.md` will contain:

1. Executive verdict.
2. Baselines and reproducible commands.
3. Complete range statistics and commit table.
4. Theme-level classification matrix.
5. Already-included/duplicate-work ledger.
6. Risk and fork-red-line matrix.
7. Prioritized future task map with dependencies and validation.
8. Explicit skip ledger.
9. Limitations and work not performed.

## 7. Recommended Future Delivery Units

The report should recommend, without creating or starting them:

1. **#469 session cleanup correctness** — dual-mirror function change, four regressions, and script-conventions contract update; optionally include the #476 regression-only lock.
2. **#465 Codex saved-output recovery** — isolated template/test/spec adaptation preserving fork recursion and multi-agent guards; dogfood policy remains a planning decision.
3. **CI minimum Python 3.9** — separate CI/CD-authorized task preserving Build-before-Test and aligning the unit-test spec.

Release identity, upstream task archives, docs-site movement, and raw `0.6.10.json` are not delivery units.

## 8. Risks and Rollback

- **Evidence drift:** pin full SHAs in the report; do not assess moving `main` without a new task.
- **False equivalence:** require both source comparison and test/spec evidence; label tests not run.
- **Scope creep:** use the 36-path ledger and reject unrelated pre-v0.6.10 gaps.
- **Accidental source edits:** final `git diff --name-only` must contain only this task directory.
- **Planning artifact rollback:** all task changes are Markdown/JSONL and can be reverted independently; no runtime rollback is needed.
