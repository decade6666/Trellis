#!/usr/bin/env node
/* global process */
/**
 * Global-install Claude/CCG compatibility link for codeagent-wrapper.
 * Security: global+postinstall+top-level only; real uid-owned HOME jail;
 * O_NOFOLLOW parent fd + /proc/self/fd for mkdir/leaf ops (no lexical fallback);
 * repair only exact-segment dangling Trellis links; failures warn and exit 0.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const TRELLIS_WRAPPER_SEGMENTS = Object.freeze([
  "node_modules",
  "@decade666",
  "trellis",
  "bin",
  "codeagent-wrapper.mjs",
]);

const REASON = Object.freeze({
  NOT_GLOBAL: "skip-not-global",
  LIFECYCLE: "skip-lifecycle",
  INSTALL_IDENTITY: "skip-install-identity",
  PLATFORM: "skip-platform",
  SOURCE: "skip-source",
  PARENT_SYMLINK: "skip-parent-symlink",
  PARENT_MODE: "skip-parent-mode",
  OWNERSHIP: "skip-ownership",
  PRESERVE: "preserve-existing",
  RACE: "skip-race",
  UNEXPECTED: "skip-unexpected",
  CREATED: "created",
  IDEMPOTENT: "idempotent",
  REPAIRED: "repaired",
});

const LEAF_NAME = "codeagent-wrapper";

export function isTrellisWrapperTarget(targetPath) {
  if (typeof targetPath !== "string" || targetPath.length === 0) return false;
  const normalized = path.normalize(targetPath);
  const segments = normalized.split(path.sep).filter((s) => s.length > 0);
  if (segments.length < TRELLIS_WRAPPER_SEGMENTS.length) return false;
  const last5 = segments.slice(-TRELLIS_WRAPPER_SEGMENTS.length);
  for (let i = 0; i < TRELLIS_WRAPPER_SEGMENTS.length; i++) {
    if (last5[i] !== TRELLIS_WRAPPER_SEGMENTS[i]) return false;
  }
  return path.basename(normalized) === "codeagent-wrapper.mjs";
}

function isInsideHome(candidate, homeReal) {
  return candidate === homeReal || candidate.startsWith(homeReal + path.sep);
}

function skip(reason, detail, warn) {
  warn(`[trellis postinstall] ${reason}${detail ? `: ${detail}` : ""}`);
  return { status: "skipped", reason };
}

function preserve(reason, detail, warn) {
  warn(`[trellis postinstall] ${reason}${detail ? `: ${detail}` : ""}`);
  return { status: "preserved", reason };
}

function checkOwnedDir(st, uid) {
  if (st.isSymbolicLink()) return REASON.PARENT_SYMLINK;
  if (!st.isDirectory()) return REASON.PARENT_MODE;
  if (typeof st.uid === "number" && st.uid !== uid) return REASON.OWNERSHIP;
  if ((st.mode & 0o022) !== 0) return REASON.PARENT_MODE;
  return null;
}

function inspectComponent(fsApi, componentPath, uid) {
  let st;
  try {
    st = fsApi.lstatSync(componentPath);
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (code === "ENOENT") return { missing: true };
    throw err;
  }
  const error = checkOwnedDir(st, uid);
  return error ? { error, stat: st } : { stat: st };
}

function revalidateExistingDir(fsApi, dirPath, homeReal, uid, warn, label) {
  const info = inspectComponent(fsApi, dirPath, uid);
  if (info.missing) return skip(REASON.RACE, `${label} disappeared`, warn);
  if (info.error) return skip(info.error, `${label} revalidation`, warn);
  let real;
  try {
    real = fsApi.realpathSync(dirPath);
  } catch {
    return skip(REASON.RACE, `${label} realpath failed`, warn);
  }
  if (!isInsideHome(real, homeReal)) {
    return skip(REASON.PARENT_SYMLINK, `${label} escaped HOME jail`, warn);
  }
  return null;
}

function assertComponentInsideHome(fsApi, componentPath, homeReal, warn) {
  let componentReal;
  try {
    componentReal = fsApi.realpathSync(componentPath);
  } catch {
    return skip(REASON.RACE, "component realpath failed", warn);
  }
  if (!isInsideHome(componentReal, homeReal)) {
    return skip(REASON.PARENT_SYMLINK, "component escaped HOME jail", warn);
  }
  return null;
}

function closeFdQuiet(fsApi, fd) {
  try {
    fsApi.closeSync(fd);
  } catch {
    // ignore close errors
  }
}

/** Require real O_DIRECTORY + O_NOFOLLOW; never OR missing security flags as 0. */
function openDirFlags(fsApi, warn) {
  const c = fsApi.constants ?? fs.constants;
  if (typeof c?.O_DIRECTORY !== "number" || typeof c?.O_NOFOLLOW !== "number") {
    return {
      error: skip(
        REASON.RACE,
        "O_DIRECTORY/O_NOFOLLOW unavailable; refusing open",
        warn,
      ),
    };
  }
  return { flags: (c.O_RDONLY ?? 0) | c.O_DIRECTORY | c.O_NOFOLLOW };
}

