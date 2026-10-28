// PAC-81: must stay the first import. Zod reads `jitless` when a schema is
// constructed, and App, sentry and the generated schemas construct schemas at
// module evaluation. See src/lib/zodConfig.ts.
import "./lib/zodConfig";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSentry } from "./lib/sentry";
import { SentryErrorBoundary } from "./components/SentryErrorBoundary";

// PAC-14 §4: initialize Sentry once, before the React tree mounts.
initSentry();

createRoot(document.getElementById("root")!).render(
  <SentryErrorBoundary>
    <App />
  </SentryErrorBoundary>,
);
