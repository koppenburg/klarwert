import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts", "apps/web/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts"],
    },
  },
});
