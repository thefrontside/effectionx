import { workerMain } from "../worker-main.ts";

await workerMain(function* ({ messages }) {
  yield* messages.forEach(function* (message) {
    return message;
  });
});
