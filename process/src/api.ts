import { createApi } from "@effectionx/context-api";
import type { IOApi } from "../mod.ts";

export const stdioApi = createApi<IOApi>("process:io", {
  *stdout(b) {
    process.stdout.write(b);
  },
  *stderr(b) {
    process.stderr.write(b);
  },
});
