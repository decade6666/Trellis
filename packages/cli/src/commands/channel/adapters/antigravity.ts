import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DIR_NAMES } from "../../../constants/paths.js";

import type { ParseResult } from "./types.js";

/** Default matches CCG multi-cli: codeagent-wrapper → agy CLI. */
const DEFAULT_DRIVER = "codeagent-wrapper";
const DEFAULT_CLIPROXY_BASE_URL = "http://127.0.0.1:8317";
const DEFAULT_CLIPROXY_MODEL = "gemini-3.5-flash-low";
const DEFAULT_WRAPPER_BACKEND = "agy";

const CLIPROXY_RUNNER_SOURCE = String.raw`
const encoded = process.argv[1] ?? "";
const config = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
const readline = require("node:readline");
const stdout = process.stdout;
const stdin = process.stdin;
const rl = readline.createInterface({ input: stdin, crlfDelay: Infinity });
let queue = Promise.resolve();

function emit(event) {
  stdout.write(JSON.stringify(event) + "\n");
}

function extractText(response) {
  const choice = Array.isArray(response?.choices) ? response.choices[0] : undefined;
  const message = choice?.message;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .filter(Boolean)
      .join("");
  }
  return "";
}

async function runTurn(text) {
  const startedAt = Date.now();
  emit({
    type: "progress",
    detail: {
      kind: "driver_status",
      driver: "cliproxy",
      status: "request_started",
      model: config.model,
    },
  });
  const headers = { "content-type": "application/json" };
  if (config.apiKey) {
    headers["authorization"] = "Bearer " + config.apiKey;
  }
  const response = await fetch(new URL("/v1/chat/completions", config.baseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      stream: false,
      messages: [
        { role: "system", content: config.systemPrompt },
        { role: "user", content: text },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      "cliproxy request failed (" +
        response.status +
        " " +
        response.statusText +
        "): " +
        body.slice(0, 200),
    );
  }
  const payload = await response.json();
  const reply = extractText(payload);
  if (reply) {
    emit({ type: "message", text: reply });
  }
  emit({
    type: "done",
    duration_ms: Date.now() - startedAt,
  });
}

rl.on("line", (line) => {
  queue = queue
    .then(async () => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let msg;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        emit({
          type: "error",
          message: "Invalid antigravity stdin payload",
          detail: { raw_excerpt: trimmed.slice(0, 200) },
        });
        return;
      }
      const text = typeof msg.text === "string" ? msg.text : "";
      if (!text) {
        emit({
          type: "error",
          message: "Antigravity stdin payload is missing text",
        });
        return;
      }
      await runTurn(text);
    })
    .catch((err) => {
      emit({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    });
});
`;

/**
 * Long-lived shim. Each user turn PREFERS codeagent-wrapper and degrades to a
 * direct `agy` call only when the wrapper is absent or its invocation fails.
 *   wrapper: [node] codeagent-wrapper --progress --lite --backend agy - <cwd>
 *            (prompt on stdin — CCG's wrapper if installed, else Trellis's bundled one)
 *   agy:     agy --add-dir <cwd> [--model <m>] -p <prompt>
 *            (direct Antigravity CLI — the degrade path, zero ccg dependency)
 * The wrapper is only a thin dispatcher over `agy`, so the degrade keeps collab
 * working even when no wrapper is usable.
 */
