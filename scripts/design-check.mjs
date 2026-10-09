#!/usr/bin/env node
// Design gate for `make verify` (factory §3). Runs the Impeccable detector — 59
// deterministic rules, no LLM, no API key — over src/ and ratchets against a
// committed baseline, so the gate can land on a codebase that already has
// findings without either failing forever or hiding them.
//
//   node scripts/design-check.mjs            # the gate
//   node scripts/design-check.mjs --update   # rewrite the baseline from the current scan
//
// What fails the gate:
//   1. The detector could not scan something (exit 1). Never treated as a pass.
//   2. A finding whose fingerprint is not in .impeccable/baseline.json, or more
//      occurrences of a fingerprint than the baseline records.
//   3. An `impeccable-disable*` comment in src/ that does not name a PAC issue —
//      the same rule factory §3.4 applies to eslint-disable and t.Skip.
//   4. A baseline entry that is new relative to origin/main and carries no
//      `"issue": "PAC-NN"` field. Regenerating the baseline is how a finding is
//      accepted, so accepting one has to name who will remove it. Skipped, with
//      a printed note, when origin/main has no baseline yet or is not fetched.
//
// The fingerprint deliberately omits the line number: `rule|file|snippet`.
// Lines shift on every unrelated edit; the snippet is what the finding is about.
//
// IMPECCABLE_CMD overrides the detector command (used by the tests, and to point
// at a locally installed binary). Default pins the version so a detector
// upgrade is a reviewed diff, never a silent change in what the gate means.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const IMPECCABLE_VERSION = "4.5.2";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BASELINE = path.join(ROOT, ".impeccable", "baseline.json");
const BASELINE_REL = ".impeccable/baseline.json";
const SCAN_TARGET = "src";
const update = process.argv.includes("--update");

const fail = (msg) => { console.error(`design-check: ${msg}`); process.exit(1); };
const note = (msg) => console.error(`design-check: ${msg}`);

// ---------- 1. scan ----------
function scan() {
  const cmd = process.env.IMPECCABLE_CMD || `npx --yes impeccable@${IMPECCABLE_VERSION}`;
  const r = spawnSync(`${cmd} detect --json --no-advisory ${SCAN_TARGET}`, {
    cwd: ROOT, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) fail(`could not start the detector: ${r.error.message}`);
  // 0 = clean, 2 = findings, anything else = the scan did not complete.
  if (r.status !== 0 && r.status !== 2) {
    process.stderr.write(r.stderr || "");
    fail(`detector exited ${r.status} — scan incomplete, gate fails (an unscanned file is not a clean file)`);
  }
  let findings;
  try { findings = JSON.parse(r.stdout || "[]"); }
  catch { process.stderr.write(r.stdout.slice(0, 2000)); fail("detector output is not JSON"); }
  if (!Array.isArray(findings)) fail("detector JSON is not an array");
  return findings.filter((f) => f.advisory !== true && f.severity !== "advisory");
}

const rel = (p) => path.relative(ROOT, path.resolve(ROOT, String(p || ""))).split(path.sep).join("/");
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 160);
const fingerprint = (f) => `${f.antipattern}|${rel(f.file)}|${norm(f.snippet)}`;

function count(fps) {
  const m = new Map();
  for (const fp of fps) m.set(fp, (m.get(fp) || 0) + 1);
  return m;
}

function readBaseline(text, where) {
  try {
    const b = JSON.parse(text);
    if (!Array.isArray(b.entries)) throw new Error("no entries array");
    return b;
  } catch (e) { fail(`${where} is malformed: ${e.message}`); }
}

const findings = scan();
const current = count(findings.map(fingerprint));

// ---------- --update ----------
if (update) {
  const old = existsSync(BASELINE) ? readBaseline(readFileSync(BASELINE, "utf8"), BASELINE_REL) : { entries: [] };
  const issues = new Map(old.entries.filter((e) => e.issue).map((e) => [e.fingerprint, e.issue]));
  const entries = [...current.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fingerprint, n]) => {
    const e = { fingerprint, count: n };
    if (issues.has(fingerprint)) e.issue = issues.get(fingerprint);
    return e;
  });
  mkdirSync(path.dirname(BASELINE), { recursive: true });
  writeFileSync(BASELINE, JSON.stringify({ tool: `impeccable@${IMPECCABLE_VERSION}`, entries }, null, 2) + "\n");
  console.log(`design-check: wrote ${entries.length} fingerprint(s) to ${BASELINE_REL}.`);
  console.log("design-check: any entry new relative to origin/main needs an \"issue\": \"PAC-NN\" field before the gate passes.");
  process.exit(0);
}

// ---------- 2. ratchet ----------
if (!existsSync(BASELINE)) fail(`${BASELINE_REL} missing — run: make design-baseline`);
const baseline = readBaseline(readFileSync(BASELINE, "utf8"), BASELINE_REL);
const allowed = new Map(baseline.entries.map((e) => [e.fingerprint, e.count || 1]));
let problems = 0;

for (const [fp, n] of current) {
  const ok = allowed.get(fp) || 0;
  if (n > ok) {
    problems++;
    const sample = findings.find((f) => fingerprint(f) === fp);
    console.error(`NEW  ${fp.split("|")[0]}  ${rel(sample.file)}:${sample.line || 0}  (${n} found, ${ok} baselined)`);
    if (sample.description) console.error(`     ${sample.description}`);
  }
}
const fixed = [...allowed.keys()].filter((fp) => (current.get(fp) || 0) < allowed.get(fp));
if (fixed.length) note(`${fixed.length} baselined finding(s) no longer occur — shrink the baseline: make design-baseline`);

// ---------- 3. inline waivers must name an issue ----------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "node_modules") walk(p, out); }
    else if (/\.(tsx?|jsx?|css|html?|mdx?)$/.test(name)) out.push(p);
  }
  return out;
}
for (const file of walk(path.join(ROOT, SCAN_TARGET))) {
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    if (/impeccable-disable/.test(line) && !/PAC-\d+/.test(line)) {
      problems++;
      console.error(`WAIVER without an issue  ${rel(file)}:${i + 1}  — name the PAC issue that will remove it (factory §3.4)`);
    }
  });
}

// ---------- 4. baseline growth must name an issue ----------
const main = spawnSync("git", ["show", `origin/main:${BASELINE_REL}`], { cwd: ROOT, encoding: "utf8" });
if (main.status !== 0) {
  note(`no ${BASELINE_REL} on origin/main (first introduction, or origin/main not fetched) — baseline-growth check skipped`);
} else {
  const onMain = new Map(readBaseline(main.stdout, `origin/main:${BASELINE_REL}`).entries.map((e) => [e.fingerprint, e.count || 1]));
  for (const e of baseline.entries) {
    if ((e.count || 1) > (onMain.get(e.fingerprint) || 0) && !/^PAC-\d+$/.test(e.issue || "")) {
      problems++;
      console.error(`BASELINE GROWTH without an issue  ${e.fingerprint.split("|").slice(0, 2).join("  ")}  — add "issue": "PAC-NN" to the entry`);
    }
  }
}

if (problems) fail(`${problems} problem(s). Fix the design, or accept a finding by baselining it with a PAC issue.`);
console.log(`design-check: ${findings.length} finding(s), all baselined (${baseline.entries.length} fingerprint(s), impeccable@${IMPECCABLE_VERSION}).`);
