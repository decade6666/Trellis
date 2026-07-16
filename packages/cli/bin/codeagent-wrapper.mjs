#!/usr/bin/env node
/**
 * Trellis-bundled multi-backend codeagent-wrapper.
 *
 * Ships with @mindfoldhq/trellis-cli so multi-model collab keeps working when
 * CCG (which normally provides codeagent-wrapper) is not installed. It speaks a
 * subset of CCG's wrapper contract used by the antigravity channel adapter and
 * by shell / AI-agent callers:
 *
 *   codeagent-wrapper [--progress --lite] --backend <name> [--model <m>] - <cwd>
 *
 * with the prompt piped on stdin. It dispatches to a per-backend CLI and passes
 * the plain-text reply through on stdout; progress / diagnostics go to stderr.
 *
 * Supported backends: agy | codex | claude | grok | kimi. Each CLI is invoked
 * in its headless / single-prompt mode. Unknown backends exit non-zero so the
 * caller can degrade. When CCG's full wrapper is installed, callers may point
 * at it via TRELLIS_CODEAGENT_WRAPPER instead of this bundled one.
 *
 * Per-backend binary overrides: TRELLIS_AGY_BIN/AGY_BIN, TRELLIS_CODEX_BIN,
 * TRELLIS_CLAUDE_BIN, TRELLIS_GROK_BIN, TRELLIS_KIMI_BIN.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SUPPORTED_BACKENDS = ["agy", "codex", "claude", "grok", "kimi"];

export function parseArgs(argv) {
  const opts = {
    backend: "agy",
    stdinPrompt: false,
    cwd: process.cwd(),
    model: "",
  };
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--backend") {
      opts.backend = argv[++i] ?? "agy";
    } else if (a === "--model") {
      opts.model = argv[++i] ?? "";
    } else if (a === "-") {
      opts.stdinPrompt = true;
    } else if (a.startsWith("--")) {
      // Accept and ignore wrapper-only flags (--progress, --lite, …).
    } else {
      positionals.push(a);
    }
  }
  if (positionals.length > 0) opts.cwd = positionals[positionals.length - 1];
  return opts;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return "";
}

/**
 * Build the concrete backend invocation. Pure so it can be unit-tested.
 *
 * @returns {{ bin: string, args: string[], spawnCwd: string | undefined,
 *   outputMode: "passthrough" | "file", outFile: string }} or `null` when the
 *   backend is unknown.
 */
export function buildBackendCommand(backend, { cwd, prompt, model = "", tmpFile = "" } = {}) {
  const dir = cwd || process.cwd();
  switch (backend) {
    case "agy": {
      const bin = firstNonEmpty(process.env.TRELLIS_AGY_BIN, process.env.AGY_BIN) || "agy";
      const args = ["--add-dir", dir]
        .concat(model ? ["--model", model] : [])
        .concat(["-p", prompt]);
      return { bin, args, spawnCwd: undefined, outputMode: "passthrough", outFile: "" };
    }
    case "codex": {
      // codex `exec` default stdout is noisy (tool/reasoning logs); `-o <file>`
      // writes only the final agent message, which we relay to stdout.
      const bin = firstNonEmpty(process.env.TRELLIS_CODEX_BIN) || "codex";
      const args = [
        "exec",
        "--skip-git-repo-check",
        "--dangerously-bypass-approvals-and-sandbox",
        "--color",
        "never",
        "-C",
        dir,
        "-o",
        tmpFile,
      ]
        .concat(model ? ["-m", model] : [])
        .concat([prompt]);
      return { bin, args, spawnCwd: undefined, outputMode: "file", outFile: tmpFile };
    }
    case "claude": {
      const bin = firstNonEmpty(process.env.TRELLIS_CLAUDE_BIN) || "claude";
      const args = ["-p", prompt, "--add-dir", dir].concat(
        model ? ["--model", model] : [],
      );
      return { bin, args, spawnCwd: undefined, outputMode: "passthrough", outFile: "" };
    }
    case "grok": {
      const bin = firstNonEmpty(process.env.TRELLIS_GROK_BIN) || "grok";
      const args = ["--no-auto-update", "-p", prompt, "--cwd", dir].concat(
        model ? ["-m", model] : [],
      );
      return { bin, args, spawnCwd: undefined, outputMode: "passthrough", outFile: "" };
    }
    case "kimi": {
      // Kimi Code CLI has no --cwd flag; set the child's working directory.
      const bin = firstNonEmpty(process.env.TRELLIS_KIMI_BIN) || "kimi";
      const args = ["-p", prompt, "--add-dir", dir].concat(
        model ? ["-m", model] : [],
      );
      return { bin, args, spawnCwd: dir, outputMode: "passthrough", outFile: "" };
    }
    default:
      return null;
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!SUPPORTED_BACKENDS.includes(opts.backend)) {
    process.stderr.write(
      `trellis codeagent-wrapper: unsupported backend '${opts.backend}' ` +
        `(supported: ${SUPPORTED_BACKENDS.join(", ")})\n`,
    );
    process.exit(2);
  }

  const prompt = opts.stdinPrompt ? (await readStdin()).trim() : "";
  if (!prompt) {
    process.stderr.write("trellis codeagent-wrapper: empty prompt on stdin\n");
    process.exit(2);
  }

  // codex needs a temp file for its final-message output.
  let tmpDir = "";
  let tmpFile = "";
  if (opts.backend === "codex") {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-codex-"));
    tmpFile = path.join(tmpDir, "last-message.txt");
  }

  const cmd = buildBackendCommand(opts.backend, {
    cwd: opts.cwd,
    prompt,
    model: opts.model,
    tmpFile,
  });
  if (!cmd) {
    process.stderr.write(
      `trellis codeagent-wrapper: unsupported backend '${opts.backend}'\n`,
    );
    process.exit(2);
  }

  const cleanup = () => {
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    }
  };

  // passthrough: child stdout streams straight to ours. file: suppress the
  // noisy child stdout and relay the collected final message instead.
  const stdio =
    cmd.outputMode === "file"
      ? ["ignore", "ignore", "inherit"]
      : ["ignore", "inherit", "inherit"];

  const child = spawn(cmd.bin, cmd.args, {
    stdio,
    cwd: cmd.spawnCwd,
    env: process.env,
  });

  child.on("error", (err) => {
    cleanup();
    process.stderr.write(
      `trellis codeagent-wrapper: failed to spawn '${cmd.bin}': ${err && err.message ? err.message : String(err)}\n`,
    );
    process.exit(127);
  });
  child.on("close", (code) => {
    if (cmd.outputMode === "file") {
      try {
        const reply = fs.readFileSync(cmd.outFile, "utf8");
        process.stdout.write(reply);
      } catch (err) {
        process.stderr.write(
          `trellis codeagent-wrapper: could not read codex output: ${err && err.message ? err.message : String(err)}\n`,
        );
      }
    }
    cleanup();
    process.exit(code ?? 0);
  });
}

// Only run when invoked directly, so buildBackendCommand / parseArgs stay
// importable from tests without side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
