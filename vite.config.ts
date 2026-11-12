import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // PAC-83 (owner OQ-1 (c)): the demo exists only in non-production builds.
  // Decided when the bundle is built; no runtime input can change it.
  define: {
    __PACEDAY_DEMO_BUILD__: JSON.stringify(mode !== "production"),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    ...(process.env.VITE_BACKEND_URL
      ? {
          proxy: {
            "/api": {
              target: process.env.VITE_BACKEND_URL,
              changeOrigin: true,
            },
          },
        }
      : {}),
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
