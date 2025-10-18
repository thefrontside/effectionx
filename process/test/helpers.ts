import { type Operation, type Stream, until } from "effection";
import { filter } from "@effectionx/stream-helpers";

export function* captureError(op: Operation<unknown>): Operation<Error> {
  try {
    yield* op;
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected operation to throw an error, but it did not!");
}

export function expectStreamNotEmpty(
  stream: Stream<unknown, unknown>,
): Operation<void> {
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

export function* fetchText(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const response = yield* until(globalThis.fetch(input, init));
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    return {
      status: response.status,
      text: yield* until(response.text()),
    };
  } catch (e) {
    throw new Error(`FetchError: ${(e as Error).message}`);
  }
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
  const stdout = filter<string>(function* (v) {
    return pattern.test(v);
  })(stream);

  yield* expectStreamNotEmpty(stdout);
}