function openParentDirFd(fsApi, parentPath, homeReal, uid, warn) {
  const flagRes = openDirFlags(fsApi, warn);
  if (flagRes.error) return flagRes;
  let fd;
  try {
    fd = fsApi.openSync(parentPath, flagRes.flags);
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (code === "ELOOP" || code === "ENOTDIR") {
      return {
        error: skip(REASON.PARENT_SYMLINK, "parent not a real dir", warn),
      };
    }
    return {
      error: skip(REASON.RACE, `open parent failed: ${code ?? "error"}`, warn),
    };
  }
  let st;
  try {
    st = fsApi.fstatSync(fd);
  } catch (err) {
    closeFdQuiet(fsApi, fd);
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    return {
      error: skip(REASON.RACE, `fstat parent failed: ${code ?? "error"}`, warn),
    };
  }
  const ownedErr = checkOwnedDir(st, uid);
  if (ownedErr) {
    closeFdQuiet(fsApi, fd);
    return { error: skip(ownedErr, "parent fd revalidation", warn) };
  }
  // O_NOFOLLOW only covers the final component. An intermediate swap
  // (e.g. .claude -> evil with a real bin) can still open evil/bin.
  // Require the opened inode's /proc realpath to stay inside homeReal.
  const jail = assertPinnedFdInsideHome(fsApi, fd, homeReal, warn);
  if (jail) {
    closeFdQuiet(fsApi, fd);
    return { error: jail };
  }
  return { fd };
}

function assertPinnedFdInsideHome(fsApi, fd, homeReal, warn) {
  const procBase = `/proc/self/fd/${fd}`;
  const hasProc =
    typeof fsApi.existsSync === "function" ? fsApi.existsSync(procBase) : false;
  if (!hasProc) {
    return skip(
      REASON.RACE,
      "pinned-fd path unavailable; refusing lexical fallback",
      warn,
    );
  }
  let real;
  try {
    real = fsApi.realpathSync(procBase);
  } catch {
    return skip(REASON.RACE, "pinned-fd realpath failed", warn);
  }
  if (!isInsideHome(real, homeReal)) {
    return skip(REASON.PARENT_SYMLINK, "opened parent escaped HOME jail", warn);
  }
  return null;
}

function pinnedNamePath(fsApi, fd, name, warn) {
  const procBase = `/proc/self/fd/${fd}`;
  const hasProc =
    typeof fsApi.existsSync === "function" ? fsApi.existsSync(procBase) : false;
  if (!hasProc) {
    return {
      error: skip(
        REASON.RACE,
        "pinned-fd path unavailable; refusing lexical fallback",
        warn,
      ),
    };
  }
  return { path: path.join(procBase, name) };
}

function mkdirWithOpenParent(fsApi, fd, name, warn) {
  const pinned = pinnedNamePath(fsApi, fd, name, warn);
  if (pinned.error) return pinned.error;
  try {
    fsApi.mkdirSync(pinned.path, { mode: 0o700 });
    return null;
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (code === "EEXIST") return null;
    return skip(REASON.RACE, `mkdir failed for ${name}: ${code ?? "error"}`, warn);
  }
}

