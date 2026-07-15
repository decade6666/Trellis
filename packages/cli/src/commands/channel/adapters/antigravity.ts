import fs from "node:fs";
import path from "node:path";

import { DIR_NAMES } from "../../../constants/paths.js";

import type { ParseResult } from "./types.js";

const DEFAULT_DRIVER = "cliproxy";
const DEFAULT_CLIPROXY_BASE_URL = "http://127.0.0.1:8317";
const DEFAULT_CLIPROXY_MODEL = "gemini-3.1-pro-low";

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
  const response = await fetch(new URL("/v1/chat/completions", config.baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
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

export type AntigravityDriver = "cliproxy" | "gemini-cli" | "codeagent-wrapper";

export interface AntigravityConfig {
  driver: AntigravityDriver;
  cliproxyBaseUrl: string;
  cliproxyModel: string;
  secondModelProvider: string;
}

export interface AntigravityCtx {
  driver: AntigravityDriver;
  ready: boolean;
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
  const runnerConfig = {
    baseUrl: config.cliproxyBaseUrl,
    model: view.model ?? config.cliproxyModel,
    systemPrompt: view.systemPrompt,
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
  await probeCliproxy(config.cliproxyBaseUrl);
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

export function loadAntigravityConfig(cwd: string): AntigravityConfig {
  const defaults: AntigravityConfig = {
    driver: DEFAULT_DRIVER,
    cliproxyBaseUrl: DEFAULT_CLIPROXY_BASE_URL,
    cliproxyModel: DEFAULT_CLIPROXY_MODEL,
    secondModelProvider: "antigravity",
  };
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
  defaults: AntigravityConfig = {
    driver: DEFAULT_DRIVER,
    cliproxyBaseUrl: DEFAULT_CLIPROXY_BASE_URL,
    cliproxyModel: DEFAULT_CLIPROXY_MODEL,
    secondModelProvider: "antigravity",
  },
): AntigravityConfig {
  const resolved: AntigravityConfig = { ...defaults };
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
      if (!/^ {4}\S/.test(line)) {
        inSecondModel = false;
      }
    }

    if (inCollab && /^\S/.test(line)) {
      inCollab = false;
      inSecondModel = false;
    }
  }

  return resolved;
}

export async function probeCliproxy(baseUrl: string): Promise<void> {
  const normalized = normalizeBaseUrl(baseUrl);
  const candidates = ["/v1/models", "/models"];
  const failures: string[] = [];

  for (const pathname of candidates) {
    try {
      const response = await fetch(new URL(pathname, normalized), {
        method: "GET",
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
      "Set collab.second_model.cliproxy_base_url to a reachable OpenAI-compatible endpoint or disable collab.",
  );
}

function assertSupportedDriver(driver: AntigravityDriver): void {
  if (driver === "cliproxy") return;
  throw new Error(
    `Antigravity driver '${driver}' is not implemented yet. Use collab.second_model.driver: cliproxy.`,
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
