import { ctrlc } from "ctrlc-windows";
import type { Process } from "../src/exec.ts";
import { type Stream, until, type Operation } from "effection";
import { filter } from "@effectionx/stream-helpers";

const isWin32 = globalThis.process.platform === "win32";

export function terminate(process: Process): void {
  if (isWin32) {
    ctrlc(process.pid);
    //Terminate batch process? (Y/N)
    process.stdin.send("Y\n");
  } else {
    globalThis.process.kill(process.pid, "SIGTERM");
  }
}

// cross platform user initiated graceful shutdown request. What would
// be sent to the process by the Operating system when
// a users requests an interrupt via CTRL-C or equivalent.
export function interrupt(process: Process): void {
  if (isWin32) {
    ctrlc(process.pid);
    //Terminate batch process? (Y/N)
    process.stdin.send("Y\n");
  } else {
    globalThis.process.kill(process.pid, "SIGINT");
  }
}

export function* captureError(op: Operation<unknown>): Operation<Error> {
  try {
    yield* op;
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected operation to throw an error, but it did not!");
}

export function first(stream: Stream<unknown, unknown>): Operation<void> {
  return {
    *[Symbol.iterator]() {
      const subscription = yield* stream;
      let next = yield* subscription.next();
      if (next.done) {
        throw new Error(
          `Expected the stream to produce at least one value before closing.`,
        );
      }
    },
  };
}

export function fetch(input: RequestInfo | URL, init?: RequestInit) {
  return until(globalThis.fetch(input, init));
}

export function streamClose<TClose>(
  stream: Stream<unknown, TClose>,
): () => Operation<TClose> {
  return function* () {
    const subscription = yield* stream;
    let next = yield* subscription.next();
    while (!next.done) {
      next = yield* subscription.next();
    }
    return next.value;
  };
}

export function* expectMatch(pattern: RegExp, stream: Stream<string, unknown>) {
  yield* first(
    filter<string>(function* (v) {
      return pattern.test(v);
    })(stream),
  );
}
