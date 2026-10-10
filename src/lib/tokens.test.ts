/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Read from disk: vitest's CSS handling empties CSS modules, even with ?raw.
// Vitest runs from the project root.
const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

// Light theme tokens from :root, as "H S% L%" strings.
const root = css.slice(css.indexOf(":root {"), css.indexOf(".dark {"));
const tokens = Object.fromEntries(
  [...root.matchAll(/--([\w-]+):\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/g)].map((m) => [
    m[1],
    [Number(m[2]), Number(m[3]), Number(m[4])] as const,
  ]),
);

function rgb([h, s, l]: readonly [number, number, number]): [number, number, number] {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

function luminance(c: [number, number, number]): number {
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: string, bg: string): number {
  const a = luminance(rgb(tokens[fg]));
  const b = luminance(rgb(tokens[bg]));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Every pairing the UI renders text in. WCAG 2.1 AA, 1.4.3: 4.5:1 for body text.
const TEXT_PAIRS: Array<[fg: string, bg: string]> = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["primary-foreground", "primary"],
  ["primary", "card"],
  ["primary", "background"],
  ["primary", "primary-muted"],
  ["destructive-foreground", "destructive"],
  ["destructive", "card"],
  ["success-foreground", "success"],
  ["success", "card"],
  ["ai-foreground", "ai"],
  ["ai", "card"],
  ["info-foreground", "info"],
  ["warning-foreground", "warning"],
  ["accent-foreground", "accent"],
  ["secondary-foreground", "secondary"],
];

describe("colour tokens", () => {
  it("parses the light theme", () => {
    expect(Object.keys(tokens).length).toBeGreaterThan(20);
  });

  it.each(TEXT_PAIRS)("%s on %s meets WCAG AA (4.5:1)", (fg, bg) => {
    expect(tokens[fg], `--${fg} missing`).toBeDefined();
    expect(tokens[bg], `--${bg} missing`).toBeDefined();
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