const WRAPPER_RUNNER_SOURCE = String.raw`
const encoded = process.argv[1] ?? "";
const config = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const stdout = process.stdout;
const stdin = process.stdin;
const rl = readline.createInterface({ input: stdin, crlfDelay: Infinity });
let queue = Promise.resolve();

function emit(event) {
  stdout.write(JSON.stringify(event) + "\n");
}

function spawnBackend(kind, prompt) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const isAgy = kind === "agy";
    let bin;
    let args;
    let useStdin;
    if (isAgy) {
      bin = config.agyBin;
      args = ["--add-dir", config.cwd || process.cwd()]
        .concat(config.model ? ["--model", config.model] : [])
        .concat(["-p", prompt]);
      useStdin = false;
    } else {
      const wrapperArgs = [
        "--progress",
        "--lite",
        "--backend",
        config.backend || "agy",
        "-",
        config.cwd || process.cwd(),
      ];
      if (config.wrapperViaNode) {
        bin = process.execPath;
        args = [config.wrapperPath].concat(wrapperArgs);
      } else {
        bin = config.wrapperPath;
        args = wrapperArgs;
      }
      useStdin = true;
    }
    const child = spawn(bin, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
      const lines = String(chunk).split(/\r?\n/);
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        emit({
          type: "progress",
          detail: { kind: "wrapper_stderr", message: t.slice(0, 240) },
        });
      }
    });
    child.on("error", (e) => {
      finish({
        ok: false,
        spawnError: true,
        message: e && e.message ? e.message : String(e),
        out: "",
        err,
        code: null,
        kind,
      });
    });
    child.on("close", (code) => {
      const reply = out.trim();
      finish({
        ok: reply.length > 0,
        spawnError: false,
        message: "",
        out: reply,
        err,
        code,
        kind,
      });
    });
    // Guard write: spawn ENOENT still exposes a stdin stream, but other
    // failures can leave it null / already destroyed.
    try {
      if (useStdin && child.stdin) child.stdin.write(prompt);
      if (child.stdin) child.stdin.end();
    } catch (e) {
      finish({
        ok: false,
        spawnError: true,
        message: e && e.message ? e.message : String(e),
        out: "",
        err,
        code: null,
        kind,
      });
    }
  });
}

async function runTurn(text) {
  const startedAt = Date.now();
  const prompt = config.systemPrompt
    ? String(config.systemPrompt) + "\n\n" + text
    : text;
  const preferWrapper = config.mode === "wrapper" && Boolean(config.wrapperPath);
  emit({
    type: "progress",
    detail: {
      kind: "driver_status",
      driver: preferWrapper ? "codeagent-wrapper" : "agy",
      status: "request_started",
      backend: config.backend,
      model: config.model || undefined,
    },
  });

  let result;
  if (preferWrapper) {
    result = await spawnBackend("wrapper", prompt);
    if (!result.ok && config.agyBin) {
      emit({
        type: "progress",
        detail: {
          kind: "driver_status",
          driver: "agy",
          status: "wrapper_degraded",
          message: result.spawnError
            ? "spawn failed: " + result.message
            : "exit " + result.code,
        },
      });
      result = await spawnBackend("agy", prompt);
    }
  } else if (config.agyBin) {
    result = await spawnBackend("agy", prompt);
  } else {
    result = {
      ok: false,
      spawnError: true,
      message: "no codeagent-wrapper and no agy CLI available",
      out: "",
      err: "",
      code: null,
      kind: "none",
    };
  }

  if (result.ok) {
    emit({ type: "message", text: result.out });
  } else {
    const detail =
      result.kind === "none"
        ? result.message
        : result.kind +
          (result.spawnError
            ? " spawn failed: " + result.message
            : " produced no output (exit " + result.code + ")");
    emit({
      type: "error",
      message: detail,
      detail: {
        exit_code: result.code,
        stderr_excerpt: (result.err || "").slice(0, 200),
      },
    });
  }
  emit({ type: "done", duration_ms: Date.now() - startedAt });
}

rl.on("line", (line) => {
  queue = queue
    .then(async () => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let msg;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        emit({
          type: "error",
          message: "Invalid antigravity stdin payload",
          detail: { raw_excerpt: trimmed.slice(0, 200) },
        });
        return;
      }
      const text = typeof msg.text === "string" ? msg.text : "";
      if (!text) {
        emit({
          type: "error",
          message: "Antigravity stdin payload is missing text",
        });
        return;
      }
      await runTurn(text);
    })
    .catch((err) => {
      emit({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    });
});
`;

