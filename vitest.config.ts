import { defineConfig } from "vitest/config";
import { resolve } from "path";

/**
 * Vitest configuration — Phase 10 TDD base.
 *
 * Coverage is scoped (`include`) to the pure, unit-testable modules the
 * refactor exposed. UI (Raycast views), PowerShell I/O adapters, and
 * generators are intentionally excluded until contract tests (Phase 11)
 * and integration fixtures are in place. The 80% thresholds apply to
 * the included set and will be extended phase-by-phase.
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
        "src/infra/powershell/escape.ts",
        "src/utils/cache.ts",
        "src/utils/categoryManager.ts",
        "src/utils/paths.ts",
        "src/utils/svgPreview.ts",
      ],
      exclude: ["**/*.d.ts", "**/node_modules/**", "**/dist/**"],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
