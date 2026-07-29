import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

import {
  installCodeagentWrapperLink,
  isTrellisWrapperTarget,
  TRELLIS_WRAPPER_SEGMENTS,
} from "../../bin/install-codeagent-wrapper-link.mjs";
import {
  baseEnv,
  ensureParents,
  HELPER_PATH,
  makeSandbox,
  runInstall,
  track,
  writeWrapper,
} from "./codeagent-wrapper-install-link-fixture.js";

describe("isTrellisWrapperTarget", () => {
  it("matches only the exact final five path segments", () => {
    expect(TRELLIS_WRAPPER_SEGMENTS).toEqual([
      "node_modules",
      "@decade666",
      "trellis",
      "bin",
      "codeagent-wrapper.mjs",
    ]);
    expect(
      isTrellisWrapperTarget(
        "/usr/lib/node_modules/@decade666/trellis/bin/codeagent-wrapper.mjs",
      ),
    ).toBe(true);
    expect(
      isTrellisWrapperTarget(
        "/tmp/not_really_node_modules/@decade666/trellis/bin/codeagent-wrapper.mjs",
      ),
    ).toBe(false);
    expect(
      isTrellisWrapperTarget(
        "/usr/lib/node_modules/@decade666/trellis/bin/codeagent-wrapper.mjs.bak",
      ),
    ).toBe(false);
    expect(
      isTrellisWrapperTarget(
        "/usr/lib/node_modules/@decade666/trellis/bin/other.mjs",
      ),
    ).toBe(false);
  });
});

