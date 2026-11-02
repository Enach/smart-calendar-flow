import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // src/api/generated is produced from the backend's OpenAPI contract. Linting
  // it would either fail the build on the generator's style or invite an
  // --fix that edits generated code; both are wrong. It is still typechecked
  // (npm run typecheck), which is what actually catches contract drift.
  { ignores: ["dist", "src/api/generated"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // The two classic hooks rules, named explicitly: v7's "recommended" preset
      // also turns on the React Compiler rules, which this codebase has not
      // adopted.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // PAC-83 (contract §4.2): demo code is reached only through a dynamic
    // import guarded by the literal __PACEDAY_DEMO_BUILD__ flag. A static
    // import would put the demo into the production bundle.
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/demo/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/demo", "@/demo/*", "**/src/demo", "**/src/demo/*", "../demo", "../demo/*", "../../demo", "../../demo/*", "./demo", "./demo/*"],
              message: "Demo code is reached only by import() inside `if (__PACEDAY_DEMO_BUILD__)` (PAC-83, src/api/demoGate.ts).",
            },
          ],
        },
      ],
    },
  },
);
