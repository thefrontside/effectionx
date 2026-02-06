import { spawn } from "effection";
import { workerMain } from "../worker-main.ts";

await workerMain<string, string, string, void, string, string>(function* ({
  messages,
  send,
}) {
  // Spawn messages handler in background (it runs until worker closes)
  yield* spawn(function* () {
    yield* messages.forEach(function* (msg) {
      return `worker-response: ${msg}`;
    });
  });

  // Send request to host and get response
  const fromHost = yield* send("from-worker");

  return `done: ${fromHost}`;
});
