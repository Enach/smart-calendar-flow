import { afterEach, describe, expect, it, vi } from "vitest";

import { TOP_LEVEL_LINK_TARGET, frameGuardEnabled, isFramed } from "./framing";

describe("PAC-91 framing helpers (contract section 3.1)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("the guard is enforced in a production build (__PACEDAY_DEMO_BUILD__ false)", () => {
    vi.stubGlobal("__PACEDAY_DEMO_BUILD__", false);
    expect(frameGuardEnabled()).toBe(true);
  });

  it("the guard is off in a non-production build (__PACEDAY_DEMO_BUILD__ true: Lovable preview, dev)", () => {
    vi.stubGlobal("__PACEDAY_DEMO_BUILD__", true);
    expect(frameGuardEnabled()).toBe(false);
  });

  it("the shared link target is the top-level browsing context (OQ-1 default)", () => {
    expect(TOP_LEVEL_LINK_TARGET).toBe("_top");
  });

  it("is not framed when this window is the top-level window", () => {
    expect(isFramed()).toBe(false);
  });

  it("is framed when the top-level window is another window", () => {
    const other = {} as Window;
    vi.spyOn(window, "top", "get").mockReturnValue(other as unknown as Window & typeof globalThis);
    expect(isFramed()).toBe(true);
  });

  it("fails closed when reading the top-level window throws", () => {
    vi.spyOn(window, "top", "get").mockImplementation(() => {
      throw new DOMException("Blocked a frame", "SecurityError");
    });
    expect(isFramed()).toBe(true);
  });
});
