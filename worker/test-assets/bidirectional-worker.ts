import { workerMain } from "../worker-main.ts";

await workerMain<string, string, string, void, string, string>(function* ({
  messages,
  send,
}) {
  const fromHost = yield* send("from-worker");

  yield* messages.forEach(function* (msg) {
    return `worker-response: ${msg}`;
  });

  return `done: ${fromHost}`;
});