export type AntigravityDriver = "cliproxy" | "gemini-cli" | "codeagent-wrapper";

export interface AntigravityConfig {
  driver: AntigravityDriver;
  cliproxyBaseUrl: string;
  cliproxyModel: string;
  /** OpenAI-compatible Bearer token for cliproxy/CLIProxyAPI. Prefer env over yaml. */
  cliproxyApiKey: string;
  /** Absolute path to codeagent-wrapper binary (ccg's, PATH, or Trellis-bundled). */
  wrapperPath: string;
  /** Wrapper --backend value (agy | antigravity). */
  wrapperBackend: string;
  /** Absolute path / command for the `agy` CLI used by the direct degrade path. */
  agyBin: string;
  secondModelProvider: string;
}

export interface AntigravityCtx {
  driver: AntigravityDriver;
  ready: boolean;
}

function defaultConfig(): AntigravityConfig {
  return {
    driver: DEFAULT_DRIVER,
    cliproxyBaseUrl: DEFAULT_CLIPROXY_BASE_URL,
    cliproxyModel: DEFAULT_CLIPROXY_MODEL,
    cliproxyApiKey: resolveCliproxyApiKey(),
    wrapperPath: resolveWrapperPath(),
    wrapperBackend: DEFAULT_WRAPPER_BACKEND,
    agyBin: resolveAgyBin(),
    secondModelProvider: "antigravity",
  };
}

export function createAntigravityCtx(
  driver: AntigravityDriver = DEFAULT_DRIVER,
): AntigravityCtx {
  return { driver, ready: false };
}

export function isAntigravityReady(ctx: AntigravityCtx): boolean {
  return ctx.ready;
}

export function encodeAntigravityUserMessage(
  text: string,
  _ctx: AntigravityCtx,
): string {
  return JSON.stringify({ type: "user", text }) + "\n";
}

export function encodeAntigravityInterruptMessage(
  text: string,
  _ctx: AntigravityCtx,
): string {
  return JSON.stringify({ type: "interrupt", text }) + "\n";
}

export function buildAntigravityArgs(view: {
  cwd: string;
  model?: string;
  systemPrompt: string;
}): string[] {
  const config = loadAntigravityConfig(view.cwd);
  assertSupportedDriver(config.driver);

  if (config.driver === "codeagent-wrapper") {
    const invocation = resolveWrapperInvocation(config);
    const runnerConfig = {
      mode: invocation.mode,
      wrapperPath: invocation.wrapperPath,
      wrapperViaNode: invocation.viaNode,
      backend: config.wrapperBackend,
      agyBin: invocation.agyBin,
      model: view.model ?? "",
      cwd: view.cwd,
      systemPrompt: view.systemPrompt,
    };
    const encoded = Buffer.from(JSON.stringify(runnerConfig), "utf8").toString(
      "base64url",
    );
    return ["-e", WRAPPER_RUNNER_SOURCE, encoded];
  }

  // cliproxy
  const runnerConfig = {
    baseUrl: config.cliproxyBaseUrl,
    model: view.model ?? config.cliproxyModel,
    systemPrompt: view.systemPrompt,
    apiKey: config.cliproxyApiKey,
  };
  const encoded = Buffer.from(JSON.stringify(runnerConfig), "utf8").toString(
    "base64url",
  );
  return ["-e", CLIPROXY_RUNNER_SOURCE, encoded];
}

export async function handshakeAntigravity(args: {
  ctx: AntigravityCtx;
  view: { cwd: string };
}): Promise<void> {
  const config = loadAntigravityConfig(args.view.cwd);
  args.ctx.driver = config.driver;
  assertSupportedDriver(config.driver);

  if (config.driver === "codeagent-wrapper") {
    await probeCodeagentWrapper(
      config.wrapperPath,
      config.wrapperBackend,
      config.agyBin,
    );
  } else {
    await probeCliproxy(config.cliproxyBaseUrl, config.cliproxyApiKey);
  }
  args.ctx.ready = true;
}

