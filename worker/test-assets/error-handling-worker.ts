import { workerMain } from "../worker-main.ts";

await workerMain<never, never, string, void, string, string>(function* ({
  send,
}) {
  try {
    yield* send("fail");
    return "no error";
  } catch (e) {
    return `caught: ${(e as Error).message}`;
  }
});
