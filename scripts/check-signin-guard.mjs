#!/usr/bin/env node
// PAC-98 AC-13 and AC-17: Paceday has no password sign-in. This check runs in
// `make verify`, so an edit from any agent (Lovable's included) meets it in
// the same gate as everything else. It fails when:
//
//   AC-13 (routes)  any non-test file under src/ names `auth/login` or
//                   `auth/register` — any prefix, any quoting:
//                   apiFetch("/api/auth/login"), a template literal holding
//                   /api/auth/register and apiUrl("/auth/login") all fail.
//   AC-13 (inputs)  any non-test file under src/components/auth/ or a sign-in
//                   page renders an input of type `password`, or uses
//                   autoComplete `current-password` / `new-password`. The
//                   API-key fields in Settings are outside this scope and stay.
//   AC-17 (docs)    AGENTS.md or docs/lovable-prompts/00-global-context.md
//                   lacks the PAC-98 rule: one rule (a paragraph or a list
//                   item) holding both the text `PAC-98` and the word
//                   `password`.
//
// A route composed at run time from fragments (`/api/auth/${x}`) is not caught
// here; the dialog's AC-12 test catches it at run time.
//
// Before scanning the repository the check runs its own self-test: fixtures
// with each forbidden form must fail it, and clean fixtures must pass. A
// self-test failure fails the gate, so the check cannot silently go vacuous.
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|html)$/;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** The sign-in surfaces of AC-13's input rule. */
const SIGNIN_DIRS = ["src/components/auth/"];
const SIGNIN_PAGES = [
  "src/pages/SignIn.tsx",
  "src/pages/SignUp.tsx",
  "src/pages/Index.tsx",
  "src/pages/AuthCallback.tsx",
  "src/pages/Logout.tsx",
];

/** The Lovable-facing guidance files of AC-17. */
export const GUIDANCE_FILES = ["AGENTS.md", "docs/lovable-prompts/00-global-context.md"];

