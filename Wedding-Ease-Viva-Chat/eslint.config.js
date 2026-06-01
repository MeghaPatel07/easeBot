import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // functions/ has its own toolchain (own package.json/tsconfig and a
  // mismatched @typescript-eslint version). Linting it from the root crashes
  // eslint 9.x (no-unused-expressions: "allowShortCircuit" undefined), so the
  // root lint is scoped to the app source and never descends into functions/.
  { ignores: ["dist", "functions"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      // typescript-eslint 8.11 + eslint 9.39 mismatch: this rule reads
      // options[0].allowShortCircuit before eslint applies its schema defaults
      // and throws on the first linted file, crashing the whole run. Disable it
      // until the toolchain versions are realigned (out of scope here).
      "@typescript-eslint/no-unused-expressions": "off",
    },
  }
);