function mkdirViaParentFd(fsApi, parentPath, name, homeReal, uid, warn) {
  const opened = openParentDirFd(fsApi, parentPath, homeReal, uid, warn);
  if (opened.error) return opened.error;
  try {
    return mkdirWithOpenParent(fsApi, opened.fd, name, warn);
  } finally {
    closeFdQuiet(fsApi, opened.fd);
  }
}

function createMissingComponent(fsApi, componentPath, homeReal, uid, warn) {
  const parentPath = path.dirname(componentPath);
  const parentErr = revalidateExistingDir(
    fsApi, parentPath, homeReal, uid, warn, "mkdir parent",
  );
  if (parentErr) return { ok: false, result: parentErr };
  const mkdirErr = mkdirViaParentFd(
    fsApi, parentPath, path.basename(componentPath), homeReal, uid, warn,
  );
  if (mkdirErr) return { ok: false, result: mkdirErr };
  const info = inspectComponent(fsApi, componentPath, uid);
  if (info.missing) {
    return { ok: false, result: skip(REASON.RACE, "directory missing after mkdir", warn) };
  }
  if (info.error) return { ok: false, result: skip(info.error, componentPath, warn) };
  return { ok: true, info };
}

function ensureSafeDir(fsApi, componentPath, homeReal, uid, warn) {
  let info = inspectComponent(fsApi, componentPath, uid);
  if (info.error) {
    return { ok: false, result: skip(info.error, componentPath, warn) };
  }
  if (info.missing) {
    const created = createMissingComponent(fsApi, componentPath, homeReal, uid, warn);
    if (!created.ok) return created;
    info = created.info;
  }
  const jailErr = assertComponentInsideHome(fsApi, componentPath, homeReal, warn);
  if (jailErr) return { ok: false, result: jailErr };
  return { ok: true, stat: /** @type {import("node:fs").Stats} */ (info.stat) };
}

function resolveLinkTarget(destDir, rawTarget) {
  if (path.isAbsolute(rawTarget)) return path.normalize(rawTarget);
  return path.normalize(path.resolve(destDir, rawTarget));
}

function isDanglingTarget(fsApi, absoluteTarget) {
  try {
    fsApi.lstatSync(absoluteTarget);
    return false;
  } catch (err) {
    return /** @type {NodeJS.ErrnoException} */ (err).code === "ENOENT";
  }
}

function classifyLeaf(fsApi, leafPath, destDir, sourceAbs) {
  let st;
  try {
    st = fsApi.lstatSync(leafPath);
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === "ENOENT") {
      return { action: "create" };
    }
    throw err;
  }
  if (!st.isSymbolicLink()) return { action: "preserve" };
  const rawTarget = fsApi.readlinkSync(leafPath);
  const resolved = resolveLinkTarget(destDir, rawTarget);
  if (resolved === path.normalize(sourceAbs)) return { action: "idempotent" };
  if (isTrellisWrapperTarget(resolved) && isDanglingTarget(fsApi, resolved)) {
    return { action: "repair", rawTarget };
  }
  return { action: "preserve" };
}

export function installCodeagentWrapperLink(deps = {}) {
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? process.platform;
  const getuid = deps.getuid ?? (() => process.getuid?.());
  const homedir = deps.homedir ?? (() => os.homedir());
  const moduleUrl = deps.moduleUrl ?? import.meta.url;
  const warn =
    deps.warn ??
    ((msg) => {
      try {
        process.stderr.write(`${msg}\n`);
      } catch {
        // stderr may be closed
      }
    });
  const fsApi = deps.fs ?? fs;
  try {
    return installCodeagentWrapperLinkInner({
      env, platform, getuid, homedir, moduleUrl, warn, fsApi,
    });
  } catch (err) {
    const message =
      err && /** @type {Error} */ (err).message
        ? /** @type {Error} */ (err).message
        : String(err);
    return skip(REASON.UNEXPECTED, message, warn);
  }
}

