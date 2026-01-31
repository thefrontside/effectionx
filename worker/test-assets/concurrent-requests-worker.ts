import { all } from "effection";
import { workerMain } from "../worker-main.ts";

await workerMain<never, never, number[], void, number, number>(function* ({
  send,
}) {
  const results = yield* all([send(3), send(2), send(1)]);
  return results;
});
