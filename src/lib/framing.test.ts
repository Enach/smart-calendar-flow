import { afterEach, describe, expect, it, vi } from "vitest";

import { TOP_LEVEL_LINK_TARGET, isFramed } from "./framing";

describe("PAC-91 framing helpers (contract section 3.1)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
