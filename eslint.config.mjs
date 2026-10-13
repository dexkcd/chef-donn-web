import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The domain layer is pure: no IO, no framework, no clock. Callers pass `today` in.
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["next", "next/*", "react", "react-dom"], message: "src/domain must not import framework code." },
            { group: ["@/db/*", "@/server/*", "@/lib/*", "@/app/*", "@/ui/*"], message: "src/domain must stay pure (no IO)." },
            { group: ["drizzle-orm", "drizzle-orm/*", "postgres", "node:*", "fs", "path"], message: "src/domain must stay pure (no IO)." },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: "Pass `today` in; domain code never reads the clock." },
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: "Pass `today` in; domain code never reads the clock." },
      ],
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/sw.js",
    "playwright-report/**",
    "test-results/**",
    "src/db/migrations/**",
  ]),
]);

export default eslintConfig;
