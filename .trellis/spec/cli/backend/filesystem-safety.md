# Filesystem Safety — Atomic Writes & Destructive-Op Guards

> Cross-cutting contract for any code that **writes, deletes, moves, or
> overwrites** files in a user's repo. Trellis ships as a CLI that runs inside
> real git repos, so a truncated write or a mistargeted delete is user data
> loss, not a transient bug. These are the guardrails the 2026-07-10 audit's
> two root causes distilled to.

Applies to: `commands/update.ts`, `commands/uninstall.ts`, `utils/*`,
`core/channel/**`, and the shipped Python under `templates/trellis/scripts/`.

---

## 1. Atomic writes — never truncate a state file in place

**Rule**: a file that holds durable state (attribution manifest, `task.json`,
`config.yaml`, session pointer, channel events cursor) must be written
**temp-in-same-dir + rename**, never `fs.writeFileSync(path, ...)` /
`path.write_text(...)` directly. In-place writes truncate the target as their
first step, so a crash / Ctrl-C / ENOSPC mid-write leaves a half-file. A
truncated `.template-hashes.json` heals to `{}` (every managed file then looks
user-modified); a truncated `task.json` reads back as `None` (the task vanishes
from `task.py list`).

### Signatures

```ts
// packages/cli/src/utils/atomic-write.ts
export function writeFileAtomic(filePath: string, data: string | Uint8Array): void
// writes `<dir>/.<basename>.<pid>.tmp` then fs.renameSync over filePath;
// removes the tmp and rethrows on failure. Same-dir tmp keeps rename atomic.
```

```python
# templates/trellis/scripts/common/io.py
def write_json(path: Path, data: dict) -> bool
# tempfile.mkstemp(dir=path.parent) -> os.fdopen write -> os.replace(tmp, path);
# unlinks tmp and re-raises on BaseException (Ctrl-C included).
```

### Wrong vs Correct

```ts
// Wrong — truncates on entry; a crash here corrupts the manifest to {}
fs.writeFileSync(hashesPath, JSON.stringify(payload, null, 2));

// Correct
writeFileAtomic(hashesPath, JSON.stringify(payload, null, 2));
```

> **Note**: atomic write fixes the *crash window*. It does **not** fix
> concurrent last-writer-wins (multiple processes RMW the same file). File
> locking / seq reconciliation is a separate, still-open concern.

---

## 2. Path & name safety — validate at the chokepoint, before `path.join`

**Rule**: any user- or agent-supplied string that becomes a path segment must be
validated **before** it flows into `path.join` / `shutil.move` / `rmSync`. A
name like `../../x` resolves outside the intended tree and a later recursive
delete escapes the store.

| Concern | Guard | Location |
|---|---|---|
| channel / worker name | `assertSafeName(name, kind)` — `^[A-Za-z0-9._-]+$`, rejects `.`/`..` — called inside `channelDir` (the single chokepoint every path helper passes through) | `core` + `cli` `channel/store/paths.ts` |
| `task.py archive <name>` target | `is_within_tasks_dir(task_dir_abs, repo_root)` — dir must be a direct child of `.trellis/tasks/` | `scripts/common/task_utils.py` |
| rename-dir migration source | `dirHasManifestEntries(fromDir, hashes)` — only auto-move a dir Trellis provably created | `commands/update.ts` |

> **Why the chokepoint, not the entrypoint**: validating inside `channelDir`
> (not in each of create/rm/run) means one guard covers every current and future
> caller. `spawn.ts` had long *asserted* this — a "CLI layer already validates
> names" comment — while no such validation existed; adding the guard at the
> `channelDir` chokepoint is what finally made that comment true.

```ts
// Correct: guard lives in the shared path builder
export function channelDir(name: string, project = currentProjectKey()): string {
  assertSafeName(name);
  return path.join(projectDir(project), name);
}
```

---

## 3. Destructive-op ownership / backup gate

Before deleting, moving, or overwriting anything that **could be user data**,
one of these must hold. Pick by operation:

