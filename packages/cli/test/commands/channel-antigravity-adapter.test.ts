import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAntigravityArgs,
  createAntigravityCtx,
  encodeAntigravityUserMessage,
  isAntigravityReady,
  parseAntigravityConfig,
  parseAntigravityLine,
  probeCliproxy,
  probeCodeagentWrapper,
  resolveAgyBin,
  resolveWrapperPath,
} from "../../src/commands/channel/adapters/antigravity.js";
import {
  getAdapter,
  isProvider,
  listProviders,
} from "../../src/commands/channel/adapters/index.js";

const BUNDLED_WRAPPER = fileURLToPath(
  new URL("../../bin/codeagent-wrapper.mjs", import.meta.url),
);

function decodeRunnerConfig(args: string[]): Record<string, unknown> {
  expect(args[0]).toBe("-e");
  return JSON.parse(
    Buffer.from(args[2] ?? "", "base64url").toString("utf8"),
  ) as Record<string, unknown>;
}

function restoreEnv(prev: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(prev)) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
}

/** Spawn the embedded worker runner (`node -e <source> <encoded>`) and collect its stdout events. */
function runRunner(
  args: string[],
  message: { type: string; text: string },
): Promise<(Record<string, unknown> & { type?: string; text?: string })[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.on("error", reject);
    child.on("close", () => {
      const events = out
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      resolve(events);
    });
    child.stdin.write(`${JSON.stringify(message)}\n`);
    child.stdin.end();
  });
}

