import { describe, it } from "@effectionx/vitest";
import { createSignal, each, scoped, type Stream } from "effection";
import { expect } from "expect";

import { Stdio, stderr, stdin, stdout } from "./stdio.ts";

describe("Stdio middleware", () => {
  it("captures stdout bytes via middleware", function* () {
    const captured: Uint8Array[] = [];

    yield* Stdio.around({
      *stdout(args, next) {
        captured.push(args[0]);
        return yield* next(...args);
      },
    });

    const bytes = new TextEncoder().encode("hello\n");
    yield* stdout(bytes);

    expect(captured.length).toBe(1);
    expect(new TextDecoder().decode(captured[0])).toBe("hello\n");
  });

  it("captures stderr bytes via middleware", function* () {
    const captured: Uint8Array[] = [];

    yield* Stdio.around({
      *stderr(args, next) {
        captured.push(args[0]);
        return yield* next(...args);
      },
    });

    const bytes = new TextEncoder().encode("oops\n");
    yield* stderr(bytes);

    expect(captured.length).toBe(1);
    expect(new TextDecoder().decode(captured[0])).toBe("oops\n");
  });

  it("can substitute stdin with a synthetic stream", function* () {
    const signal = createSignal<Uint8Array, void>();
    const synthetic: Stream<Uint8Array, void> = signal;

    yield* Stdio.around({
      *stdin(_args, _next) {
        return synthetic;
      },
    });

    const stream = yield* stdin();
    const subscription = yield* stream;

    const encoder = new TextEncoder();
    signal.send(encoder.encode("one"));
    signal.send(encoder.encode("two"));
    signal.close();

    const chunks: string[] = [];
    const decoder = new TextDecoder();
    let result = yield* subscription.next();
    while (!result.done) {
      chunks.push(decoder.decode(result.value));
      result = yield* subscription.next();
    }

    expect(chunks).toEqual(["one", "two"]);
  });

  it("middleware is scoped and does not leak", function* () {
    const outerCalls: string[] = [];

    yield* Stdio.around({
      *stdout(args, next) {
        outerCalls.push("outer");
        return yield* next(...args);
      },
    });

    const bytes = new TextEncoder().encode("hi\n");
    yield* stdout(bytes);
    expect(outerCalls).toEqual(["outer"]);

    yield* scoped(function* () {
      const innerCalls: string[] = [];

      yield* Stdio.around({
        *stdout(args, next) {
          innerCalls.push("inner");
          return yield* next(...args);
        },
      });

      yield* stdout(bytes);
      expect(outerCalls).toEqual(["outer", "outer"]);
      expect(innerCalls).toEqual(["inner"]);
    });

    outerCalls.length = 0;
    yield* stdout(bytes);
    expect(outerCalls).toEqual(["outer"]);
  });
});

describe("Stdio defaults", () => {
  it("reads from process.stdin by default (subscription acquires without error)", function* () {
    yield* scoped(function* () {
      // Default handler wraps process.stdin via fromReadable. We just
      // verify that acquiring a subscription and then letting the scope
      // tear it down does not throw; we can't easily assert on real
      // host stdin bytes in a unit test.
      const stream = yield* stdin();
      const _sub = yield* stream;
      expect(true).toBe(true);
    });
  });
});
