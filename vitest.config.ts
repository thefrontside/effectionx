import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    target: "es2022",
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: [
      "**/dist/**",
      "**/node_modules/**",
      "process/test/output-stream.test.ts",
    ],
  },
});
