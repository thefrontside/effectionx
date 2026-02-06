import { workerMain } from "../worker-main.ts";

await workerMain<never, never, string, void, string, string>(function* ({
  send,
}) {
  const response = yield* send("hello");
  return `received: ${response}`;
});