| Operation | Required guard |
|---|---|
| Delete a mixed-ownership file (e.g. `AGENTS.md`) | Strip only the managed block (`scrubManagedMarkdownBlock`); delete only if nothing user-authored remains. Never `unlinkSync` the whole file. |
| Move a dir that may be user-owned (rename-dir) | Ownership check (`dirHasManifestEntries`); unowned + target-absent → **skip** (safe even under `--force`, since skip never executes). |
| Overwrite a dir from a remote source | Download to a temp dir; `rm` + copy the old dir **only after** the download succeeds (`downloadWithStrategy` `overwrite`). Never delete-then-download. |
| Rename onto a possibly-existing target | `fs.existsSync(newPath)` first; skip/renumber instead of clobbering (`renameTracesToJournal`). Especially when the dir is excluded from backup. |
| `rm -rf` a tree with user data (`uninstall`) | `collectUncommittedTrellisData(cwd)` (git status over `spec/tasks/workspace`); scripted `--yes` fails closed unless `TRELLIS_ALLOW_DIRTY_UNINSTALL=1`. Disclosure must name what user data is deleted. |

**Env override precedent**: a fail-closed guard on a `--yes`/`--force` path gets
an explicit env bypass, mirroring `TRELLIS_ALLOW_HOMEDIR`
(`TRELLIS_ALLOW_DIRTY_UNINSTALL=1`). Warn-and-continue is not enough on
`--yes` — nobody reads scrollback in a script.

---

## 4. Dogfood twin sync

Shipped Python (`packages/cli/src/templates/trellis/scripts/**`) has a dogfood
twin at repo `.trellis/scripts/**`. When you change a shipped script, sync the
twin **iff** they were identical first (`diff` before `cp`); if the twin has
drifted, apply the same edit surgically so unrelated local drift is preserved.
`packages/cli/dist/**` and `.trellis/.backup-*/**` are generated/history —
never hand-edit.

---

## 5. Tests required

Every guard here leaves a runnable regression test whose assertion **fails
without the guard**:

- Atomic write: write-succeeds + no tmp leftover + original survives a failed write (`test/utils/atomic-write.test.ts`; Python covered via `task-archive` integration).
- Path traversal: `create '../../victim' --force` / `rm '../../victim'` throw and the external dir survives — reproduce in a sandbox (`test/channel/name-safety`, `test/commands/channel-name-safety`).
- Ownership/backup gates: unowned source skipped (`update-internals` rename-dir gate), `archive src` refused with `src/` intact (`task-archive` integration), overwrite-fails-preserves-spec (`template-fetcher-overwrite`), uninstall refuses dirty `--yes` (`uninstall-dirty-guard`, real git).

---

## Related

- [`trellis update` Command](./commands-update.md) — migration classification/apply
- [`trellis uninstall` Command](./commands-uninstall.md) — plan/execute phases
- [`trellis channel` Command](./commands-channel.md) — store paths, project buckets
- [Script Conventions](./script-conventions.md) — Python `io.py` contract
- [Migrations](./migrations.md) — rename/rename-dir/delete semantics

## Channel Context Trust Set (`channel.trusted_context_dirs`, #414)

### 1. Scope / Trigger

Apply this contract whenever Channel or the OMP extension reads context or agent
files whose realpath may fall outside the worker/project cwd. This includes
`--file`, `--jsonl`, JSONL `file` rows, agent definitions, and OMP task context.
The trust set expands the realpath jail only through explicit configuration or
narrow top-level Trellis workspace symlinks.

### 2. Signatures

```typescript
resolveTrustedRoots(cwd: string): string[]
assembleContext(
  cwd: string,
  files: string[],
  jsonls: string[],
  trustedRoots?: string[],
): string
loadAgent(name: string, cwd: string, trustedRoots?: string[]): AgentDefinition
```

The OMP template keeps standalone equivalents because generated extensions
cannot import the CLI package:

```typescript
resolveTrustedRoots(projectRoot: string): string[]
resolveProjectFile(
  projectRoot: string,
  file: string,
  trustedRoots?: string[],
): string | null
```

### 3. Contracts

1. `.trellis/config.yaml` → `channel.trusted_context_dirs` is a string list.
   Relative entries resolve against cwd; every accepted entry is
   realpath-canonicalized and roots are deduplicated.
2. Unless `channel.auto_trust_trellis_symlinks` is explicitly `false`, only the
   top-level `.trellis/tasks` and `.trellis/workspace` entries contribute their
   realpath targets, and only when those entries are themselves symlinks. Do not
   recurse and do not auto-trust `.trellis/agents` or nested task symlinks.
