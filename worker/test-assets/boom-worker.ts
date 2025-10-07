import { workerMain } from "../worker-main.ts";

await workerMain(function* ({ messages }) {
  yield* messages.forEach(function* () {
    throw new Error("boom!");
  });
});
