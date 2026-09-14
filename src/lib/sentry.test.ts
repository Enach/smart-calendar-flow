import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ESM namespaces are not configurable, so spyOn(Sentry, "init") fails. Mock the
// module instead and drive `init` behavior per test via the mock.
vi.mock("@sentry/react", () => ({
  init: vi.fn(),
  ErrorBoundary: ({ children }: { children: unknown }) => children,
}));

import * as Sentry from "@sentry/react";

import {
  DEFAULT_SENTRY_DSN,
  __resetMonitoringStatusForTests,
  getMonitoringStatus,
  initSentry,
  resolveSentryConfig,
  sentryConfigSchema,
} from "./sentry";

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
      dsn: DEFAULT_SENTRY_DSN,
      environment: "test",
    });
    expect(parsed.enabled).toBe(true);
    expect(parsed.dsn).toBe(DEFAULT_SENTRY_DSN);
  });

  it("rejects a non-URL dsn", () => {
    expect(() =>
      sentryConfigSchema.parse({ dsn: "not-a-url", environment: "test" }),
    ).toThrow();
  });

  it("rejects unknown fields rather than passing them through", () => {
    expect(() =>
      sentryConfigSchema.parse({
        dsn: DEFAULT_SENTRY_DSN,
        environment: "test",
        unexpected: true,
      }),
    ).toThrow();
  });
});

describe("resolveSentryConfig", () => {
  it("falls back to the documented default DSN when unset", () => {
    const cfg = resolveSentryConfig({ MODE: "development" });
    expect(cfg.dsn).toBe(DEFAULT_SENTRY_DSN);
    expect(cfg.environment).toBe("development");
  });

  it("falls back to the default when the DSN is empty/whitespace", () => {
    const cfg = resolveSentryConfig({ VITE_SENTRY_DSN: "   ", MODE: "test" });
    expect(cfg.dsn).toBe(DEFAULT_SENTRY_DSN);
  });

  it("uses the environment DSN when provided", () => {
    const dsn = "https://abc123@o1.ingest.de.sentry.io/2";
    const cfg = resolveSentryConfig({ VITE_SENTRY_DSN: dsn, MODE: "staging" });
    expect(cfg.dsn).toBe(dsn);
    expect(cfg.environment).toBe("staging");
  });
});

describe("initSentry state transitions (contract §4)", () => {
  it("transitions uninitialized -> active on success", () => {
    expect(getMonitoringStatus()).toBe("uninitialized");

    const status = initSentry({ VITE_SENTRY_DSN: DEFAULT_SENTRY_DSN, MODE: "test" });

    expect(status).toBe("active");
    expect(getMonitoringStatus()).toBe("active");
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({ sendDefaultPii: false, tracesSampleRate: 0.0 }),
    );
  });

  it("transitions uninitialized -> disabled when init throws (fail-open)", () => {
    initMock.mockImplementation(() => {
      throw new Error("boom");
    });

    const status = initSentry({ VITE_SENTRY_DSN: DEFAULT_SENTRY_DSN, MODE: "test" });

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
    expect(initSentry({ VITE_SENTRY_DSN: DEFAULT_SENTRY_DSN, MODE: "test" })).toBe("active");
    expect(initSentry({ VITE_SENTRY_DSN: DEFAULT_SENTRY_DSN, MODE: "test" })).toBe("active");

    expect(initMock).toHaveBeenCalledTimes(1);
  });

  it("does not recover from disabled back to active (no illegal transition)", () => {
    initMock.mockImplementationOnce(() => {
      throw new Error("boom");
    });

    expect(initSentry({ VITE_SENTRY_DSN: DEFAULT_SENTRY_DSN, MODE: "test" })).toBe("disabled");
    // Second call must stay disabled — only `uninitialized` may transition.
    expect(initSentry({ VITE_SENTRY_DSN: DEFAULT_SENTRY_DSN, MODE: "test" })).toBe("disabled");
  });
});
