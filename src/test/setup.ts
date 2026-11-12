// PAC-81: tests parse with the same jitless Zod as production (src/main.tsx).
import "@/lib/zodConfig";
import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// PAC-83: a test that enters the demo session (sessionStorage "paceday:demo")
// never leaks it into the next one.
import { afterEach } from "vitest";
afterEach(() => {
  try {
    sessionStorage.removeItem("paceday:demo");
  } catch {
    /* jsdom without storage */
  }
});
