import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    target: "es2022",
  },
  test: {
    hookTimeout: 30000,
    include: ["**/*.test.ts"],
    exclude: ["**/dist/**", "**/node_modules/**", "**/bdd/**", "**/inline/**"],
    reporters:
      process.env.GITHUB_ACTIONS === "true"
        ? ["default", "github-actions"]
        : ["default"],
  },
});
