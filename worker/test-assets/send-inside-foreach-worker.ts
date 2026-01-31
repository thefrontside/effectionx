import { workerMain } from "../worker-main.ts";

// Worker that calls send() from inside messages.forEach handler
await workerMain<string, string, string, void, string, string>(function* ({
  messages,
  send,
}) {
  let lastResponse = "";

  yield* messages.forEach(function* (msg) {
    // Call send() to host while handling a message from host
    const hostResponse = yield* send(`worker-request-for: ${msg}`);
    lastResponse = hostResponse;
    return `processed: ${msg} with ${hostResponse}`;
  });

  return `final: ${lastResponse}`;
});