const ROUTE = /auth\/(login|register)\b/i;
const PASSWORD_INPUT = [
  // type="password", type={'password'}, type: "password", type={`password`}
  /\btype\s*[=:]\s*\{?\s*["'`]password["'`]/i,
  // el.setAttribute("type", "password")
  /setAttribute\(\s*["'`]type["'`]\s*,\s*["'`]password["'`]/i,
  // autoComplete="current-password" / "new-password" (any attribute spelling)
  /\b(current|new)-password\b/i,
];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const posix = (p) => p.split(sep).join("/");

function isTestFile(rel) {
  return TEST_FILE.test(rel) || rel.startsWith("src/test/");
}

function isSignInSurface(rel) {
  return SIGNIN_DIRS.some((d) => rel.startsWith(d)) || SIGNIN_PAGES.includes(rel);
}

/** Splits a markdown file into rules: paragraphs, and list items within them. */
export function rules(markdown) {
  const out = [];
  for (const para of markdown.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    let current = [];
    for (const line of para.split("\n")) {
      if (/^\s*([-*+]|\d+\.)\s+/.test(line) && current.length) {
        out.push(current.join("\n"));
        current = [];
      }
      current.push(line);
    }
    if (current.length) out.push(current.join("\n"));
  }
  return out;
}

export function hasPac98Rule(markdown) {
  return rules(markdown).some((r) => r.includes("PAC-98") && /password/i.test(r));
}

/** Scans a repository root; returns the list of violations (empty = pass). */
export function scan(root) {
  const violations = [];
  let scanned = 0;
  for (const abs of walk(join(root, "src"))) {
    const rel = posix(relative(root, abs));
    if (!SOURCE_EXT.test(rel) || isTestFile(rel)) continue;
    scanned++;
    const lines = readFileSync(abs, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (ROUTE.test(line)) {
        violations.push(`${rel}:${i + 1}: names a password route (auth/login or auth/register): ${line.trim()}`);
      }
      if (isSignInSurface(rel) && PASSWORD_INPUT.some((re) => re.test(line))) {
        violations.push(`${rel}:${i + 1}: password input or password autocomplete on a sign-in surface: ${line.trim()}`);
      }
    });
  }
  for (const rel of GUIDANCE_FILES) {
    const abs = join(root, rel);
    if (!existsSync(abs)) {
      violations.push(`${rel}: missing (it must carry the PAC-98 rule)`);
    } else if (!hasPac98Rule(readFileSync(abs, "utf8"))) {
      violations.push(`${rel}: no rule holding both "PAC-98" and "password" (provider-only sign-in, AC-17)`);
    }
  }
  return { violations, scanned };
}

/* ---------------------------------------------------------------- self-test */

const GOOD_DOC = "# Guide\n\n- Paceday sign-in is provider-only. There is no password sign-in; no password form without an owner decision (PAC-98).\n";

const CLEAN = {
  "src/components/auth/Dialog.tsx": 'apiFetch("/api/auth/detect"); <input type="email" autoComplete="email" />',
  "src/pages/SignIn.tsx": "export default function SignIn() { return null; }",
  // Outside the sign-in surfaces: an API-key field may be a password input.
  "src/pages/Settings.tsx": '<Input type="password" autoComplete="off" />',
  // Tests may name the routes (they assert they are never called).
  "src/components/auth/Dialog.test.tsx": 'expect(calls).not.toContain("/api/auth/login"); <input type="password" />',
  "AGENTS.md": GOOD_DOC,
  "docs/lovable-prompts/00-global-context.md": GOOD_DOC,
};

/** Each fixture adds one forbidden form to the clean tree and must fail. */
const FORBIDDEN = {
  "apiFetch literal": ["src/lib/x.ts", 'apiFetch("/api/auth/login", { method: "POST" });'],
  "template literal": ["src/lib/y.ts", "const u = `${base}/api/auth/register`;"],
  "apiUrl without /api": ["src/components/z.tsx", "window.location.href = apiUrl('/auth/login');"],
  "route outside the sign-in surfaces": ["src/pages/Settings.tsx", 'fetch("https://h/api/auth/register")'],
  "password input in auth": ["src/components/auth/Pw.tsx", '<Input id="pw" type="password" />'],
  "password input, braced": ["src/components/auth/Pw2.tsx", "<input type={'password'} />"],
  "password input via props object": ["src/pages/SignUp.tsx", 'createElement("input", { type: "password" })'],
  "current-password autocomplete": ["src/components/auth/Ac.tsx", '<Input autoComplete="current-password" />'],
  "new-password autocomplete on a sign-in page": ["src/pages/Index.tsx", '<input autocomplete="new-password" />'],
  "AGENTS.md without the rule": ["AGENTS.md", "# Guide\n\n- Do not invent endpoints.\n"],
  "PAC-98 and password in different rules": [
    "docs/lovable-prompts/00-global-context.md",
    "# Guide\n\n- See PAC-98.\n- No password fields.\n",
  ],
};

function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

export function selfTest() {
  const failures = [];
  const run = (files) => {
    const dir = mkdtempSync(join(tmpdir(), "signin-guard-"));
    try {
      writeTree(dir, files);
      return scan(dir).violations;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const clean = run(CLEAN);
  if (clean.length) failures.push(`clean fixture failed the check:\n    ${clean.join("\n    ")}`);
  for (const [name, [rel, content]] of Object.entries(FORBIDDEN)) {
    const files = { ...CLEAN, [rel]: rel in CLEAN && !rel.endsWith(".md") ? `${CLEAN[rel]}\n${content}` : content };
    if (run(files).length === 0) failures.push(`forbidden fixture passed the check: ${name}`);
  }
  return { failures, cases: 1 + Object.keys(FORBIDDEN).length };
}

/* --------------------------------------------------------------------- main */

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const st = selfTest();
  if (st.failures.length) {
    console.error("FAIL: signin-guard self-test (PAC-98 AC-13):");
    for (const f of st.failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`OK: signin-guard self-test (${st.cases} fixtures: 1 clean passes, ${st.cases - 1} forbidden fail)`);
  const { violations, scanned } = scan(ROOT);
  if (violations.length) {
    console.error("FAIL: Paceday has no password sign-in (PAC-98). Remove these, or get an owner decision first:");
    for (const v of violations) console.error(`  ${v}`);
    process.exit(1);
  }
  console.log(
    `OK: no password route or sign-in password input in ${scanned} non-test files under src/; PAC-98 rule present in ${GUIDANCE_FILES.join(", ")}`,
  );
}
