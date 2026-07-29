import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, vi } from "vitest";

import { installCodeagentWrapperLink } from "../../bin/install-codeagent-wrapper-link.mjs";

export const HELPER_PATH = fileURLToPath(
  new URL("../../bin/install-codeagent-wrapper-link.mjs", import.meta.url),
);
export const REAL_WRAPPER = fileURLToPath(
  new URL("../../bin/codeagent-wrapper.mjs", import.meta.url),
);

export interface Sandbox {
  root: string;
  home: string;
  prefix: string;
  packageRoot: string;
  binDir: string;
  source: string;
  dest: string;
  claudeDir: string;
  claudeBinDir: string;
  moduleUrl: string;
  cleanup: () => void;
}

const sandboxes: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (sandboxes.length > 0) {
    const root = sandboxes.pop();
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

export function track(root: string): string {
  sandboxes.push(root);
  return root;
}

export function writeWrapper(
  target: string,
  body = "export default 1;\n",
): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body, { mode: 0o644 });
}

export function makeSandbox(opts: { copyRealWrapper?: boolean } = {}): Sandbox {
  const root = track(
    fs.mkdtempSync(path.join(os.tmpdir(), "trellis-install-link-")),
  );
  const home = path.join(root, "home");
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
  const claudeDir = path.join(home, ".claude");
  const claudeBinDir = path.join(claudeDir, "bin");
  const dest = path.join(claudeBinDir, "codeagent-wrapper");

  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  fs.chmodSync(home, 0o700);
  fs.mkdirSync(binDir, { recursive: true, mode: 0o755 });
  if (opts.copyRealWrapper) {
    fs.copyFileSync(REAL_WRAPPER, source);
  } else {
    writeWrapper(source, "// fixture wrapper\nexport function main() {}\n");
  }
  fs.copyFileSync(HELPER_PATH, helper);
  return {
    root,
    home,
    prefix,
    packageRoot,
    binDir,
    source,
    dest,
    claudeDir,
    claudeBinDir,
    moduleUrl: pathToFileURL(helper).href,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

export function baseEnv(
  sb: Sandbox,
  extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    npm_config_global: "true",
    npm_lifecycle_event: "postinstall",
    npm_config_prefix: sb.prefix,
    INIT_CWD: path.join(sb.root, "cwd"),
    ...extra,
  };
}

export function runInstall(
  sb: Sandbox,
  overrides: Parameters<typeof installCodeagentWrapperLink>[0] = {},
): {
  result: ReturnType<typeof installCodeagentWrapperLink>;
  warnings: string[];
} {
  const warnings: string[] = [];
  const result = installCodeagentWrapperLink({
    env: baseEnv(sb),
    platform: "linux",
    getuid: () => process.getuid?.() ?? 0,
    homedir: () => sb.home,
    moduleUrl: sb.moduleUrl,
    warn: (msg: string) => {
      warnings.push(msg);
    },
    ...overrides,
  });
  return { result, warnings };
}

export function ensureParents(sb: Sandbox): void {
  fs.mkdirSync(sb.claudeBinDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(sb.claudeDir, 0o700);
  fs.chmodSync(sb.claudeBinDir, 0o700);
}

/** Match lexical leaf paths or pinned `/proc/self/fd/<n>/<basename>` paths. */
export function isSameLeafPath(p: fs.PathLike, logicalPath: string): boolean {
  const s = String(p);
  if (s === logicalPath) return true;
  const base = path.basename(logicalPath);
  return path.basename(s) === base && s.includes(`${path.sep}proc${path.sep}self${path.sep}fd${path.sep}`);
}

/** Match helper-owned temp leaf names, lexical or pinned-fd. */
export function isTempLeafPath(p: fs.PathLike): boolean {
  const base = path.basename(String(p));
  return base.startsWith(".codeagent-wrapper.") && base.endsWith(".tmp");
}
