import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ESM namespaces are not configurable, so spyOn(Sentry, "init") fails. Mock the
// module instead and drive `init` behavior per test via the mock.
vi.mock("@sentry/react", () => ({
  init: vi.fn(),
  ErrorBoundary: ({ children }: { children: unknown }) => children,
}));

import * as Sentry from "@sentry/react";

import * as sentryModule from "./sentry";
import {
  __resetMonitoringStatusForTests,
  getMonitoringStatus,
  initSentry,
  resolveSentryConfig,
  sentryConfigSchema,
} from "./sentry";

// A placeholder, not a real project: tests never carry a real DSN (PAC-86).
const TEST_DSN = "https://publickey@o1.ingest.example.test/1";

const initMock = vi.mocked(Sentry.init);

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  __resetMonitoringStatusForTests();
  initMock.mockReset();
  vi.restoreAllMocks();
});

describe("sentryConfigSchema (contract §4, strict)", () => {
  it("accepts a valid config and defaults enabled to true", () => {
    const parsed = sentryConfigSchema.parse({
      dsn: TEST_DSN,
      environment: "test",
    });
    expect(parsed.enabled).toBe(true);
    expect(parsed.dsn).toBe(TEST_DSN);
  });

  it("rejects a non-URL dsn", () => {
    expect(() =>
      sentryConfigSchema.parse({ dsn: "not-a-url", environment: "test" }),
    ).toThrow();
  });

  it("rejects unknown fields rather than passing them through", () => {
    expect(() =>
      sentryConfigSchema.parse({
        dsn: TEST_DSN,
        environment: "test",
        unexpected: true,
      }),
    ).toThrow();
  });
});

describe("resolveSentryConfig (PAC-86: no default DSN)", () => {
  it("returns null when the DSN is unset", () => {
    expect(resolveSentryConfig({ MODE: "production" })).toBeNull();
  });

  it("returns null when the DSN is empty or whitespace", () => {
    expect(resolveSentryConfig({ VITE_SENTRY_DSN: "", MODE: "production" })).toBeNull();
    expect(resolveSentryConfig({ VITE_SENTRY_DSN: "   ", MODE: "test" })).toBeNull();
  });

  it("uses the build-time DSN when provided", () => {
    const cfg = resolveSentryConfig({ VITE_SENTRY_DSN: TEST_DSN, MODE: "staging" });
    expect(cfg).not.toBeNull();
    expect(cfg?.dsn).toBe(TEST_DSN);
    expect(cfg?.environment).toBe("staging");
  });

  it("exports no default DSN", () => {
    expect(Object.keys(sentryModule)).not.toContain("DEFAULT_SENTRY_DSN");
  });
});

describe("initSentry state transitions (contract §4)", () => {
  it("transitions uninitialized -> disabled without a DSN and never calls init", () => {
    const status = initSentry({ MODE: "production" });

    expect(status).toBe("disabled");
    expect(getMonitoringStatus()).toBe("disabled");
    expect(initMock).not.toHaveBeenCalled();
  });

  it("transitions uninitialized -> disabled on an empty DSN and never calls init", () => {
    expect(initSentry({ VITE_SENTRY_DSN: "  ", MODE: "production" })).toBe("disabled");
    expect(initMock).not.toHaveBeenCalled();
  });

  it("transitions uninitialized -> active on success, with the configured DSN", () => {
    expect(getMonitoringStatus()).toBe("uninitialized");

    const status = initSentry({ VITE_SENTRY_DSN: TEST_DSN, MODE: "test" });

    expect(status).toBe("active");
    expect(getMonitoringStatus()).toBe("active");
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: TEST_DSN,
        environment: "test",
        sendDefaultPii: false,
        tracesSampleRate: 0.0,
      }),
    );
  });

  it("transitions uninitialized -> disabled when init throws (fail-open)", () => {
    initMock.mockImplementation(() => {
      throw new Error("boom");
    });

    const status = initSentry({ VITE_SENTRY_DSN: TEST_DSN, MODE: "test" });

    expect(status).toBe("disabled");
    expect(getMonitoringStatus()).toBe("disabled");
  });

  it("transitions uninitialized -> disabled on a malformed DSN (fail-open)", () => {
    // A malformed non-empty DSN fails schema validation -> disabled, and init
    // is never called.
    const status = initSentry({ VITE_SENTRY_DSN: "http://[::bad", MODE: "test" });

    expect(status).toBe("disabled");
    expect(initMock).not.toHaveBeenCalled();
  });

  it("never re-inits: a second call after active is a no-op", () => {
    expect(initSentry({ VITE_SENTRY_DSN: TEST_DSN, MODE: "test" })).toBe("active");
    expect(initSentry({ VITE_SENTRY_DSN: TEST_DSN, MODE: "test" })).toBe("active");

    expect(initMock).toHaveBeenCalledTimes(1);
  });

  it("does not recover from disabled back to active (no illegal transition)", () => {
    initMock.mockImplementationOnce(() => {
      throw new Error("boom");
    });

    expect(initSentry({ VITE_SENTRY_DSN: TEST_DSN, MODE: "test" })).toBe("disabled");
    // Second call must stay disabled — only `uninitialized` may transition.
    expect(initSentry({ VITE_SENTRY_DSN: TEST_DSN, MODE: "test" })).toBe("disabled");
  });

  it("stays disabled when a DSN appears after a no-DSN start", () => {
    expect(initSentry({ MODE: "production" })).toBe("disabled");
    expect(initSentry({ VITE_SENTRY_DSN: TEST_DSN, MODE: "production" })).toBe("disabled");
    expect(initMock).not.toHaveBeenCalled();
  });
});

// PAC-86: no Sentry DSN or ingest host is hard-coded anywhere the web ships or
// documents, so monitoring is on only when the build sets VITE_SENTRY_DSN.
describe("no hard-coded Sentry DSN (PAC-86)", () => {
  const SENTRY_INGEST = /ingest\.(?:[a-z0-9-]+\.)*sentry\.io/i;

  const sources = import.meta.glob<string>(["/src/**/*.{ts,tsx}", "!/src/api/generated/**"], {
    query: "?raw",
    import: "default",
    eager: true,
  });

  it("scans the app sources", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
  });

  it("has no Sentry ingest DSN in src/", () => {
    const offenders = Object.entries(sources)
      .filter(([, text]) => SENTRY_INGEST.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it.each([".env.example", "index.html", "vite.config.ts"])("has no Sentry ingest DSN in %s", (file) => {
    const text = readFileSync(resolve(process.cwd(), file), "utf8");
    expect(SENTRY_INGEST.test(text)).toBe(false);
  });

  it(".env.example ships an empty VITE_SENTRY_DSN", () => {
    const text = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    expect(text).toMatch(/^VITE_SENTRY_DSN=[ \t]*\r?$/m);
  });
});
