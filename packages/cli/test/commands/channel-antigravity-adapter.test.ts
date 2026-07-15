import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAntigravityCtx,
  encodeAntigravityUserMessage,
  isAntigravityReady,
  parseAntigravityConfig,
  parseAntigravityLine,
  probeCliproxy,
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
    const config = parseAntigravityConfig(`
collab:
  enabled: true
  second_model:
    provider: antigravity
    driver: gemini-cli
    cliproxy_base_url: "http://10.0.0.2:8317"
    cliproxy_model: gemini-3.5-flash-low
`);
    expect(config).toEqual({
      driver: "gemini-cli",
      cliproxyBaseUrl: "http://10.0.0.2:8317",
      cliproxyModel: "gemini-3.5-flash-low",
      secondModelProvider: "antigravity",
    });
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