describe("Antigravity channel adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("registers antigravity in the adapter registry", () => {
    expect(isProvider("antigravity")).toBe(true);
    expect(listProviders()).toContain("antigravity");
    expect(getAdapter("antigravity").provider).toBe("antigravity");
  });

  it("runs a full turn through the bundled wrapper → agy (end-to-end)", async () => {
    // Fake `agy` echoes the prompt back so we can assert the passthrough.
    const fakeAgy = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "trellis-agy-")),
      "agy",
    );
    fs.writeFileSync(
      fakeAgy,
      '#!/usr/bin/env node\nprocess.stdout.write("ANSWER: " + process.argv[process.argv.length - 1] + "\\n");\n',
    );
    fs.chmodSync(fakeAgy, 0o755);

    const prev = {
      TRELLIS_CODEAGENT_WRAPPER: process.env.TRELLIS_CODEAGENT_WRAPPER,
      CODEAGENT_WRAPPER: process.env.CODEAGENT_WRAPPER,
      TRELLIS_AGY_BIN: process.env.TRELLIS_AGY_BIN,
      AGY_BIN: process.env.AGY_BIN,
    };
    process.env.TRELLIS_CODEAGENT_WRAPPER = BUNDLED_WRAPPER;
    delete process.env.CODEAGENT_WRAPPER;
    process.env.TRELLIS_AGY_BIN = fakeAgy;
    delete process.env.AGY_BIN;

    try {
      const args = buildAntigravityArgs({
        cwd: os.tmpdir(),
        systemPrompt: "sys",
      });
      const events = await runRunner(args, {
        type: "user",
        text: "hello world",
      });
      const message = events.find((e) => e.type === "message");
      expect(message?.text).toContain("ANSWER: sys\n\nhello world");
      expect(events.some((e) => e.type === "done")).toBe(true);
    } finally {
      restoreEnv(prev);
    }
  });

  it("starts not ready until handshake marks ready", () => {
    const ctx = createAntigravityCtx();
    expect(isAntigravityReady(ctx)).toBe(false);
    parseAntigravityLine(JSON.stringify({ type: "ready" }), ctx);
    expect(isAntigravityReady(ctx)).toBe(true);
  });

  it("encodes user messages as JSON lines", () => {
    expect(encodeAntigravityUserMessage("hello", createAntigravityCtx())).toBe(
      `${JSON.stringify({ type: "user", text: "hello" })}\n`,
    );
  });

  it("parses second_model settings from collab config text", () => {
    const prev = {
      CLIPROXY_API_KEY: process.env.CLIPROXY_API_KEY,
      TRELLIS_CLIPROXY_API_KEY: process.env.TRELLIS_CLIPROXY_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      TRELLIS_CODEAGENT_WRAPPER: process.env.TRELLIS_CODEAGENT_WRAPPER,
      CODEAGENT_WRAPPER: process.env.CODEAGENT_WRAPPER,
    };
    delete process.env.CLIPROXY_API_KEY;
    delete process.env.TRELLIS_CLIPROXY_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.TRELLIS_CODEAGENT_WRAPPER;
    delete process.env.CODEAGENT_WRAPPER;
    try {
      const config = parseAntigravityConfig(`
collab:
  enabled: true
  second_model:
    provider: antigravity
    driver: codeagent-wrapper
    wrapper_path: /opt/bin/codeagent-wrapper
    wrapper_backend: agy
    cliproxy_base_url: "http://10.0.0.2:8317"
    cliproxy_model: gemini-3.5-flash-low
    cliproxy_api_key: yaml-key-value
`);
      expect(config.driver).toBe("codeagent-wrapper");
      expect(config.wrapperPath).toBe("/opt/bin/codeagent-wrapper");
      expect(config.wrapperBackend).toBe("agy");
      expect(config.cliproxyBaseUrl).toBe("http://10.0.0.2:8317");
      expect(config.cliproxyModel).toBe("gemini-3.5-flash-low");
      expect(config.cliproxyApiKey).toBe("yaml-key-value");
      expect(config.secondModelProvider).toBe("antigravity");
    } finally {
      restoreEnv(prev);
    }
  });

  it("prefers CLIPROXY_API_KEY env over yaml api key", () => {
    const prev = process.env.CLIPROXY_API_KEY;
    process.env.CLIPROXY_API_KEY = "from-env";
    try {
      const config = parseAntigravityConfig(`
collab:
  second_model:
    cliproxy_api_key: from-yaml
`);
      expect(config.cliproxyApiKey).toBe("from-env");
    } finally {
      if (prev === undefined) delete process.env.CLIPROXY_API_KEY;
      else process.env.CLIPROXY_API_KEY = prev;
    }
  });

  it("fails probe when cliproxy is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    await expect(probeCliproxy("http://127.0.0.1:9")).rejects.toThrow(
      /cliproxy probe failed/,
    );
  });

  it("fails probe when cliproxy returns non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      })),
    );

    await expect(probeCliproxy("http://127.0.0.1:8317")).rejects.toThrow(
      /cliproxy probe failed/,
    );
  });

  it("sends Authorization bearer when probing with api key", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      probeCliproxy("http://127.0.0.1:8317", "test-key"),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalled();
    const init = fetchMock.mock.calls[0]?.[1] as {
      headers?: Record<string, string>;
    };
    expect(init?.headers?.authorization).toBe("Bearer test-key");
  });

  it("fails codeagent-wrapper probe when neither wrapper nor agy is usable", async () => {
    // Force every wrapper candidate (PATH / auto-home / bundled) to look absent
    // so the fail-fast path is exercised without dismantling the package layout.
    const realExists = fs.existsSync.bind(fs);
    const spy = vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const s = String(p);
      if (s.includes("codeagent-wrapper")) return false;
      return realExists(p);
    });
    try {
      await expect(
        probeCodeagentWrapper(
          "/no/such/codeagent-wrapper-xyz",
          "agy",
          "/no/such/agy-xyz",
        ),
      ).rejects.toThrow(/codeagent-wrapper probe failed/);
    } finally {
      spy.mockRestore();
    }
  });

  it("passes codeagent-wrapper probe via the bundled wrapper when agy is missing", async () => {
    await expect(
      probeCodeagentWrapper(
        "/no/such/codeagent-wrapper-xyz",
        "agy",
        "/no/such/agy-xyz",
      ),
    ).resolves.toBeUndefined();
  });

  it("passes codeagent-wrapper probe via the agy degrade path", async () => {
    // Bogus wrapper, but a real executable stands in for `agy`.
    await expect(
      probeCodeagentWrapper("/no/such/wrapper", "agy", process.execPath),
    ).resolves.toBeUndefined();
  });

  it("resolves agy bin from env override", () => {
    const prev = {
      TRELLIS_AGY_BIN: process.env.TRELLIS_AGY_BIN,
      AGY_BIN: process.env.AGY_BIN,
    };
    process.env.TRELLIS_AGY_BIN = "/opt/bin/agy";
    delete process.env.AGY_BIN;
    try {
      expect(resolveAgyBin()).toBe("/opt/bin/agy");
    } finally {
      restoreEnv(prev);
    }
  });

  it("parses agy_bin from collab config", () => {
    const prev = {
      TRELLIS_AGY_BIN: process.env.TRELLIS_AGY_BIN,
      AGY_BIN: process.env.AGY_BIN,
    };
    delete process.env.TRELLIS_AGY_BIN;
    delete process.env.AGY_BIN;
    try {
      const config = parseAntigravityConfig(`
collab:
  second_model:
    driver: codeagent-wrapper
    agy_bin: /custom/agy
`);
      expect(config.agyBin).toBe("/custom/agy");
    } finally {
      restoreEnv(prev);
    }
  });

  it("builds a node-invoked wrapper-mode runner for a .mjs wrapper", () => {
    const prev = {
      TRELLIS_CODEAGENT_WRAPPER: process.env.TRELLIS_CODEAGENT_WRAPPER,
      CODEAGENT_WRAPPER: process.env.CODEAGENT_WRAPPER,
    };
    process.env.TRELLIS_CODEAGENT_WRAPPER = BUNDLED_WRAPPER;
    delete process.env.CODEAGENT_WRAPPER;
    try {
      const cfg = decodeRunnerConfig(
        buildAntigravityArgs({ cwd: os.tmpdir(), systemPrompt: "sp" }),
      );
      expect(cfg.mode).toBe("wrapper");
      expect(cfg.wrapperPath).toBe(BUNDLED_WRAPPER);
      expect(cfg.wrapperViaNode).toBe(true);
    } finally {
      restoreEnv(prev);
    }
  });

  it("falls back to the bundled wrapper when an explicit wrapper is unusable", () => {
    // A non-executable, non-.mjs stub must not block the Trellis-bundled .mjs.
    const badWrapper = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "trellis-wrapper-")),
      "codeagent-wrapper",
    );
    fs.writeFileSync(badWrapper, "#!/bin/sh\necho broken\n");
    // leave without +x so wrapperExecutable rejects it
    const prev = {
      TRELLIS_CODEAGENT_WRAPPER: process.env.TRELLIS_CODEAGENT_WRAPPER,
      CODEAGENT_WRAPPER: process.env.CODEAGENT_WRAPPER,
    };
    process.env.TRELLIS_CODEAGENT_WRAPPER = badWrapper;
    delete process.env.CODEAGENT_WRAPPER;
    try {
      const cfg = decodeRunnerConfig(
        buildAntigravityArgs({ cwd: os.tmpdir(), systemPrompt: "sp" }),
      );
      expect(cfg.mode).toBe("wrapper");
      expect(cfg.wrapperPath).toBe(BUNDLED_WRAPPER);
      expect(cfg.wrapperViaNode).toBe(true);
    } finally {
      restoreEnv(prev);
    }
  });

  it("prefers bundled wrapper over a missing explicit path (resolve-time)", () => {
    // Bundled wrapper is always present in-package; a missing override must
    // not force agy mode — runtime degrade is only for invocation failure.
    const prev = {
      TRELLIS_CODEAGENT_WRAPPER: process.env.TRELLIS_CODEAGENT_WRAPPER,
      CODEAGENT_WRAPPER: process.env.CODEAGENT_WRAPPER,
      TRELLIS_AGY_BIN: process.env.TRELLIS_AGY_BIN,
      AGY_BIN: process.env.AGY_BIN,
    };
    process.env.TRELLIS_CODEAGENT_WRAPPER = "/no/such/wrapper";
    delete process.env.CODEAGENT_WRAPPER;
    process.env.TRELLIS_AGY_BIN = process.execPath;
    delete process.env.AGY_BIN;
    try {
      const cfg = decodeRunnerConfig(
        buildAntigravityArgs({
          cwd: os.tmpdir(),
          model: "m",
          systemPrompt: "sp",
        }),
      );
      expect(cfg.mode).toBe("wrapper");
      expect(cfg.wrapperPath).toBe(BUNDLED_WRAPPER);
      expect(cfg.wrapperViaNode).toBe(true);
      expect(cfg.agyBin).toBe(process.execPath);
      expect(cfg.model).toBe("m");
    } finally {
      restoreEnv(prev);
    }
  });

  it("runtime-degrades to direct agy when the preferred wrapper fails", async () => {
    // Broken wrapper: exits 1 with empty stdout so spawnBackend reports !ok.
    const badWrapper = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "trellis-wrapper-")),
      "codeagent-wrapper.mjs",
    );
    fs.writeFileSync(
      badWrapper,
      "#!/usr/bin/env node\nprocess.stderr.write('wrapper boom\\n');\nprocess.exit(1);\n",
    );
    const fakeAgy = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "trellis-agy-")),
      "agy",
    );
    fs.writeFileSync(
      fakeAgy,
      '#!/usr/bin/env node\nprocess.stdout.write("FROM_AGY: " + process.argv[process.argv.length - 1] + "\\n");\n',
    );
    fs.chmodSync(fakeAgy, 0o755);

    const prev = {
      TRELLIS_CODEAGENT_WRAPPER: process.env.TRELLIS_CODEAGENT_WRAPPER,
      CODEAGENT_WRAPPER: process.env.CODEAGENT_WRAPPER,
      TRELLIS_AGY_BIN: process.env.TRELLIS_AGY_BIN,
      AGY_BIN: process.env.AGY_BIN,
    };
    process.env.TRELLIS_CODEAGENT_WRAPPER = badWrapper;
    delete process.env.CODEAGENT_WRAPPER;
    process.env.TRELLIS_AGY_BIN = fakeAgy;
    delete process.env.AGY_BIN;

    try {
      const args = buildAntigravityArgs({
        cwd: os.tmpdir(),
        systemPrompt: "sys",
      });
      const cfg = decodeRunnerConfig(args);
      expect(cfg.mode).toBe("wrapper");
      expect(cfg.wrapperPath).toBe(badWrapper);
      expect(cfg.agyBin).toBe(fakeAgy);

      const events = await runRunner(args, {
        type: "user",
        text: "hello degrade",
      });
      expect(
        events.some(
          (e) =>
            e.type === "progress" &&
            (e as { detail?: { status?: string } }).detail?.status ===
              "wrapper_degraded",
        ),
      ).toBe(true);
      const message = events.find((e) => e.type === "message");
      expect(message?.text).toContain("FROM_AGY: sys\n\nhello degrade");
      expect(events.filter((e) => e.type === "done")).toHaveLength(1);
      expect(events.some((e) => e.type === "error")).toBe(false);
    } finally {
      restoreEnv(prev);
    }
  });

  it("resolves wrapper path from yaml when file exists", () => {
    // PATH basename still returns a string even if missing; yaml path preferred only when exists.
    // Use a known existing file as path to avoid depending on home install.
    const existing = process.execPath;
    const prev = {
      TRELLIS_CODEAGENT_WRAPPER: process.env.TRELLIS_CODEAGENT_WRAPPER,
      CODEAGENT_WRAPPER: process.env.CODEAGENT_WRAPPER,
    };
    delete process.env.TRELLIS_CODEAGENT_WRAPPER;
    delete process.env.CODEAGENT_WRAPPER;
    try {
      expect(resolveWrapperPath(existing)).toBe(existing);
    } finally {
      restoreEnv(prev);
    }
  });

  it("parses progress lines with detail", () => {
    const result = parseAntigravityLine(
      JSON.stringify({
        type: "progress",
        detail: { kind: "driver_status", status: "request_started" },
      }),
      createAntigravityCtx(),
    );

    expect(result.events).toEqual([
      {
        kind: "progress",
        payload: {
          detail: { kind: "driver_status", status: "request_started" },
        },
      },
    ]);
  });

  it("parses progress lines without detail as status fallback", () => {
    const result = parseAntigravityLine(
      JSON.stringify({ type: "progress", text: "thinking" }),
      createAntigravityCtx(),
    );

    expect(result.events).toEqual([
      {
        kind: "progress",
        payload: {
          detail: { kind: "status", message: "antigravity progress" },
        },
      },
    ]);
  });

  it("parses message lines", () => {
    const result = parseAntigravityLine(
      JSON.stringify({ type: "message", text: "final answer" }),
      createAntigravityCtx(),
    );

    expect(result.events).toEqual([
      {
        kind: "message",
        payload: { text: "final answer" },
      },
    ]);
  });

  it("parses done lines", () => {
    const result = parseAntigravityLine(
      JSON.stringify({ type: "done", duration_ms: 12 }),
      createAntigravityCtx(),
    );

    expect(result.events).toEqual([
      {
        kind: "done",
        payload: { duration_ms: 12 },
      },
    ]);
  });

  it("parses error lines", () => {
    const result = parseAntigravityLine(
      JSON.stringify({ type: "error", message: "driver missing" }),
      createAntigravityCtx(),
    );

    expect(result.events).toEqual([
      {
        kind: "error",
        payload: { message: "driver missing" },
      },
    ]);
  });
});
