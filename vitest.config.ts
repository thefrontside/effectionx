import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    target: "es2022",
  },
  test: {
    hookTimeout: 30000,
    include: ["**/*.test.ts"],
    exclude: ["**/dist/**", "**/node_modules/**"],
  },
});
