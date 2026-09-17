import { defineConfig, coverageConfigDefaults } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // The floor lives here, not in a shell pipeline that parses vitest's
      // output: `vitest run --coverage` then fails on its own, so `npm run
      // coverage`, `make coverage` and an editor run all enforce the same bar.
      // docs/factory/README.md §3 sets it at 70% for this repo.
      //
      // Lines and statements only. Branch and function floors are a separate
      // decision with a different number behind them, and inventing one here
      // would turn the factory gate into an argument about untested error paths.
      thresholds: {
        lines: 70,
        statements: 70,
      },
      exclude: [
        ...coverageConfigDefaults.exclude,
        // Generated from the OpenAPI contract and never hand-edited, so its
        // coverage measures the generator, not this repo's tests.
        "src/api/generated/**",
        "src/test/**",
      ],
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
