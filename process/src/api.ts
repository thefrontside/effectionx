import { createApi } from "@effectionx/context-api";
import type { StdioApi } from "../mod.ts";

export const Stdio = createApi<StdioApi>("process:io", {
  *stdout(line) {
    process.stdout.write(line);
  },
  *stderr(line) {
    process.stderr.write(line);
  },
});