function installCodeagentWrapperLinkInner(ctx) {
  const gate = gateLifecycleAndPlatform(ctx);
  if (gate) return gate;
  const identity = resolveInstallIdentity(ctx);
  if (identity.error) return identity.error;
  const sourceErr = validateSource(
    ctx.fsApi, identity.sourcePath, identity.packageBinDir, ctx.warn,
  );
  if (sourceErr) return sourceErr;
  const home = prepareHomeJail(ctx);
  if (home.error) return home.error;
  const dirs = ensureClaudeBinDirs(
    ctx.fsApi, home.home, home.homeReal, home.uid, ctx.warn,
  );
  if (dirs.error) return dirs.error;
  return applyLeafAction({
    fsApi: ctx.fsApi,
    dest: path.join(dirs.binDir, LEAF_NAME),
    binDir: dirs.binDir,
    homeReal: home.homeReal,
    uid: home.uid,
    sourceAbs: path.normalize(identity.sourcePath),
    warn: ctx.warn,
  });
}

function gateLifecycleAndPlatform(ctx) {
  const { env, platform, warn } = ctx;
  if (env.npm_config_global !== "true") {
    return skip(REASON.NOT_GLOBAL, "not a global npm install", warn);
  }
  if (env.npm_lifecycle_event !== "postinstall") {
    return skip(REASON.LIFECYCLE, "not a postinstall lifecycle", warn);
  }
  if (platform === "win32") {
    return skip(REASON.PLATFORM, "Windows symlink unsupported in postinstall", warn);
  }
  return null;
}

function resolveInstallIdentity(ctx) {
  const { env, moduleUrl, fsApi, warn } = ctx;
  const prefix = env.npm_config_prefix;
  if (!prefix || typeof prefix !== "string" || prefix.length === 0) {
    return { error: skip(REASON.INSTALL_IDENTITY, "missing npm_config_prefix", warn) };
  }
  let helperPath;
  try {
    helperPath = fileURLToPath(moduleUrl);
  } catch {
    return { error: skip(REASON.INSTALL_IDENTITY, "invalid module URL", warn) };
  }
  const packageBinDir = path.dirname(helperPath);
  const packageRoot = path.dirname(packageBinDir);
  const sourcePath = path.join(packageBinDir, "codeagent-wrapper.mjs");
  const roots = realpathPackagePair(fsApi, packageRoot, prefix, warn);
  if (roots.error) return roots;
  if (roots.realPackageRoot !== roots.expectedRoot) {
    return {
      error: skip(
        REASON.INSTALL_IDENTITY,
        "package is not the top-level global @decade666/trellis",
        warn,
      ),
    };
  }
  const initErr = rejectInitCwdNesting(fsApi, env.INIT_CWD, roots.realPackageRoot, warn);
  if (initErr) return { error: initErr };
  return { sourcePath, packageBinDir, realPackageRoot: roots.realPackageRoot };
}

function realpathPackagePair(fsApi, packageRoot, prefix, warn) {
  try {
    return {
      realPackageRoot: fsApi.realpathSync(packageRoot),
      expectedRoot: fsApi.realpathSync(
        path.join(prefix, "lib", "node_modules", "@decade666", "trellis"),
      ),
    };
  } catch {
    return {
      error: skip(
        REASON.INSTALL_IDENTITY,
        "package root or expected prefix path not resolvable",
        warn,
      ),
    };
  }
}

function rejectInitCwdNesting(fsApi, initCwd, realPackageRoot, warn) {
  if (!initCwd || typeof initCwd !== "string" || initCwd.length === 0) return null;
  try {
    const initReal = fsApi.realpathSync(initCwd);
    const localNm = path.join(initReal, "node_modules");
    if (
      realPackageRoot === localNm ||
      realPackageRoot.startsWith(localNm + path.sep)
    ) {
      return skip(
        REASON.INSTALL_IDENTITY,
        "package root is under INIT_CWD/node_modules",
        warn,
      );
    }
  } catch {
    // INIT_CWD unresolvable — other gates still apply.
  }
  return null;
}

function validateSource(fsApi, sourcePath, packageBinDir, warn) {
  let sourceStat;
  try {
    sourceStat = fsApi.lstatSync(sourcePath);
  } catch {
    return skip(REASON.SOURCE, "source missing", warn);
  }
  if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) {
    return skip(REASON.SOURCE, "source is not a regular file", warn);
  }
  let sourceReal;
  let binReal;
  try {
    sourceReal = fsApi.realpathSync(sourcePath);
    binReal = fsApi.realpathSync(packageBinDir);
  } catch {
    return skip(REASON.SOURCE, "source realpath failed", warn);
  }
  if (
    path.dirname(sourceReal) !== binReal ||
    path.basename(sourceReal) !== "codeagent-wrapper.mjs"
  ) {
    return skip(REASON.SOURCE, "source escaped package bin directory", warn);
  }
  return null;
}