export function parseAntigravityLine(
  line: string,
  ctx: AntigravityCtx,
): ParseResult {
  const trimmed = line.trim();
  if (!trimmed) return { events: [] };

  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return {
      events: [
        {
          kind: "error",
          payload: {
            message: "Failed to parse Antigravity stdout line",
            raw_excerpt: trimmed.slice(0, 200),
          },
        },
      ],
    };
  }

  switch (msg.type) {
    case "ready":
      ctx.ready = true;
      return { events: [] };
    case "progress":
      return {
        events: [
          {
            kind: "progress",
            payload: {
              detail: isRecord(msg.detail)
                ? msg.detail
                : { kind: "status", message: "antigravity progress" },
            },
          },
        ],
      };
    case "message":
      return typeof msg.text === "string"
        ? {
            events: [{ kind: "message", payload: { text: msg.text } }],
          }
        : { events: [] };
    case "done":
      return {
        events: [
          {
            kind: "done",
            payload: pickPayloadFields(msg, [
              "duration_ms",
              "total_cost_usd",
              "num_turns",
            ]),
          },
        ],
      };
    case "error":
      return {
        events: [
          {
            kind: "error",
            payload: {
              message:
                typeof msg.message === "string"
                  ? msg.message
                  : "Antigravity worker error",
              ...(isRecord(msg.detail) ? { detail: msg.detail } : {}),
            },
          },
        ],
      };
    default:
      return { events: [] };
  }
}

function firstNonEmpty(...values: (string | undefined)[]): string {
  for (const value of values) {
    if (value) return value;
  }
  return "";
}

function resolveCliproxyApiKey(fromYaml = ""): string {
  // Prefer env so secrets stay out of committed config.yaml.
  return firstNonEmpty(
    process.env.CLIPROXY_API_KEY?.trim(),
    process.env.TRELLIS_CLIPROXY_API_KEY?.trim(),
    process.env.OPENAI_API_KEY?.trim(),
    fromYaml.trim(),
  );
}

/** Resolve codeagent-wrapper binary path. Fixed single path: explicit override, else bundled. */
export function resolveWrapperPath(fromYaml = ""): string {
  // Single explicit override knob (env or yaml); wins even if the file is
  // missing (the probe / wrapperExecutable falls through to bundled later).
  const explicit = firstNonEmpty(
    process.env.TRELLIS_CODEAGENT_WRAPPER?.trim(),
    fromYaml.trim(),
  );
  if (explicit) return expandHome(explicit);

  // Fixed single path: Trellis ships its own codeagent-wrapper, so collab works
  // without ccg and without scanning ~/.claude/bin, ~/.local/bin, or PATH.
  const bundled = resolveBundledWrapper();
  if (bundled) return bundled;
  return "codeagent-wrapper";
}

/** Resolve the `agy` CLI used for the direct degrade path (env > yaml > PATH). */
export function resolveAgyBin(fromYaml = ""): string {
  const explicit = firstNonEmpty(
    process.env.TRELLIS_AGY_BIN?.trim(),
    process.env.AGY_BIN?.trim(),
    fromYaml.trim(),
  );
  if (explicit) return expandHome(explicit);
  const found = findOnPath("agy");
  if (found) return found;
  return "agy";
}

/** Locate the Trellis-bundled codeagent-wrapper script shipped in the package `bin/`. */
function resolveBundledWrapper(): string {
  try {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i++) {
      const candidate = path.join(dir, "bin", "codeagent-wrapper.mjs");
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // keep walking up
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // import.meta unavailable — no bundled wrapper
  }
  return "";
}

function isNodeScript(p: string): boolean {
  return /\.(mjs|cjs|js)$/.test(p);
}

/**
 * First usable wrapper path: the explicit override, else the Trellis-bundled
 * one. Fixed single path — no PATH / home-dir scanning; a broken override just
 * falls through to the bundled wrapper.
 */
