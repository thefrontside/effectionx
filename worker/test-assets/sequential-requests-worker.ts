import { workerMain } from "../worker-main.ts";

await workerMain<never, never, number, void, string, number>(function* ({
  send,
}) {
  const a = yield* send("first");
  const b = yield* send("second");
  const c = yield* send("third");
  return c;
});