function prepareHomeJail(ctx) {
  const { getuid, homedir, fsApi, warn } = ctx;
  const uid = getuid();
  if (typeof uid !== "number") {
    return { error: skip(REASON.OWNERSHIP, "effective uid unavailable", warn) };
  }
  let home;
  try {
    home = homedir();
  } catch {
    return { error: skip(REASON.OWNERSHIP, "homedir unavailable", warn) };
  }
  if (!home || typeof home !== "string") {
    return { error: skip(REASON.OWNERSHIP, "homedir empty", warn) };
  }
  const homeInfo = inspectComponent(fsApi, home, uid);
  if (homeInfo.missing) {
    return { error: skip(REASON.OWNERSHIP, "HOME does not exist", warn) };
  }
  if (homeInfo.error) return { error: skip(homeInfo.error, "HOME", warn) };
  let homeReal;
  try {
    homeReal = fsApi.realpathSync(home);
  } catch {
    return { error: skip(REASON.RACE, "HOME realpath failed", warn) };
  }
  return { home, homeReal, uid };
}

function ensureClaudeBinDirs(fsApi, home, homeReal, uid, warn) {
  const claudeDir = path.join(home, ".claude");
  const claudeReady = ensureSafeDir(fsApi, claudeDir, homeReal, uid, warn);
  if (!claudeReady.ok) return { error: claudeReady.result };
  const binDir = path.join(claudeDir, "bin");
  const binReady = ensureSafeDir(fsApi, binDir, homeReal, uid, warn);
  if (!binReady.ok) return { error: binReady.result };
  return { binDir };
}

/** Open final parent once; leaf ops only via /proc/self/fd/<fd>/<name>. */
function withPinnedParent(args, work) {
  const { fsApi, binDir, homeReal, uid, warn } = args;
  const parentErr = revalidateExistingDir(
    fsApi, binDir, homeReal, uid, warn, "final parent",
  );
  if (parentErr) return parentErr;
  const opened = openParentDirFd(fsApi, binDir, homeReal, uid, warn);
  if (opened.error) return opened.error;
  try {
    const pinBase = pinnedNamePath(fsApi, opened.fd, LEAF_NAME, warn);
    if (pinBase.error) return pinBase.error;
    return work(opened.fd, pinBase.path);
  } finally {
    closeFdQuiet(fsApi, opened.fd);
  }
}

function applyLeafAction(args) {
  return withPinnedParent(args, (_fd, pinnedDest) => {
    const classification = classifyLeaf(
      args.fsApi, pinnedDest, args.binDir, args.sourceAbs,
    );
    if (classification.action === "idempotent") {
      return { status: "idempotent", reason: REASON.IDEMPOTENT };
    }
    if (classification.action === "preserve") {
      return preserve(REASON.PRESERVE, args.dest, args.warn);
    }
    if (classification.action === "create") {
      return createLeafLink(args, pinnedDest);
    }
    if (classification.action === "repair") {
      return repairDanglingLink({
        ...args,
        pinnedDest,
        rawTarget: classification.rawTarget,
      });
    }
    return skip(REASON.UNEXPECTED, "unhandled classification", args.warn);
  });
}

function createLeafLink(args, pinnedDest) {
  const { fsApi, sourceAbs, warn } = args;
  try {
    fsApi.symlinkSync(sourceAbs, pinnedDest, "file");
    return { status: "created", reason: REASON.CREATED };
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (code === "EEXIST") {
      const again = classifyLeaf(fsApi, pinnedDest, args.binDir, sourceAbs);
      return handleCreateEexist(again, { ...args, pinnedDest });
    }
    return skip(REASON.RACE, `symlink failed: ${code ?? "error"}`, warn);
  }
}

