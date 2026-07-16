#!/usr/bin/env node
/**
 * Trellis-bundled minimal codeagent-wrapper.
 *
 * Ships with @mindfoldhq/trellis-cli so multi-model collab keeps working when
 * CCG (which normally provides codeagent-wrapper) is not installed. It speaks a
 * subset of CCG's wrapper contract used by the antigravity channel adapter:
 *
 *   codeagent-wrapper --progress --lite --backend agy - <cwd>
 *
 * with the prompt piped on stdin. It dispatches to the `agy` (Antigravity) CLI
 * and passes the reply through on stdout. Only `--backend agy` is supported;
 * other backends exit non-zero so the caller can degrade. When CCG's full
 * wrapper is installed, the adapter prefers it over this one.
 */
import { spawn } from "node:child_process";

function parseArgs(argv) {
  const opts = { backend: "agy", stdinPrompt: false, cwd: process.cwd() };
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--backend") {
      opts.backend = argv[++i] ?? "agy";
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

  if (opts.backend !== "agy") {
    process.stderr.write(
      `trellis codeagent-wrapper: only --backend agy is supported (got '${opts.backend}')\n`,
    );
    process.exit(2);
  }

  const prompt = opts.stdinPrompt ? (await readStdin()).trim() : "";
  if (!prompt) {
    process.stderr.write("trellis codeagent-wrapper: empty prompt on stdin\n");
    process.exit(2);
  }

  const agyBin =
    process.env.TRELLIS_AGY_BIN?.trim() ||
    process.env.AGY_BIN?.trim() ||
    "agy";

  const child = spawn(agyBin, ["--add-dir", opts.cwd, "-p", prompt], {
    // agy's answer streams straight through to our stdout; progress to stderr.
    stdio: ["ignore", "inherit", "inherit"],
    env: process.env,
  });

  child.on("error", (err) => {
    process.stderr.write(
      `trellis codeagent-wrapper: failed to spawn '${agyBin}': ${err && err.message ? err.message : String(err)}\n`,
    );
    process.exit(127);
  });
  child.on("close", (code) => {
    process.exit(code ?? 0);
  });
}

main();
