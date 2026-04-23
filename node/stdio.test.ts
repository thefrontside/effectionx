import process from "node:process";
import { PassThrough, Writable } from "node:stream";
import { describe, it } from "@effectionx/vitest";
import {
  createSignal,
  scoped,
  type Stream,
  type Subscription,
} from "effection";
import { expect } from "expect";

import { Stdio, stderr, stdin, stdout } from "./stdio.ts";

function captureWritable(): { stream: Writable; written: Uint8Array[] } {
  const written: Uint8Array[] = [];
  const stream = new Writable({
    write(chunk: Uint8Array, _enc, cb) {
      written.push(chunk);
      cb();
    },
  });
  return { stream, written };
}

function overrideStdio(
  key: "stdin" | "stdout" | "stderr",
  value: unknown,
): PropertyDescriptor {
  const original = Object.getOwnPropertyDescriptor(process, key)!;
  Object.defineProperty(process, key, { configurable: true, value });
  return original;
}

function* drain(subscription: Subscription<Uint8Array, void>) {
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let r = yield* subscription.next();
  while (!r.done) {
    chunks.push(decoder.decode(r.value));
    r = yield* subscription.next();
  }
  return chunks;
}

describe("Stdio middleware", () => {
  it("captures stdout bytes via middleware and delegates to process.stdout", function* () {
    const { stream: fakeStdout, written } = captureWritable();
    const original = overrideStdio("stdout", fakeStdout);

    try {
      const captured: Uint8Array[] = [];
      yield* Stdio.around({
        *stdout(args, next) {
          captured.push(args[0]);
          return yield* next(...args);
        },
      });

      const bytes = new TextEncoder().encode("hello\n");
      yield* stdout(bytes);

      const decoder = new TextDecoder();
      expect(captured.length).toBe(1);
      expect(decoder.decode(captured[0])).toBe("hello\n");
      expect(written.length).toBe(1);
      expect(decoder.decode(written[0])).toBe("hello\n");
    } finally {
      Object.defineProperty(process, "stdout", original);
    }
  });

  it("captures stderr bytes via middleware and delegates to process.stderr", function* () {
    const { stream: fakeStderr, written } = captureWritable();
    const original = overrideStdio("stderr", fakeStderr);

    try {
      const captured: Uint8Array[] = [];
      yield* Stdio.around({
        *stderr(args, next) {
          captured.push(args[0]);
          return yield* next(...args);
        },
      });

      const bytes = new TextEncoder().encode("oops\n");
      yield* stderr(bytes);

      const decoder = new TextDecoder();
      expect(captured.length).toBe(1);
      expect(decoder.decode(captured[0])).toBe("oops\n");
      expect(written.length).toBe(1);
      expect(decoder.decode(written[0])).toBe("oops\n");
    } finally {
      Object.defineProperty(process, "stderr", original);
    }
  });

  it("can substitute stdin with a synthetic stream and propagates completion", function* () {
    const signal = createSignal<Uint8Array, void>();
    const synthetic: Stream<Uint8Array, void> = signal;

    yield* Stdio.around({
      stdin(_args, _next) {
        return synthetic;
      },
    });

    const subscription = yield* stdin();

    const encoder = new TextEncoder();
    signal.send(encoder.encode("one"));
    signal.send(encoder.encode("two"));
    signal.close();

    const decoder = new TextDecoder();

    let result = yield* subscription.next();
    if (result.done) {
      throw new Error("expected first chunk before end-of-stream");
    }
    expect(decoder.decode(result.value)).toBe("one");

    result = yield* subscription.next();
    if (result.done) {
      throw new Error("expected second chunk before end-of-stream");
    }
    expect(decoder.decode(result.value)).toBe("two");

    result = yield* subscription.next();
    expect(result.done).toBe(true);
  });

  it("middleware is scoped and does not leak", function* () {
    const { stream: fakeStdout } = captureWritable();
    const original = overrideStdio("stdout", fakeStdout);

    try {
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
    } finally {
      Object.defineProperty(process, "stdout", original);
    }
  });
});

describe("Stdio defaults", () => {
  it("reads bytes from process.stdin by default", function* () {
    const fake = new PassThrough();
    const original = overrideStdio("stdin", fake);

    try {
      const subscription = yield* stdin();

      fake.write(Buffer.from("hello\n"));
      fake.end();

      const decoder = new TextDecoder();

      let result = yield* subscription.next();
      if (result.done) {
        throw new Error("expected a chunk before end-of-stream");
      }
      expect(decoder.decode(result.value)).toBe("hello\n");

      result = yield* subscription.next();
      expect(result.done).toBe(true);
    } finally {
      Object.defineProperty(process, "stdin", original);
    }
  });

  it("supports multiple concurrent stdin() consumers", function* () {
    const fake = new PassThrough();
    const original = overrideStdio("stdin", fake);

    try {
      const left = yield* stdin();
      const right = yield* stdin();

      fake.write(Buffer.from("one"));
      fake.write(Buffer.from("two"));
      fake.end();

      const leftChunks = yield* drain(left);
      const rightChunks = yield* drain(right);

      expect(leftChunks).toEqual(["one", "two"]);
      expect(rightChunks).toEqual(["one", "two"]);
    } finally {
      Object.defineProperty(process, "stdin", original);
    }
  });
});
