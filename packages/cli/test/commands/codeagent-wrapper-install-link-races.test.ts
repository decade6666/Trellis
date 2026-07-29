import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  ensureParents,
  HELPER_PATH,
  isSameLeafPath,
  isTempLeafPath,
  makeSandbox,
  runInstall,
} from "./codeagent-wrapper-install-link-fixture.js";

function swapBinLexicalToEvil(sb: ReturnType<typeof makeSandbox>, evil: string): void {
  // Keep the open directory inode; only redirect the lexical path.
  const realBin = `${sb.claudeBinDir}.real`;
  fs.renameSync(sb.claudeBinDir, realBin);
  fs.symlinkSync(evil, sb.claudeBinDir);
}

describe("installCodeagentWrapperLink races and failure contract", () => {
  it("preserves FIFO destinations when available", () => {
    const sb = makeSandbox();
    ensureParents(sb);
    const r = spawnSync("mkfifo", [sb.dest], { encoding: "utf8" });
    if (r.status !== 0) {
      return;
    }
    const { result, warnings } = runInstall(sb);
    expect(result.status).toBe("preserved");
    expect(result.reason).toBe("preserve-existing");
    expect(warnings.some((w) => w.includes("preserve-existing"))).toBe(true);
    expect(fs.lstatSync(sb.dest).isFIFO()).toBe(true);
  });

  it("reclassifies create-time EEXIST without unlinking", () => {
    const sb = makeSandbox();
    ensureParents(sb);
    const realFs = fs;
    let destLstatCount = 0;
    const { result, warnings } = runInstall(sb, {
      fs: {
        ...realFs,
        lstatSync(p: fs.PathLike, opts?: fs.StatOptions) {
          if (isSameLeafPath(p, sb.dest)) {
            destLstatCount += 1;
            if (destLstatCount === 1) {
              const err = new Error("ENOENT") as NodeJS.ErrnoException;
              err.code = "ENOENT";
              throw err;
            }
          }
          return realFs.lstatSync(p, opts as never);
        },
        symlinkSync(
          target: fs.PathLike,
          p: fs.PathLike,
          type?: fs.symlink.Type | null,
        ) {
          if (isSameLeafPath(p, sb.dest)) {
            realFs.writeFileSync(sb.dest, "preexisting\n");
            const err = new Error("EEXIST") as NodeJS.ErrnoException;
            err.code = "EEXIST";
            throw err;
          }
          return realFs.symlinkSync(target, p, type);
        },
      },
    });

    expect(result.status).toBe("preserved");
    expect(result.reason).toBe("preserve-existing");
    expect(warnings.some((w) => w.includes("preserve-existing"))).toBe(true);
    expect(fs.lstatSync(sb.dest).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(sb.dest, "utf8")).toBe("preexisting\n");
  });

  it("aborts replacement and removes only the temp link when destination changes before rename", () => {
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

    const realFs = fs;
    let createdTemp: string | null = null;
    let postTempDestLstat = 0;
    const { result, warnings } = runInstall(sb, {
      fs: {
        ...realFs,
        symlinkSync(
          target: fs.PathLike,
          p: fs.PathLike,
          type?: fs.symlink.Type | null,
        ) {
          if (isTempLeafPath(p)) {
            createdTemp = String(p);
          }
          return realFs.symlinkSync(target, p, type);
        },
        lstatSync(p: fs.PathLike, opts?: fs.StatOptions) {
          if (createdTemp && isSameLeafPath(p, sb.dest)) {
            postTempDestLstat += 1;
            if (postTempDestLstat === 1) {
              realFs.unlinkSync(sb.dest);
              realFs.writeFileSync(sb.dest, "hijacked\n");
            }
          }
          return realFs.lstatSync(p, opts as never);
        },
        renameSync() {
          throw new Error("rename must not run after leaf type change");
        },
      },
    });

    expect(result.status).toBe("preserved");
    expect(result.reason).toBe("preserve-existing");
    expect(warnings.length).toBeGreaterThan(0);
    if (createdTemp) {
      // Pinned temp path may refer to an fd; check via basename under bin.
      const temps = fs
        .readdirSync(sb.claudeBinDir)
        .filter((n) => n.startsWith(".codeagent-wrapper.") && n.endsWith(".tmp"));
      expect(temps).toEqual([]);
    }
    expect(fs.lstatSync(sb.dest).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(sb.dest, "utf8")).toBe("hijacked\n");
  });

  it("preserves a temp path replaced before cleanup", () => {
    const sb = makeSandbox();
    ensureParents(sb);
    const staleTarget = path.join(
      sb.root,
      "old-prefix/lib/node_modules/@decade666/trellis/bin/codeagent-wrapper.mjs",
    );
    fs.symlinkSync(staleTarget, sb.dest);

    const realFs = fs;
    let createdTemp: string | null = null;
    let createdTempName: string | null = null;
    const { result, warnings } = runInstall(sb, {
      fs: {
        ...realFs,
        symlinkSync(
          target: fs.PathLike,
          p: fs.PathLike,
          type?: fs.symlink.Type | null,
        ) {
          if (isTempLeafPath(p)) {
            createdTemp = String(p);
            createdTempName = path.basename(String(p));
          }
          return realFs.symlinkSync(target, p, type);
        },
        lstatSync(p: fs.PathLike, opts?: fs.StatOptions) {
          if (createdTemp && isSameLeafPath(p, sb.dest)) {
            realFs.unlinkSync(sb.dest);
            realFs.writeFileSync(sb.dest, "hijacked\n");
            if (createdTempName) {
              const lexicalTemp = path.join(sb.claudeBinDir, createdTempName);
              realFs.unlinkSync(lexicalTemp);
              realFs.writeFileSync(lexicalTemp, "replacement\n");
            }
          }
          return realFs.lstatSync(p, opts as never);
        },
      },
    });

    expect(result.status).toBe("preserved");
    expect(createdTempName).not.toBeNull();
    if (!createdTempName) throw new Error("expected temp path");
    expect(
      fs.readFileSync(path.join(sb.claudeBinDir, createdTempName), "utf8"),
    ).toBe("replacement\n");
    expect(
      warnings.some((warning) => warning.includes("temp path changed type")),
    ).toBe(true);
  });

  it("does not write outside HOME when bin is swapped after open before leaf create", () => {
    const sb = makeSandbox();
    ensureParents(sb);
    const evil = path.join(sb.root, "evil-outside-bin");
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
            // Same-uid race: replace validated bin with outside-HOME symlink
            // after O_NOFOLLOW open succeeds. Lexical leaf writes would land
            // in evil; pinned-fd writes must not.
            swapBinLexicalToEvil(sb, evil);
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

  it("skips when intermediate .claude is swapped to outside-HOME before openSync(bin)", () => {
    // O_NOFOLLOW only protects the final path component. After lexical
    // revalidate of binDir, swap HOME/.claude -> evil (with a real 0700 bin)
    // so openSync(binDir) lands on evil/bin. Pinned-fd realpath must refuse.
    const sb = makeSandbox();
    ensureParents(sb);
    const evil = path.join(sb.root, "evil-intermediate");
    const evilBin = path.join(evil, "bin");
    fs.mkdirSync(evilBin, { recursive: true, mode: 0o700 });
    fs.chmodSync(evil, 0o700);
    fs.chmodSync(evilBin, 0o700);
    const realFs = fs;
    let swapped = false;
    const { result, warnings } = runInstall(sb, {
      fs: {
        ...realFs,
        openSync(p: fs.PathLike, flags: number | string, mode?: number) {
          if (String(p) === sb.claudeBinDir && !swapped) {
            swapped = true;
            // Move the real .claude aside and replace with a symlink to evil
            // (which already has a mode-0700 bin). openSync follows the
            // intermediate symlink and opens evil/bin successfully.
            const realClaude = `${sb.claudeDir}.real`;
            realFs.renameSync(sb.claudeDir, realClaude);
            realFs.symlinkSync(evil, sb.claudeDir);
          }
          return realFs.openSync(p, flags as never, mode as never);
        },
      },
    });

    expect(result.status).toBe("skipped");
    expect(
      ["skip-parent-symlink", "skip-race"].includes(result.reason ?? ""),
    ).toBe(true);
    expect(warnings.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(evilBin, "codeagent-wrapper"))).toBe(false);
    expect(
      fs
        .readdirSync(evilBin)
        .filter((n) => n.startsWith(".codeagent-wrapper.") || n === "bin"),
    ).toEqual([]);
    expect(fs.existsSync(path.join(evil, "bin", "codeagent-wrapper"))).toBe(
      false,
    );
    // evil/bin must remain empty — no leaf, no temp, no extra mkdir.
    expect(fs.readdirSync(evilBin)).toEqual([]);
  });

  it("does not write outside HOME when bin is swapped after open during repair", () => {
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
    const evil = path.join(sb.root, "evil-outside-repair");
    fs.mkdirSync(evil, { recursive: true, mode: 0o700 });
    const realFs = fs;
    let swapped = false;
    const { result } = runInstall(sb, {
      fs: {
        ...realFs,
        openSync(p: fs.PathLike, flags: number | string, mode?: number) {
          const fd = realFs.openSync(p, flags as never, mode as never);
          if (String(p) === sb.claudeBinDir && !swapped) {
            swapped = true;
            // Keep the open inode, but point the lexical bin path at evil so
            // any lexical temp/rename repair would land outside HOME.
            swapBinLexicalToEvil(sb, evil);
          }
          return fd;
        },
      },
    });

    expect(result.reason).not.toBe("skip-unexpected");
    expect(fs.existsSync(path.join(evil, "codeagent-wrapper"))).toBe(false);
    expect(
      fs
        .readdirSync(evil)
        .filter((n) => n.startsWith(".codeagent-wrapper.") && n.endsWith(".tmp")),
    ).toEqual([]);
  });

  it("preserves when dangling Trellis target becomes live before rename", () => {
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

    const realFs = fs;
    let createdTemp = false;
    const { result, warnings } = runInstall(sb, {
      fs: {
        ...realFs,
        symlinkSync(
          target: fs.PathLike,
          p: fs.PathLike,
          type?: fs.symlink.Type | null,
        ) {
          const out = realFs.symlinkSync(target, p, type);
          if (isTempLeafPath(p)) {
            createdTemp = true;
            // Race: previously dangling target becomes a live file before
            // secondCheck / rename — must preserve, not replace.
            fs.mkdirSync(path.dirname(staleTarget), { recursive: true });
            fs.writeFileSync(staleTarget, "// now live other trellis\n");
          }
          return out;
        },
        renameSync() {
          throw new Error("rename must not run after target became live");
        },
      },
    });

    expect(createdTemp).toBe(true);
    expect(result.status).toBe("preserved");
    expect(result.reason).toBe("preserve-existing");
    expect(
      warnings.some((w) => w.includes("no longer a dangling Trellis link")),
    ).toBe(true);
    expect(fs.readlinkSync(sb.dest)).toBe(staleTarget);
    expect(
      fs
        .readdirSync(sb.claudeBinDir)
        .filter((n) => n.startsWith(".codeagent-wrapper.") && n.endsWith(".tmp")),
    ).toEqual([]);
  });

  it("skips when dangling Trellis raw target text changes to another dangling Trellis path", () => {
    const sb = makeSandbox();
    ensureParents(sb);
    const firstTarget = path.join(
      sb.root,
      "old-prefix-a",
      "lib",
      "node_modules",
      "@decade666",
      "trellis",
      "bin",
      "codeagent-wrapper.mjs",
    );
    const secondTarget = path.join(
      sb.root,
      "old-prefix-b",
      "lib",
      "node_modules",
      "@decade666",
      "trellis",
      "bin",
      "codeagent-wrapper.mjs",
    );
    fs.symlinkSync(firstTarget, sb.dest);
    expect(fs.existsSync(firstTarget)).toBe(false);
    expect(fs.existsSync(secondTarget)).toBe(false);

    const realFs = fs;
    let createdTemp = false;
    const { result, warnings } = runInstall(sb, {
      fs: {
        ...realFs,
        symlinkSync(
          target: fs.PathLike,
          p: fs.PathLike,
          type?: fs.symlink.Type | null,
        ) {
          const out = realFs.symlinkSync(target, p, type);
          if (isTempLeafPath(p)) {
            createdTemp = true;
            // Race: raw link text swaps to a different still-dangling Trellis
            // path. Identity check must refuse rename even though ownership
            // shape still matches.
            realFs.unlinkSync(sb.dest);
            realFs.symlinkSync(secondTarget, sb.dest);
          }
          return out;
        },
        renameSync() {
          throw new Error("rename must not run after raw target text changed");
        },
      },
    });

    expect(createdTemp).toBe(true);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-race");
    expect(
      warnings.some((w) => w.includes("destination target changed before rename")),
    ).toBe(true);
    expect(fs.readlinkSync(sb.dest)).toBe(secondTarget);
    expect(
      fs
        .readdirSync(sb.claudeBinDir)
        .filter((n) => n.startsWith(".codeagent-wrapper.") && n.endsWith(".tmp")),
    ).toEqual([]);
  });

  it("skips when O_DIRECTORY or O_NOFOLLOW constants are unavailable", () => {
    const sb = makeSandbox();
    ensureParents(sb);
    const realFs = fs;
    const { result, warnings } = runInstall(sb, {
      fs: {
        ...realFs,
        constants: {
          ...realFs.constants,
          O_DIRECTORY: undefined as unknown as number,
          O_NOFOLLOW: undefined as unknown as number,
        },
      },
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-race");
    expect(warnings.some((w) => w.includes("O_DIRECTORY/O_NOFOLLOW"))).toBe(
      true,
    );
    expect(fs.existsSync(sb.dest)).toBe(false);
  });

  it("skips when effective uid is unavailable", () => {
    const sb = makeSandbox();
    const { result, warnings } = runInstall(sb, {
      getuid: () => undefined as unknown as number,
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-ownership");
    expect(warnings.some((w) => w.includes("effective uid unavailable"))).toBe(
      true,
    );
    expect(fs.existsSync(sb.claudeDir)).toBe(false);
    expect(fs.existsSync(sb.dest)).toBe(false);
  });

  it("skips leaf writes when pinned-fd path is unavailable", () => {
    const sb = makeSandbox();
    ensureParents(sb);
    const realFs = fs;
    const { result, warnings } = runInstall(sb, {
      fs: {
        ...realFs,
        existsSync(p: fs.PathLike) {
          if (String(p).startsWith("/proc/self/fd/")) return false;
          return realFs.existsSync(p);
        },
      },
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-race");
    expect(warnings.some((w) => w.includes("pinned-fd"))).toBe(true);
    expect(fs.existsSync(sb.dest)).toBe(false);
  });

  it("skips mkdir when pinned-fd path is unavailable instead of lexical fallback", () => {
    const sb = makeSandbox();
    const realFs = fs;
    const { result, warnings } = runInstall(sb, {
      fs: {
        ...realFs,
        existsSync(p: fs.PathLike) {
          if (String(p).startsWith("/proc/self/fd/")) return false;
          return realFs.existsSync(p);
        },
      },
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("skip-race");
    expect(warnings.some((w) => w.includes("pinned-fd"))).toBe(true);
    expect(fs.existsSync(sb.claudeDir)).toBe(false);
    expect(fs.existsSync(sb.dest)).toBe(false);
  });

  it("converts filesystem errors into stable warnings and skipped status", () => {
    const sb = makeSandbox();
    const { result, warnings } = runInstall(sb, {
      fs: {
        ...fs,
        lstatSync() {
          throw new Error("boom-lstat");
        },
      },
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toMatch(/^skip-/);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/\[trellis postinstall\]/);
  });

  it("direct entrypoint catches unexpected errors and exits 0", async () => {
    const sb = makeSandbox();
    const result = await new Promise<{ code: number | null; stderr: string }>(
      (resolve, reject) => {
        const child = spawn(process.execPath, [HELPER_PATH], {
          env: {
            ...process.env,
            npm_config_global: "true",
            npm_lifecycle_event: "postinstall",
            npm_config_prefix: path.join(sb.root, "missing-prefix"),
            HOME: sb.home,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stderr = "";
        child.stderr.on("data", (c: Buffer | string) => {
          stderr += String(c);
        });
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stderr }));
      },
    );
    expect(result.code).toBe(0);
    expect(result.stderr).toMatch(/\[trellis postinstall\]/);
  });
});
