// PAC-81: must stay the first import. Zod reads `jitless` when a schema is
// constructed, and App, sentry and the generated schemas construct schemas at
// module evaluation. See src/lib/zodConfig.ts.
import "./lib/zodConfig";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
// PAC-143: the web fonts are self-hosted, so no visitor request goes to Google
// and the CSP names no font host. Exactly the faces the Google Fonts link
// declared: Inter 400/500/600/700 and Playfair Display 500/600/700, upright
// only (italic stays synthesised), every subset behind its unicode-range,
// font-display: swap. Pinned @fontsource packages (OFL-1.1, licences in
// public/fonts/). Change a weight here only together with src/fonts.test.ts.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";
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
