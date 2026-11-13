/// <reference types="vite/client" />

/**
 * PAC-83 (contract §4.1): true in every non-production build (the Vite dev
 * server — the Lovable preview —, `vite build --mode development`, vitest),
 * false in `vite build`. Use it only as a literal condition in front of a
 * dynamic `import("@/demo/…")`; see src/api/demoGate.ts.
 */
declare const __PACEDAY_DEMO_BUILD__: boolean;
