import { workerMain } from "../worker-main.ts";

await workerMain(function* ({ data }) {
  throw new Error(String(data));
});