function handleCreateEexist(classification, args) {
  if (classification.action === "idempotent") {
    return { status: "idempotent", reason: REASON.IDEMPOTENT };
  }
  if (classification.action === "repair") {
    return repairDanglingLink({
      ...args,
      rawTarget: classification.rawTarget,
    });
  }
  if (classification.action === "create") {
    return skip(REASON.RACE, "destination raced during create", args.warn);
  }
  return preserve(REASON.PRESERVE, args.dest, args.warn);
}

function cleanupOwnedTemp(fsApi, pinnedTemp, destDir, sourceAbs, warn) {
  try {
    const st = fsApi.lstatSync(pinnedTemp);
    if (!st.isSymbolicLink()) {
      skip(REASON.RACE, "temp path changed type; preserving", warn);
      return;
    }
    const rawTarget = fsApi.readlinkSync(pinnedTemp);
    if (resolveLinkTarget(destDir, rawTarget) !== path.normalize(sourceAbs)) {
      skip(REASON.RACE, "temp path changed target; preserving", warn);
      return;
    }
    fsApi.unlinkSync(pinnedTemp);
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== "ENOENT") {
      skip(REASON.RACE, "temp cleanup could not verify ownership", warn);
    }
  }
}

function repairDanglingLink(args) {
  const { fsApi, binDir, sourceAbs, rawTarget, warn, pinnedDest } = args;
  const tmpName = `.codeagent-wrapper.${crypto.randomBytes(16).toString("hex")}.tmp`;
  const pinnedTemp = path.join(path.dirname(pinnedDest), tmpName);
  try {
    fsApi.symlinkSync(sourceAbs, pinnedTemp, "file");
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    return skip(REASON.RACE, `temp symlink failed: ${code ?? "error"}`, warn);
  }
  const cleanupTemp = () => {
    cleanupOwnedTemp(fsApi, pinnedTemp, binDir, sourceAbs, warn);
  };
  const second = secondCheckBeforeRename(
    fsApi, pinnedDest, binDir, rawTarget, warn, cleanupTemp,
  );
  if (second) return second;
  try {
    fsApi.renameSync(pinnedTemp, pinnedDest);
  } catch (err) {
    cleanupTemp();
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    return skip(REASON.RACE, `rename failed: ${code ?? "error"}`, warn);
  }
  return { status: "repaired", reason: REASON.REPAIRED };
}

/**
 * Re-read dest: raw text must match original classification, and the
 * re-resolved target must still be an exact dangling Trellis path.
 */
function secondCheckBeforeRename(
  fsApi, pinnedDest, binDir, rawTarget, warn, cleanupTemp,
) {
  let st;
  let currentTarget;
  try {
    st = fsApi.lstatSync(pinnedDest);
    if (!st.isSymbolicLink()) {
      cleanupTemp();
      return preserve(REASON.PRESERVE, "destination type changed before rename", warn);
    }
    currentTarget = fsApi.readlinkSync(pinnedDest);
  } catch (err) {
    cleanupTemp();
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (code === "ENOENT") {
      return skip(REASON.RACE, "destination vanished before rename", warn);
    }
    return skip(REASON.RACE, "destination revalidation failed", warn);
  }
  if (currentTarget !== rawTarget) {
    cleanupTemp();
    return skip(REASON.RACE, "destination target changed before rename", warn);
  }
  const resolved = resolveLinkTarget(binDir, currentTarget);
  if (!isTrellisWrapperTarget(resolved) || !isDanglingTarget(fsApi, resolved)) {
    cleanupTemp();
    return preserve(
      REASON.PRESERVE,
      "destination no longer a dangling Trellis link before rename",
      warn,
    );
  }
  return null;
}

export function main() {
  try {
    installCodeagentWrapperLink();
  } catch (err) {
    const message =
      err && /** @type {Error} */ (err).message
        ? /** @type {Error} */ (err).message
        : String(err);
    try {
      process.stderr.write(`[trellis postinstall] ${REASON.UNEXPECTED}: ${message}\n`);
    } catch {
      // stderr may be closed
    }
  }
  process.exitCode = 0;
}

if (process.argv[1]) {
  let invoked = process.argv[1];
  try {
    invoked = fs.realpathSync(invoked);
  } catch {
    // keep original argv path
  }
  if (import.meta.url === pathToFileURL(invoked).href) {
    main();
  }
}