function wrapperExecutable(wrapperPath: string): string {
  const candidates: string[] = [];
  if (wrapperPath && wrapperPath !== "codeagent-wrapper") {
    candidates.push(wrapperPath);
  }
  const bundled = resolveBundledWrapper();
  if (bundled) candidates.push(bundled);

  const seen = new Set<string>();
  for (const resolved of candidates) {
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    try {
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        continue;
      }
      // Node scripts are launched via `node <script>`, so the exec bit is irrelevant.
      if (isNodeScript(resolved)) return resolved;
      fs.accessSync(resolved, fs.constants.X_OK);
      return resolved;
    } catch {
      // try next candidate
    }
  }
  return "";
}

/** A usable `agy` binary path or "" when it is not installed. */
function agyExecutable(agyBin: string): string {
  const resolved =
    agyBin && agyBin !== "agy" ? agyBin : (findOnPath("agy") ?? "");
  if (!resolved) return "";
  try {
    fs.accessSync(resolved, fs.constants.X_OK);
    return resolved;
  } catch {
    return "";
  }
}

/**
 * Decide the per-turn backend. Prefer codeagent-wrapper (ccg / bundled); carry
 * the resolved `agy` bin so the runner can degrade at call time on failure.
 */
function resolveWrapperInvocation(config: AntigravityConfig): {
  mode: "wrapper" | "agy";
  wrapperPath: string;
  viaNode: boolean;
  agyBin: string;
} {
  const agyBin = agyExecutable(config.agyBin);
  const wrapper = wrapperExecutable(config.wrapperPath);
  if (wrapper) {
    return {
      mode: "wrapper",
      wrapperPath: wrapper,
      viaNode: isNodeScript(wrapper),
      agyBin,
    };
  }
  return { mode: "agy", wrapperPath: "", viaNode: false, agyBin };
}

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

export function loadAntigravityConfig(cwd: string): AntigravityConfig {
  const defaults = defaultConfig();
  const configPath = path.join(cwd, DIR_NAMES.WORKFLOW, "config.yaml");
  if (!fs.existsSync(configPath)) return defaults;

  let content: string;
  try {
    content = fs.readFileSync(configPath, "utf-8");
  } catch {
    return defaults;
  }

  return parseAntigravityConfig(content, defaults);
}

export function parseAntigravityConfig(
  content: string,
  defaults: AntigravityConfig = defaultConfig(),
): AntigravityConfig {
  const resolved: AntigravityConfig = { ...defaults };
  let yamlApiKey = "";
  let yamlWrapperPath = "";
  let yamlAgyBin = "";
  const lines = content.split("\n");
  let inCollab = false;
  let inSecondModel = false;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.trimStart().startsWith("#")) continue;

    if (/^collab:\s*$/.test(trimmed)) {
      inCollab = true;
      inSecondModel = false;
      continue;
    }

    if (inCollab && /^ {2}second_model:\s*$/.test(line)) {
      inSecondModel = true;
      continue;
    }

    if (inSecondModel) {
      const provider = line.match(/^ {4}provider:\s+(.+)$/);
      if (provider) {
        resolved.secondModelProvider = stripYamlScalar(provider[1]);
        continue;
      }
      const driver = line.match(/^ {4}driver:\s+(.+)$/);
      if (driver) {
        const value = stripYamlScalar(driver[1]);
        if (isAntigravityDriver(value)) {
          resolved.driver = value;
        }
        continue;
      }
      const baseUrl = line.match(/^ {4}cliproxy_base_url:\s+(.+)$/);
      if (baseUrl) {
        resolved.cliproxyBaseUrl = stripYamlScalar(baseUrl[1]);
        continue;
      }
      const model = line.match(/^ {4}cliproxy_model:\s+(.+)$/);
      if (model) {
        resolved.cliproxyModel = stripYamlScalar(model[1]);
        continue;
      }
      const apiKey = line.match(/^ {4}cliproxy_api_key:\s+(.+)$/);
      if (apiKey) {
        yamlApiKey = stripYamlScalar(apiKey[1]);
        continue;
      }
      const wrapperPath = line.match(/^ {4}wrapper_path:\s+(.+)$/);
      if (wrapperPath) {
        yamlWrapperPath = stripYamlScalar(wrapperPath[1]);
        continue;
      }
      const wrapperBackend = line.match(/^ {4}wrapper_backend:\s+(.+)$/);
      if (wrapperBackend) {
        resolved.wrapperBackend = stripYamlScalar(wrapperBackend[1]);
        continue;
      }
      const agyBin = line.match(/^ {4}agy_bin:\s+(.+)$/);
      if (agyBin) {
        yamlAgyBin = stripYamlScalar(agyBin[1]);
        continue;
      }
      if (!/^ {4}\S/.test(line)) {
        inSecondModel = false;
      }
    }

    if (inCollab && /^\S/.test(line)) {
      inCollab = false;
      inSecondModel = false;
    }
  }

  // Env always wins over yaml when both are set.
  resolved.cliproxyApiKey = resolveCliproxyApiKey(yamlApiKey);
  resolved.wrapperPath = resolveWrapperPath(yamlWrapperPath);
  resolved.agyBin = resolveAgyBin(yamlAgyBin);
  return resolved;
}

