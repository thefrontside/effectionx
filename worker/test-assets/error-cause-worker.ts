import { workerMain } from "../worker-main.ts";

await workerMain<never, never, string, void, string, string>(function* ({
  send,
}) {
  try {
    yield* send("trigger-error");
    return "no error";
  } catch (e) {
    const error = e as Error & { cause?: unknown };
    const cause = error.cause as
      | { name: string; message: string; stack?: string }
      | undefined;
    if (cause?.name && cause.message) {
      return `caught error with cause: ${cause.name} - ${cause.message}`;
    }
    return `caught error without proper cause: ${error.message}`;
  }
});
