import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@argus/core": resolve(__dirname, "../core/src/index.ts"),
      "@argus/lineage": resolve(__dirname, "../lineage/src/index.ts"),
      "@argus/specialists": resolve(__dirname, "../specialists/src/index.ts"),
      "bun:sqlite": resolve(__dirname, "src/__mocks__/bun-sqlite.ts"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