3. Every candidate is allowed only when its realpath is inside cwd or a trusted
   root. The containment predicate must be identical in context-loader,
   agent-loader, and OMP:

   ```typescript
   candidate === root || candidate.startsWith(root + path.sep)
   ```

   `path.sep` is load-bearing: it blocks `/work/ws-evil` from matching
   `/work/ws`. It also means filesystem root is not treated as a universal
   trust root; OMP must not substitute a `path.relative` predicate that changes
   this edge case.
4. `resolveTrustedRoots(cwd)` runs once per spawn and its result is passed to
   both agent and context loading. OMP resolves once per task-context build.
5. Existing realpath and read-time symlink checks remain in place. Trust roots
   supplement the jail; they do not replace it with lexical containment.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Config missing, list empty, and no top-level symlink | Return `[]`; preserve cwd-only behavior |
| Relative allowlist entry | Resolve against cwd, then canonicalize with realpath |
| Allowlist entry missing or invalid | Warn on CLI and skip; never add an unresolved lexical path |
| `auto_trust_trellis_symlinks: false` | Disable auto-trust; explicit allowlist still applies |
| Invalid auto-trust value | Warn and treat as unset, preserving the documented default |
| `tasks`/`workspace` is a real directory | Do not add it as an extra root |
| Nested symlink escapes cwd and roots | Reject |
| Candidate shares only a string prefix with a root | Reject |
| Trusted root is filesystem root | Accept only exact root under the shared predicate, not every absolute path |
| Agent name contains path separators or traversal | Reject before filesystem lookup |

### 5. Good / Base / Bad Cases

- **Good**: `.trellis/tasks` is a top-level symlink to a user-managed external
  task store. Its manifest and referenced files are readable because their
  realpaths remain under the one auto-trusted target.
- **Base**: tasks and workspace are normal directories and no allowlist is
  configured. The trust set is empty and legacy cwd-only behavior is unchanged.
- **Bad**: a nested task symlink points at `/etc/passwd`, a candidate lives in a
  prefix sibling such as `trusted-evil`, or OMP uses `path.relative` while CLI
  uses the required predicate. All must be rejected or caught by tests.

### 6. Tests Required

- Parser tests for missing config, comments, allowlist list termination,
  relative paths, booleans, and invalid auto-trust values.
- Runtime tests for default-empty roots, explicit allowlist, top-level
  tasks/workspace symlinks, auto-trust disabled, missing roots, and deduplication.
- Negative context tests for `/etc/passwd`, `..` escape, nested symlinks,
  prefix-sibling paths, and filesystem-root trust.
- Agent-loader tests for normal cwd agents, trusted external agents, and unsafe
  names.
- OMP tests that guard the actual containment expression and prohibit a
  `path.relative` replacement; template-only string presence is insufficient.
- Fork regression checks preserving Antigravity registration,
  `@decade666/trellis-core`, sandbox behavior, and collab configuration.

### 7. Wrong vs Correct

Wrong:

```typescript
// Lexical/prefix checks permit sibling-prefix or cross-runtime drift.
return candidate.startsWith(root);
// OMP-only alternative with different root semantics:
return !path.relative(root, candidate).startsWith("..");
```

Correct:

```typescript
const real = realpathSync(candidate);
return roots.some(
  (root) => real === root || real.startsWith(root + path.sep),
);
```

