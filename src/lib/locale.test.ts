import { describe, expect, it } from "vitest";

import { UI_LOCALE } from "./locale";

// Every app source file, as text. shadcn primitives in components/ui format
// numbers, not dates, and tests may use any locale they like.
const sources = import.meta.glob<string>(["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}", "!/src/components/ui/**"], {
  query: "?raw",
  import: "default",
  eager: true,
});

// toLocaleString() / toLocaleDateString(undefined, …) and friends format with
// the browser's locale, which mixes languages in an English-only UI.
const BROWSER_LOCALE = /\.toLocale(?:Date|Time)?String\(\s*(?:undefined\b|\))/;

describe("UI locale", () => {
  it("is English", () => {
    expect(UI_LOCALE).toBe("en-US");
  });

  it("is used for every date and time the app formats", () => {
    const offenders = Object.entries(sources)
      .flatMap(([file, text]) =>
        text.split("\n").flatMap((line, i) => (BROWSER_LOCALE.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
      );
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });
});
