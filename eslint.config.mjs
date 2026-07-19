import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-plugin-react-hooks@7 (React Compiler era) ships several very
    // strict rules this codebase predates. The flagged patterns are
    // intentional and correct here, so they must not fail the build:
    //  - set-state-in-effect / refs: client-only initialisation (reading
    //    localStorage via loadPlayer(), etc.) is deferred to a mount effect on
    //    purpose, to avoid SSR hydration mismatches — the standard pattern.
    //  - purity: Math.random()/Date.now() are used for cosmetic/demo values
    //    (confetti, sample fixtures), not for anything that must be pure.
    // exhaustive-deps stays on as a warning (its conventional level).
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/exhaustive-deps": "warn",
      // Intentional pragmatic `any` in convex/adapter glue (ctx handlers,
      // loosely-typed TxLINE wire shapes). Keep visible as a warning rather
      // than failing the build.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
