#!/usr/bin/env node
// PAC-83 (owner OQ-1 (c), contract §4.3, spec AC-30): the demo exists only in
// non-production builds. Build the web twice — mode production and mode
// development — into temp directories, then:
//   1. the production build must contain none of the demo markers;
//   2. the development build must contain every one of them (positive
//      control: a marker that exists nowhere would make step 1 vacuous).
// `clockwise:mock-mode` is deliberately not a marker: production code clears it.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MARKERS = [
  "paceday-demo-bundle-v1",
  "paceday:demo",
  "demo-entry",
  "demo-label",
  "intro-chat",
  "product-deepdive",
  "Sarah Chen",
  "Miguel Alvarez",
  "Priya Nair",
  "Zoom connected (demo)",
];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

function found(dir) {
  const hits = new Map(MARKERS.map((m) => [m, []]));
  for (const f of files(dir)) {
    const text = readFileSync(f, "utf8");
    for (const m of MARKERS) if (text.includes(m)) hits.get(m).push(f.slice(dir.length + 1));
  }
  return hits;
}

const vite = join(ROOT, "node_modules", "vite", "bin", "vite.js");
const tmp = mkdtempSync(join(tmpdir(), "paceday-demo-check-"));
const prod = join(tmp, "prod");
const dev = join(tmp, "dev");
let failed = false;
try {
  execFileSync(process.execPath, [vite, "build", "--outDir", prod, "--emptyOutDir", "--logLevel", "error"], { cwd: ROOT, stdio: "inherit" });
  execFileSync(process.execPath, [vite, "build", "--mode", "development", "--outDir", dev, "--emptyOutDir", "--logLevel", "error"], { cwd: ROOT, stdio: "inherit" });

  for (const [marker, where] of found(prod)) {
    if (where.length) {
      failed = true;
      console.error(`FAIL production build contains demo marker ${JSON.stringify(marker)} in: ${where.join(", ")}`);
    }
  }
  for (const [marker, where] of found(dev)) {
    if (!where.length) {
      failed = true;
      console.error(`FAIL development build lacks demo marker ${JSON.stringify(marker)} (the check would be vacuous)`);
    }
  }
  if (!failed) console.log(`demo-check: OK — production build free of ${MARKERS.length} demo markers; development build contains all of them`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
