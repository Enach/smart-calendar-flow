/**
 * PAC-143: the web fonts are self-hosted. These tests pin that the page links
 * no font host (a visitor's address must not go to Google, and the api repo's
 * CSP allows fonts only from the site) and that main.tsx loads exactly the
 * faces the Google Fonts link declared before, from pinned packages whose
 * faces are upright, font-display: swap and served from the package's files.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const FONT_IMPORT = /^import "(@fontsource\/[a-z-]+)\/(\d{3})\.css";$/gm;

describe("self-hosted web fonts (PAC-143)", () => {
  it("index.html links no font host and no external stylesheet", () => {
    const html = read("index.html");
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(html).not.toMatch(/<link[^>]+rel="(stylesheet|preconnect|preload|dns-prefetch)"[^>]+href="(https?:)?\/\//);
  });

  it("main.tsx loads exactly the faces the Google Fonts link declared", () => {
    const faces = [...read("src/main.tsx").matchAll(FONT_IMPORT)].map(([, pkg, w]) => `${pkg} ${w}`).sort();
    expect(faces).toEqual([
      "@fontsource/inter 400",
      "@fontsource/inter 500",
      "@fontsource/inter 600",
      "@fontsource/inter 700",
      "@fontsource/playfair-display 500",
      "@fontsource/playfair-display 600",
      "@fontsource/playfair-display 700",
    ]);
  });

  it("each package is pinned, keeps its licence, and declares upright swap faces from its own files", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    for (const [, name, weight] of read("src/main.tsx").matchAll(FONT_IMPORT)) {
      expect(pkg.dependencies[name], `${name} pinned to an exact version`).toMatch(/^\d+\.\d+\.\d+$/);
      const dir = path.join(ROOT, "node_modules", name);
      const css = readFileSync(path.join(dir, `${weight}.css`), "utf8");
      const blocks = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, b]) => b);
      expect(blocks.length, `${name}/${weight}.css`).toBeGreaterThan(0);
      for (const b of blocks) {
        expect(b).toMatch(/font-style:\s*normal;/);
        expect(b).toMatch(/font-display:\s*swap;/);
        expect(b).toMatch(new RegExp(`font-weight:\\s*${weight};`));
        for (const [, url] of b.matchAll(/url\(([^)]+)\)/g)) {
          expect(url, "a package file, never a remote URL").toMatch(/^\.\/files\/[a-z0-9-]+\.woff2?$/);
          expect(existsSync(path.join(dir, url)), url).toBe(true);
        }
      }
    }
    expect(existsSync(path.join(ROOT, "public/fonts/Inter-OFL.txt"))).toBe(true);
    expect(existsSync(path.join(ROOT, "public/fonts/PlayfairDisplay-OFL.txt"))).toBe(true);
  });
});
