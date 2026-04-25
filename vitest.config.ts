import { defineConfig } from "vitest/config";
import { resolve } from "path";

/**
 * Vitest configuration — Phase 0 (fix plan) TDD base.
 *
 * Phase 0 widens `coverage.include` from the original five hand-picked
 * modules to cover the whole non-UI surface (infra, domain, utils,
 * features/shape-picker, generator). `.tsx` files are excluded at this
 * phase because React/Raycast UI contract tests do not land until
 * Phase 4/6. Thresholds are relaxed to a realistic 30% baseline; each
 * subsequent phase raises them per the FIX_PLAN gate table:
 *   F0=30 → F1=35 → F2=45 → F3=55 → F4=60 → F5=65 → F6=70 → F7=80.
 *
 * `@raycast/api` is aliased to a lightweight mock so tests can exercise
 * `paths.ts` / `categoryManager.ts` without a Raycast runtime.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@raycast/api": resolve(__dirname, "tests/mocks/raycast-api.ts"),
      "@/": resolve(__dirname, "src/"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "json-summary"],
      reportsDirectory: "coverage",
      include: [
        "src/infra/**/*.ts",
        "src/domain/**/*.ts",
        "src/utils/**/*.ts",
        "src/features/shape-picker/**/*.ts",
        "src/generator/**/*.ts",
      ],
      exclude: ["**/*.d.ts", "**/*.tsx", "**/node_modules/**", "**/dist/**", "src/**/index.ts"],
      thresholds: {
        lines: 30,
        statements: 30,
        functions: 30,
        branches: 30,
      },
    },
  },
});
