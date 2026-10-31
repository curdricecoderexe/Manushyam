import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/**", "coverage/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: { sourceType: "commonjs", ecmaVersion: 2023, globals: { ...globals.node } },
    rules: {
      // ignoreRestSiblings allows `const { secret, ...safe } = obj` to strip fields.
      "no-unused-vars": ["error", { argsIgnorePattern: "^_|^next$", caughtErrors: "none", ignoreRestSiblings: true }],
      "no-console": "warn",
      eqeqeq: "error",
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { sourceType: "module", ecmaVersion: 2023, globals: { ...globals.node } },
  },
];
