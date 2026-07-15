import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAntigravityCtx,
  encodeAntigravityUserMessage,
  isAntigravityReady,
  parseAntigravityConfig,
  parseAntigravityLine,
  probeCliproxy,
  probeCodeagentWrapper,
  resolveWrapperPath,
} from "../../src/commands/channel/adapters/antigravity.js";
import {
  getAdapter,
  isProvider,
  listProviders,
} from "../../src/commands/channel/adapters/index.js";

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
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
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

  it("fails codeagent-wrapper probe when binary is missing", async () => {
    await expect(
      probeCodeagentWrapper("/no/such/codeagent-wrapper-xyz"),
    ).rejects.toThrow(/codeagent-wrapper probe failed/);
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
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
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
