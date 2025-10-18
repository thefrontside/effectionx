import { workerMain } from "../worker-main.ts";

await workerMain(function* ({ data }) {
  return data;
});