export async function probeCliproxy(
  baseUrl: string,
  apiKey = "",
): Promise<void> {
  const normalized = normalizeBaseUrl(baseUrl);
  const candidates = ["/v1/models", "/models"];
  const failures: string[] = [];
  const headers: Record<string, string> = {};
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  for (const pathname of candidates) {
    try {
      const response = await fetch(new URL(pathname, normalized), {
        method: "GET",
        headers,
      });
      if (response.ok) return;
      failures.push(`${pathname} -> ${response.status} ${response.statusText}`);
    } catch (err) {
      failures.push(
        `${pathname} -> ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  throw new Error(
    `Antigravity cliproxy probe failed for ${normalized} (${failures.join("; ")}). ` +
      "Set CLIPROXY_API_KEY (or collab.second_model.cliproxy_api_key) and collab.second_model.cliproxy_base_url, or switch driver / disable collab.",
  );
}

export async function probeCodeagentWrapper(
  wrapperPath: string,
  backend = DEFAULT_WRAPPER_BACKEND,
  agyBin = "",
): Promise<void> {
  // Preferred path: any usable codeagent-wrapper (ccg's, PATH, or bundled).
  if (wrapperExecutable(wrapperPath)) return;
  // Degrade path: the `agy` CLI invoked directly.
  if (agyExecutable(agyBin)) return;
  throw new Error(
    "Antigravity codeagent-wrapper probe failed: neither codeagent-wrapper nor the `agy` CLI is usable. " +
      "Trellis bundles a codeagent-wrapper, so this usually means the package is incomplete; " +
      "install `agy` (Antigravity CLI) or set TRELLIS_AGY_BIN / TRELLIS_CODEAGENT_WRAPPER, " +
      `or switch collab.second_model.driver to cliproxy. Backend='${backend}' (expects agy CLI).`,
  );
}

function findOnPath(bin: string): string | undefined {
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const full = path.join(dir, bin);
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
    } catch {
      // continue
    }
  }
  return undefined;
}

function assertSupportedDriver(driver: AntigravityDriver): void {
  if (driver === "cliproxy" || driver === "codeagent-wrapper") return;
  throw new Error(
    `Antigravity driver '${driver}' is not implemented yet. ` +
      "Use collab.second_model.driver: codeagent-wrapper (agy) or cliproxy.",
  );
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function isAntigravityDriver(value: string): value is AntigravityDriver {
  return (
    value === "cliproxy" ||
    value === "gemini-cli" ||
    value === "codeagent-wrapper"
  );
}

function stripYamlScalar(value: string): string {
  return value
    .trim()
    .replace(/\s+#.*$/, "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function pickPayloadFields(
  source: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
