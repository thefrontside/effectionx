import { createApi } from "@effectionx/context-api";
import type { IOApi } from "../mod.ts";

export const api = createApi<IOApi>("process:io", {
  *stdout([bytes]) {
    process.stdout.write(bytes);
  },
  *stderr([bytes]) {
    process.stderr.write(bytes);
  },
});
