import { createApi } from "@effectionx/context-api";
import type { StdioApi } from "../mod.ts";

export const Stdio = createApi<StdioApi>("process:io", {
  *stdout(b) {
    process.stdout.write(b);
  },
  *stderr(b) {
    process.stderr.write(b);
  },
});
