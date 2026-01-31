import { workerMain } from "../worker-main.ts";

await workerMain<string, string, void, void, never, never>(function* ({
  messages,
}) {
  yield* messages.forEach(function* (_msg) {
    throw new RangeError("worker range error");
  });
});
