import { workerMain } from "../worker-main.ts";

await workerMain<never, never, string, void, string, string>(function* () {
  return "done without requests";
});