The OMP template carries a standalone parser/resolver, but its containment
expression and edge-case tests must stay aligned with the CLI implementation.
Do not relax realpath containment; it is the defense established by the
2026-07-10 audit (#409 family).

## Install-time HOME compatibility link (`codeagent-wrapper`, #0.6.18)

### 1. Scope / Trigger

Apply when the CLI package `postinstall` helper
(`packages/cli/bin/install-codeagent-wrapper-link.mjs`) considers writing
`~/.claude/bin/codeagent-wrapper`. This is an intentional, fail-closed HOME
side effect for external Claude/CCG tools. It does **not** change Trellis
runtime wrapper resolution (bundled → PATH only; no home-bin scan). See also
[commands-channel.md](./commands-channel.md) “Install-time Claude/CCG
compatibility link”.

### 2. Signatures

```text
Source (fixed): <package-root>/bin/codeagent-wrapper.mjs
Dest   (fixed): os.homedir()/.claude/bin/codeagent-wrapper
```

No destination/source override env or config. Helper imports only `node:`
built-ins; no package business modules, network, shell, or dynamic import.

### 3. Contracts

1. Side effects only when `npm_config_global === "true"`,
   `npm_lifecycle_event === "postinstall"`, package root equals the realpath of
   `<npm_config_prefix>/lib/node_modules/@decade666/trellis`, that root is not
   under `INIT_CWD/node_modules`, and the platform exposes `O_DIRECTORY`,
   `O_NOFOLLOW`, and a safe directory-fd path such as `/proc/self/fd`.
2. HOME must already exist as a real directory owned by `process.getuid()` and
   must not be group/other-writable. Never trust `SUDO_USER`. Never
   chmod/chown existing HOME/`.claude`/`bin` nodes.
3. Inspect HOME → `.claude` → `bin` one component at a time with `lstat`
   (never follow parent symlinks). Create only missing real `.claude`/`bin`
   dirs at `0o700`; after mkdir success or `EEXIST`, re-`lstat` and recheck
   type/ownership/mode. Open each write parent with `O_DIRECTORY | O_NOFOLLOW`
   and perform mkdir, leaf classification, `symlink`, temp cleanup, and `rename`
   only through the pinned directory-fd path; never fall back to a lexical path.
4. Leaf classification uses `lstat` + `readlink` only. Create without prior
   unlink; on `EEXIST`, reclassify. Idempotent when the link already targets
   the current source. Repair only a dangling symlink whose normalized
   absolute target's last five path segments exactly equal
   `["node_modules","@decade666","trellis","bin","codeagent-wrapper.mjs"]`
   (never raw-string `endsWith`/`includes`). Preserve regular files,
   directories, special nodes, CCG/custom links, and every live other-prefix
   link.
5. Stale-owned repair uses a cryptographically random same-directory temp
   symlink, then a second parent-jail + leaf `lstat`/`readlink` check before
   `rename`. On mismatch, remove only the temp node.
6. Every compatibility failure emits a stable stderr reason code and exits 0
   so npm install still succeeds. Manual verification:
   `readlink ~/.claude/bin/codeagent-wrapper`.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Local / nested / forged-global / non-postinstall / Windows / missing safe directory-fd path | No HOME write; warn/skip, exit 0 |
| HOME symlink, non-directory, ownership/mode mismatch | Skip; never follow or rewrite |
| Parent `.claude`/`bin` symlink or jail escape | Skip; no destination write |
| Existing file / dir / FIFO / custom / live link | Preserve + `preserve-existing` |
| Exact dangling Trellis path segments | Repair only after second ownership checks |
| `--ignore-scripts` / no uninstall hook | Documented non-goal; no auto cleanup |

### 5. Good / Base / Bad Cases

- **Good**: top-level `npm install -g @decade666/trellis` under an
  effective-uid-owned HOME creates an absolute link to that prefix's
  `bin/codeagent-wrapper.mjs`.
- **Base**: local project dependency install or Trellis runtime resolution —
  no home-bin scan and no HOME mutation from ordinary CLI use.
- **Bad**: overwriting a CCG wrapper, following a parent symlink out of HOME,
  raw-string “looks like Trellis” target matching, or failing the whole npm
  install because the compatibility link could not be created.

### 6. Tests Required

Security matrix unit tests with injected fs/env/uid for lifecycle gates,
parent jail, ownership/mode, collision preservation, create/`EEXIST` races,
dangling exact-segment repair, live/changed-target repair races, missing safe
fd namespace/flags, Windows skip, and catch-all exit 0. Packed global/local
install smoke: supported global creates the link; local does not.

### 7. Wrong vs Correct

Wrong:

```js
// Scans home, overwrites unknown destinations, or fails install on error
fs.symlinkSync(src, dest); // no jail / ownership / collision checks
resolveWrapperPath = () => path.join(os.homedir(), ".claude/bin/codeagent-wrapper");
```

Correct:

```js
// postinstall: fail-closed jail + preserve unknown leaf; exit 0 on skip
// runtime: TRELLIS_CODEAGENT_WRAPPER || bundled || "codeagent-wrapper" on PATH
//          — never scan ~/.claude/bin
```
