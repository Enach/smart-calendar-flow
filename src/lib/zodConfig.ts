import { z } from "zod";

// PAC-81: run Zod without its JIT.
//
// The production CSP (Enach/clockwise-like#245) has no 'unsafe-eval'. Zod 4
// compiles a fast parser for every object schema with `new Function`, and
// before that it probes `new Function("")` once. The probe's error is caught,
// but the browser still reports a script-src `securitypolicyviolation` on
// every page load (src/lib/sentry.ts parses a schema at startup).
//
// `jitless: true` skips both the probe and the compiled parser. Zod reads the
// flag when an object schema is *constructed* (not when it is parsed), so this
// module must be evaluated before any module that builds a schema: it is the
// first import of src/main.tsx, and src/test/setup.ts imports it so tests run
// the same parser as production. It imports nothing but zod.
z.config({ jitless: true });