describe("installCodeagentWrapperLink lifecycle / identity gates", () => {
  it("skips when npm_config_global is not true", () => {
    const sb = makeSandbox();
    const { result, warnings } = runInstall(sb, {
      env: baseEnv(sb, { npm_config_global: "false" }),
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-not-global");
    expect(warnings.some((w) => w.includes("skip-not-global"))).toBe(true);
    expect(fs.existsSync(sb.dest)).toBe(false);
    expect(fs.existsSync(sb.claudeDir)).toBe(false);
  });

  it("skips when lifecycle is not postinstall", () => {
    const sb = makeSandbox();
    const { result, warnings } = runInstall(sb, {
      env: baseEnv(sb, { npm_lifecycle_event: "install" }),
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-lifecycle");
    expect(warnings.some((w) => w.includes("skip-lifecycle"))).toBe(true);
    expect(fs.existsSync(sb.dest)).toBe(false);
  });

  it("skips direct / non-lifecycle execution with no env", () => {
    const sb = makeSandbox();
    const { result } = runInstall(sb, { env: {} });
    expect(result.status).toBe("skipped");
    expect(["skip-not-global", "skip-lifecycle"]).toContain(result.reason);
    expect(fs.existsSync(sb.dest)).toBe(false);
  });

  it("skips Windows platforms", () => {
    const sb = makeSandbox();
    const { result, warnings } = runInstall(sb, { platform: "win32" });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-platform");
    expect(warnings.some((w) => w.includes("skip-platform"))).toBe(true);
    expect(fs.existsSync(sb.dest)).toBe(false);
  });

  it("skips when package root is not the top-level global trellis install", () => {
    const sb = makeSandbox();
    const { result, warnings } = runInstall(sb, {
      env: baseEnv(sb, {
        npm_config_prefix: path.join(sb.root, "other-prefix"),
      }),
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-install-identity");
    expect(warnings.some((w) => w.includes("skip-install-identity"))).toBe(
      true,
    );
    expect(fs.existsSync(sb.dest)).toBe(false);
  });

  it("skips nested dependency under another global package", () => {
    const sb = makeSandbox();
    const nestedRoot = path.join(
      sb.prefix,
      "lib",
      "node_modules",
      "other-pkg",
      "node_modules",
      "@decade666",
      "trellis",
    );
    const nestedBin = path.join(nestedRoot, "bin");
    const nestedSource = path.join(nestedBin, "codeagent-wrapper.mjs");
    const nestedHelper = path.join(
      nestedBin,
      "install-codeagent-wrapper-link.mjs",
    );
    fs.mkdirSync(nestedBin, { recursive: true });
    writeWrapper(nestedSource);
    fs.copyFileSync(HELPER_PATH, nestedHelper);

    const { result, warnings } = runInstall(sb, {
      moduleUrl: pathToFileURL(nestedHelper).href,
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-install-identity");
    expect(warnings.some((w) => w.includes("skip-install-identity"))).toBe(
      true,
    );
    expect(fs.existsSync(sb.dest)).toBe(false);
  });

  it("skips when package root sits under INIT_CWD/node_modules (forged global local tree)", () => {
    const root = track(
      fs.mkdtempSync(path.join(os.tmpdir(), "trellis-forged-")),
    );
    const home = path.join(root, "home");
    const initCwd = path.join(root, "project");
    const packageRoot = path.join(
      initCwd,
      "node_modules",
      "@decade666",
      "trellis",
    );
    const binDir = path.join(packageRoot, "bin");
    const source = path.join(binDir, "codeagent-wrapper.mjs");
    const helper = path.join(binDir, "install-codeagent-wrapper-link.mjs");
    const prefix = path.join(root, "prefix");
    const expectedParent = path.join(
      prefix,
      "lib",
      "node_modules",
      "@decade666",
    );
    fs.mkdirSync(home, { recursive: true, mode: 0o700 });
    fs.chmodSync(home, 0o700);
    fs.mkdirSync(binDir, { recursive: true });
    writeWrapper(source);
    fs.copyFileSync(HELPER_PATH, helper);
    fs.mkdirSync(expectedParent, { recursive: true });
    fs.symlinkSync(packageRoot, path.join(expectedParent, "trellis"));

    const result = installCodeagentWrapperLink({
      env: {
        npm_config_global: "true",
        npm_lifecycle_event: "postinstall",
        npm_config_prefix: prefix,
        INIT_CWD: initCwd,
      },
      platform: "linux",
      getuid: () => process.getuid?.() ?? 0,
      homedir: () => home,
      moduleUrl: pathToFileURL(helper).href,
      warn: vi.fn(),
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-install-identity");
    expect(fs.existsSync(path.join(home, ".claude"))).toBe(false);
  });

  it("skips when source is missing", () => {
    const sb = makeSandbox();
    fs.rmSync(sb.source);
    const { result, warnings } = runInstall(sb);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-source");
    expect(warnings.some((w) => w.includes("skip-source"))).toBe(true);
  });

  it("skips when source is a symlink", () => {
    const sb = makeSandbox();
    const real = path.join(sb.binDir, "real-wrapper.mjs");
    fs.renameSync(sb.source, real);
    fs.symlinkSync(real, sb.source);
    const { result, warnings } = runInstall(sb);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-source");
    expect(warnings.some((w) => w.includes("skip-source"))).toBe(true);
  });

  it("skips when source is not a regular file", () => {
    const sb = makeSandbox();
    fs.rmSync(sb.source);
    fs.mkdirSync(sb.source);
    const { result, warnings } = runInstall(sb);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-source");
    expect(warnings.some((w) => w.includes("skip-source"))).toBe(true);
  });
});

describe("installCodeagentWrapperLink HOME / parent jail", () => {
  it("skips when HOME is not owned by effective uid", () => {
    const sb = makeSandbox();
    const realUid = process.getuid?.() ?? 0;
    const { result, warnings } = runInstall(sb, {
      getuid: () => realUid + 1,
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-ownership");
    expect(warnings.some((w) => w.includes("skip-ownership"))).toBe(true);
    expect(fs.existsSync(sb.dest)).toBe(false);
  });

  it("skips when HOME is group/other-writable", () => {
    const sb = makeSandbox();
    fs.chmodSync(sb.home, 0o775);
    const { result, warnings } = runInstall(sb);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-parent-mode");
    expect(warnings.some((w) => w.includes("skip-parent-mode"))).toBe(true);
    expect(fs.existsSync(sb.dest)).toBe(false);
  });

  it("skips when HOME itself is a symlink", () => {
    const root = track(
      fs.mkdtempSync(path.join(os.tmpdir(), "trellis-home-link-")),
    );
    const realHome = path.join(root, "real-home");
    const homeLink = path.join(root, "home-link");
    fs.mkdirSync(realHome, { recursive: true, mode: 0o700 });
    fs.chmodSync(realHome, 0o700);
    fs.symlinkSync(realHome, homeLink);

    const prefix = path.join(root, "prefix");
    const packageRoot = path.join(
      prefix,
      "lib",
      "node_modules",
      "@decade666",
      "trellis",
    );
    const binDir = path.join(packageRoot, "bin");
    const source = path.join(binDir, "codeagent-wrapper.mjs");
    const helper = path.join(binDir, "install-codeagent-wrapper-link.mjs");
    fs.mkdirSync(binDir, { recursive: true });
    writeWrapper(source);
    fs.copyFileSync(HELPER_PATH, helper);

    const warnings: string[] = [];
    const result = installCodeagentWrapperLink({
      env: {
        npm_config_global: "true",
        npm_lifecycle_event: "postinstall",
        npm_config_prefix: prefix,
      },
      platform: "linux",
      getuid: () => process.getuid?.() ?? 0,
      homedir: () => homeLink,
      moduleUrl: pathToFileURL(helper).href,
      warn: (m: string) => warnings.push(m),
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-parent-symlink");
    expect(warnings.some((w) => w.includes("skip-parent-symlink"))).toBe(true);
  });

  it("skips when existing .claude is a symlink", () => {
    const sb = makeSandbox();
    const elsewhere = path.join(sb.root, "elsewhere-claude");
    fs.mkdirSync(elsewhere, { recursive: true, mode: 0o700 });
    fs.symlinkSync(elsewhere, sb.claudeDir);
    const { result, warnings } = runInstall(sb);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-parent-symlink");
    expect(warnings.some((w) => w.includes("skip-parent-symlink"))).toBe(true);
    expect(fs.existsSync(sb.dest)).toBe(false);
  });

  it("skips when existing .claude/bin is a symlink", () => {
    const sb = makeSandbox();
    fs.mkdirSync(sb.claudeDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(sb.claudeDir, 0o700);
    const elsewhere = path.join(sb.root, "elsewhere-bin");
    fs.mkdirSync(elsewhere, { recursive: true, mode: 0o700 });
    fs.symlinkSync(elsewhere, sb.claudeBinDir);
    const { result, warnings } = runInstall(sb);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-parent-symlink");
    expect(warnings.some((w) => w.includes("skip-parent-symlink"))).toBe(true);
    expect(fs.existsSync(sb.dest)).toBe(false);
  });

  it("skips when existing .claude is a regular file", () => {
    const sb = makeSandbox();
    fs.writeFileSync(sb.claudeDir, "not-a-dir");
    const { result, warnings } = runInstall(sb);
    expect(result.status).toBe("skipped");
    expect(["skip-parent-mode", "skip-ownership"]).toContain(result.reason);
    expect(warnings.length).toBeGreaterThan(0);
    expect(fs.existsSync(sb.dest)).toBe(false);
  });

  it("skips when existing .claude is group/other-writable", () => {
    const sb = makeSandbox();
    fs.mkdirSync(sb.claudeDir, { recursive: true, mode: 0o755 });
    fs.chmodSync(sb.claudeDir, 0o775);
    const { result, warnings } = runInstall(sb);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-parent-mode");
    expect(warnings.some((w) => w.includes("skip-parent-mode"))).toBe(true);
  });

  it("aborts when mkdir succeeds but component is replaced by a symlink before revalidation", () => {
    const sb = makeSandbox();
    const realFs = fs;
    const evil = path.join(sb.root, "evil-claude");
    let mkdirCount = 0;
    const { result, warnings } = runInstall(sb, {
      fs: {
        ...realFs,
        mkdirSync(p: fs.PathLike, opts?: fs.MakeDirectoryOptions) {
          mkdirCount += 1;
          realFs.mkdirSync(p, opts);
          if (mkdirCount === 1) {
            // Replace freshly created .claude with a symlink before re-lstat.
            realFs.rmSync(p, { recursive: true, force: true });
            realFs.mkdirSync(evil, { recursive: true });
            realFs.symlinkSync(evil, p);
          }
        },
      },
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-parent-symlink");
    expect(warnings.some((w) => w.includes("skip-parent-symlink"))).toBe(true);
    expect(fs.existsSync(path.join(sb.home, ".claude", "bin"))).toBe(false);
    expect(fs.existsSync(path.join(evil, "bin"))).toBe(false);
    expect(
      fs.existsSync(path.join(sb.home, ".claude", "bin", "codeagent-wrapper")),
    ).toBe(false);
  });

  it("aborts with zero evil writes when .claude becomes a symlink before bin mkdir", () => {
    const sb = makeSandbox();
    const realFs = fs;
    const evil = path.join(sb.root, "evil-outside");
    realFs.mkdirSync(evil, { recursive: true, mode: 0o700 });
    // Pre-create real .claude so only the bin component needs mkdir.
    realFs.mkdirSync(sb.claudeDir, { recursive: true, mode: 0o700 });
    realFs.chmodSync(sb.claudeDir, 0o700);

    // Race window: after parent revalidation, swap .claude → evil symlink
    // before the component mkdir. A path-based mkdir would create evil/bin;
    // O_NOFOLLOW parent-fd mkdir must create nothing under evil.
    let swapped = false;
    const { result, warnings } = runInstall(sb, {
      fs: {
        ...realFs,
        openSync(p: fs.PathLike, flags: number | string, mode?: number) {
          const pathStr = String(p);
          if (pathStr === sb.claudeDir && !swapped) {
            swapped = true;
            realFs.rmSync(sb.claudeDir, { recursive: true, force: true });
            realFs.symlinkSync(evil, sb.claudeDir);
          }
          return realFs.openSync(p, flags as never, mode as never);
        },
        mkdirSync(p: fs.PathLike, opts?: fs.MakeDirectoryOptions) {
          const pathStr = String(p);
          // If helper falls back to lexical mkdir of home/.claude/bin after
          // the swap, follow the symlink and write under evil — the bug.
          if (pathStr === sb.claudeBinDir && !swapped) {
            swapped = true;
            realFs.rmSync(sb.claudeDir, { recursive: true, force: true });
            realFs.symlinkSync(evil, sb.claudeDir);
          }
          return realFs.mkdirSync(p, opts);
        },
      },
    });

    expect(result.status).toBe("skipped");
    expect(
      ["skip-parent-symlink", "skip-race", "skip-parent-mode"].includes(
        result.reason ?? "",
      ),
    ).toBe(true);
    expect(warnings.length).toBeGreaterThan(0);
    // Zero-write jail: evil must not gain a bin directory or leaf link.
    expect(fs.existsSync(path.join(evil, "bin"))).toBe(false);
    expect(fs.existsSync(path.join(evil, "bin", "codeagent-wrapper"))).toBe(
      false,
    );
    expect(fs.existsSync(sb.dest)).toBe(false);
  });

  it("does not write outside HOME when final bin parent is swapped after open", () => {
    const sb = makeSandbox();
    ensureParents(sb);
    const evil = path.join(sb.root, "evil-bin");
    fs.mkdirSync(evil, { recursive: true, mode: 0o700 });

    const realFs = fs;
    let swapped = false;
    const { result, warnings } = runInstall(sb, {
      fs: {
        ...realFs,
        openSync(p: fs.PathLike, flags: number | string, mode?: number) {
          const fd = realFs.openSync(p, flags as never, mode as never);
          if (String(p) === sb.claudeBinDir && !swapped) {
            swapped = true;
            // Keep the real inode alive for the open fd, but make the lexical
            // bin path a symlink to evil so any lexical leaf write escapes.
            const realBin = `${sb.claudeBinDir}.real`;
            realFs.renameSync(sb.claudeBinDir, realBin);
            realFs.symlinkSync(evil, sb.claudeBinDir);
          }
          return fd;
        },
      },
    });
    expect(warnings.length).toBeGreaterThanOrEqual(0);
    expect(result.reason).not.toBe("skip-unexpected");
    expect(fs.existsSync(path.join(evil, "codeagent-wrapper"))).toBe(false);
    expect(
      fs
        .readdirSync(evil)
        .filter((n) => n.startsWith(".codeagent-wrapper.")),
    ).toEqual([]);
  });
});

describe("installCodeagentWrapperLink create / idempotent / repair", () => {
  it("creates an absolute file symlink on first global postinstall", () => {
    const sb = makeSandbox();
    const { result, warnings } = runInstall(sb);
    expect(result.status).toBe("created");
    expect(warnings).toEqual([]);
    expect(fs.lstatSync(sb.dest).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(sb.dest)).toBe(sb.source);
    expect(fs.statSync(sb.claudeDir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(sb.claudeBinDir).mode & 0o777).toBe(0o700);
  });

  it("is idempotent when the link already points at the current source", () => {
    const sb = makeSandbox();
    expect(runInstall(sb).result.status).toBe("created");
    const second = runInstall(sb);
    expect(second.result.status).toBe("idempotent");
    expect(fs.readlinkSync(sb.dest)).toBe(sb.source);
  });

  it("is idempotent for a relative link that lexically resolves to the current source", () => {
    const sb = makeSandbox();
    ensureParents(sb);
    const relative = path.relative(sb.claudeBinDir, sb.source);
    fs.symlinkSync(relative, sb.dest);
    const { result } = runInstall(sb);
    expect(result.status).toBe("idempotent");
    expect(fs.readlinkSync(sb.dest)).toBe(relative);
  });

  it("repairs only a dangling exact-segment Trellis link via temp+rename", () => {
    const sb = makeSandbox();
    ensureParents(sb);
    const staleTarget = path.join(
      sb.root,
      "old-prefix",
      "lib",
      "node_modules",
      "@decade666",
      "trellis",
      "bin",
      "codeagent-wrapper.mjs",
    );
    fs.symlinkSync(staleTarget, sb.dest);
    expect(fs.existsSync(staleTarget)).toBe(false);

    const { result } = runInstall(sb);
    expect(result.status).toBe("repaired");
    expect(fs.readlinkSync(sb.dest)).toBe(sb.source);
    const leftovers = fs
      .readdirSync(sb.claudeBinDir)
      .filter((name) => name !== "codeagent-wrapper");
    expect(leftovers).toEqual([]);
  });

  it("preserves a live link to another Trellis prefix", () => {
    const sb = makeSandbox();
    ensureParents(sb);
    const other = path.join(
      sb.root,
      "other-prefix",
      "lib",
      "node_modules",
      "@decade666",
      "trellis",
      "bin",
      "codeagent-wrapper.mjs",
    );
    writeWrapper(other, "// other live wrapper\n");
    fs.symlinkSync(other, sb.dest);

    const { result, warnings } = runInstall(sb);
    expect(result.status).toBe("preserved");
    expect(result.reason).toBe("preserve-existing");
    expect(warnings.some((w) => w.includes("preserve-existing"))).toBe(true);
    expect(fs.readlinkSync(sb.dest)).toBe(other);
  });

  it("preserves regular file destinations", () => {
    const sb = makeSandbox();
    ensureParents(sb);
    fs.writeFileSync(sb.dest, "#!/bin/sh\necho custom\n", { mode: 0o755 });
    const before = fs.readFileSync(sb.dest, "utf8");
    const { result, warnings } = runInstall(sb);
    expect(result.status).toBe("preserved");
    expect(result.reason).toBe("preserve-existing");
    expect(warnings.some((w) => w.includes("preserve-existing"))).toBe(true);
    expect(fs.lstatSync(sb.dest).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(sb.dest, "utf8")).toBe(before);
  });

  it("preserves directory destinations", () => {
    const sb = makeSandbox();
    fs.mkdirSync(sb.dest, { recursive: true, mode: 0o700 });
    fs.chmodSync(sb.claudeDir, 0o700);
    fs.chmodSync(sb.claudeBinDir, 0o700);
    const { result, warnings } = runInstall(sb);
    expect(result.status).toBe("preserved");
    expect(result.reason).toBe("preserve-existing");
    expect(warnings.some((w) => w.includes("preserve-existing"))).toBe(true);
    expect(fs.lstatSync(sb.dest).isDirectory()).toBe(true);
  });

  it("preserves custom/CCG links and fake raw-string suffixes", () => {
    const sb = makeSandbox();
    ensureParents(sb);

    const cases = [
      path.join(sb.root, "ccg", "full-wrapper.mjs"),
      path.join(
        sb.root,
        "not_really_node_modules",
        "@decade666",
        "trellis",
        "bin",
        "codeagent-wrapper.mjs",
      ),
      path.join(
        sb.root,
        "lib",
        "node_modules",
        "@decade666",
        "trellis",
        "bin",
        "codeagent-wrapper.mjs.bak",
      ),
    ];

    for (const target of cases) {
      try {
        fs.lstatSync(sb.dest);
        fs.unlinkSync(sb.dest);
      } catch {
        // missing is fine
      }
      if (target.endsWith("full-wrapper.mjs")) {
        writeWrapper(target, "// ccg\n");
      }
      fs.symlinkSync(target, sb.dest);
      const { result, warnings } = runInstall(sb);
      expect(result.status).toBe("preserved");
      expect(result.reason).toBe("preserve-existing");
      expect(warnings.some((w) => w.includes("preserve-existing"))).toBe(true);
      expect(fs.readlinkSync(sb.dest)).toBe(target);
    }
  });
});

describe("installCodeagentWrapperLink static / packed constraints", () => {
  it("only imports node: built-ins and has no shell/network/dynamic import", () => {
    const source = fs.readFileSync(HELPER_PATH, "utf8");
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const importLines = code
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("import "));
    expect(importLines.length).toBeGreaterThan(0);
    for (const line of importLines) {
      expect(line).toMatch(/from "node:/);
    }
    expect(code).not.toMatch(/\b(?:exec|execSync|spawn|spawnSync)\b/);
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/\bimport\s*\(/);
    expect(code).not.toMatch(/from ["'](?!node:)/);
  });

  it("package.json declares the postinstall helper", () => {
    const pkg = JSON.parse(
      fs.readFileSync(
        fileURLToPath(new URL("../../package.json", import.meta.url)),
        "utf8",
      ),
    ) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.postinstall).toBe(
      "node ./bin/install-codeagent-wrapper-link.mjs",
    );
  });

  it("never trusts SUDO_USER for destination selection", () => {
    const source = fs.readFileSync(HELPER_PATH, "utf8");
    expect(source).not.toMatch(/SUDO_USER/);
  });
});
