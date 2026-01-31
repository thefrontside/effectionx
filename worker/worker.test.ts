import { access, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, it } from "@effectionx/bdd";
import { when } from "@effectionx/converge";
import { all, scoped, sleep, spawn, suspend, until } from "effection";
import { expect } from "expect";

import type { ShutdownWorkerParams } from "./test-assets/shutdown-worker.ts";
import { useWorker } from "./worker.ts";

describe("worker", () => {
  it("sends and receive messages in synchrony", function* () {
    expect.assertions(1);
    let worker = yield* useWorker(
      import.meta.resolve("./test-assets/echo-worker.ts"),
      { type: "module" },
    );

    let result = yield* worker.send("hello world");
    expect(result).toEqual("hello world");
  });
  it("will raise an exception if an exception happens on the remote side", function* () {
    expect.assertions(2);
    let worker = yield* useWorker<void, unknown, unknown, unknown>(
      import.meta.resolve("./test-assets/boom-worker.ts"),
      { type: "module" },
    );

    try {
      yield* worker.send();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toContain("boom!");
    }
  });
  it("produces its return value", function* () {
    expect.assertions(2);
    let worker = yield* useWorker(
      import.meta.resolve("./test-assets/result-worker.ts"),
      { type: "module", data: "this is the worker result" },
    );

    expect(yield* worker).toEqual("this is the worker result");
    expect(yield* worker).toEqual("this is the worker result");
  });
  it("raises an exception if the worker raises one", function* () {
    expect.assertions(2);
    let worker = yield* useWorker(
      import.meta.resolve("./test-assets/boom-result-worker.ts"),
      { type: "module", data: "boom!" },
    );

    try {
      yield* worker;
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toContain("boom!");
    }
  });
  describe("shutdown", () => {
    let startFile: string;
    let endFile: string;
    let url: string;

    beforeEach(function* () {
      let dir = fileURLToPath(import.meta.resolve("./test-tmp"));
      yield* until(
        rm(dir, { recursive: true, force: true }).then(() =>
          mkdir(dir, { recursive: true }),
        ),
      );
      startFile = join(dir, "started.txt");
      endFile = join(dir, "ended.txt");
      url = import.meta.resolve("./test-assets/shutdown-worker.ts");
    });

    it("shuts down gracefully", function* () {
      let task = yield* spawn(function* () {
        yield* useWorker(url, {
          type: "module",
          data: {
            startFile,
            endFile,
            endText: "goodbye cruel world!",
          } satisfies ShutdownWorkerParams,
        });
        yield* suspend();
      });

      // Wait for worker to start
      yield* when(
        function* () {
          let exists = yield* until(
            access(startFile).then(
              () => true,
              () => false,
            ),
          );
          if (!exists) throw new Error("start file not found");
          return true;
        },
        { timeout: 10_000 },
      );

      yield* task.halt();

      // Wait for the end file to be written with expected content
      let { value: content } = yield* when(
        function* () {
          let text = yield* until(readFile(endFile, "utf-8").catch(() => ""));
          if (text !== "goodbye cruel world!") {
            throw new Error(`expected "goodbye cruel world!", got "${text}"`);
          }
          return text;
        },
        { timeout: 500 },
      );

      expect(content).toEqual("goodbye cruel world!");
    });
  });

  it("becomes halted if you try and await its value out of scope", function* () {
    let url = import.meta.resolve("./test-assets/suspend-worker.ts");
    let worker = yield* scoped(function* () {
      return yield* useWorker(url, { type: "module" });
    });
    try {
      yield* worker;
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toContain("worker terminated");
    }
  });

  it("supports stateful operations", function* () {
    expect.assertions(3);

    let url = import.meta.resolve("./test-assets/counter-worker.ts");

    let worker = yield* useWorker(url, { type: "module", data: 2 });

    expect(yield* worker.send(10)).toEqual(12);

    expect(yield* worker.send(-5)).toEqual(7);

    expect(yield* worker.send(35)).toEqual(42);
  });

  it.skip("crashes if there is an uncaught error in the worker", function* () {
    let crash = import.meta.resolve("./test-assets/crash-worker.ts");
    let worker = yield* useWorker(crash, { name: "crash", type: "module" });
    try {
      yield* worker;
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toMatchObject({ message: "boom!" });
    }
  });

  it.skip("crashes if the worker module cannot be found", function* () {
    let crash = import.meta.resolve("./test-assets/non-existent-worker.ts");
    let worker = yield* useWorker(crash, { name: "crash", type: "module" });
    try {
      yield* worker;
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toMatchObject({ message: "boom!" });
    }
  });
  it.skip("crashes if there is a message error from the main thread", function* () {
    // don't know how to reproduce this
  });

  it.skip("crashes if there is a message error from the worker thread", function* () {
    // don't know how to trigger
  });

  describe("worker-initiated requests", () => {
    it("handles a single request from worker", function* () {
      const worker = yield* useWorker<never, never, string, void>(
        import.meta.resolve("./test-assets/single-request-worker.ts"),
        { type: "module" },
      );

      const result = yield* worker.forEach<string, string>(function* (request) {
        return `echo: ${request}`;
      });

      expect(result).toEqual("received: echo: hello");
    });

    it("handles multiple sequential requests from worker", function* () {
      const worker = yield* useWorker<never, never, number, void>(
        import.meta.resolve("./test-assets/sequential-requests-worker.ts"),
        { type: "module" },
      );

      let counter = 0;
      const result = yield* worker.forEach<string, number>(
        function* (_request) {
          counter += 1;
          return counter;
        },
      );

      expect(result).toEqual(3);
    });

    it("propagates errors from host handler to worker", function* () {
      const worker = yield* useWorker<never, never, string, void>(
        import.meta.resolve("./test-assets/error-handling-worker.ts"),
        { type: "module" },
      );

      const result = yield* worker.forEach<string, string>(function* (request) {
        if (request === "fail") {
          throw new Error("host error");
        }
        return "ok";
      });

      expect(result).toEqual("caught: Host handler failed: host error");
    });

    it("handles concurrent requests from worker", function* () {
      const worker = yield* useWorker<never, never, number[], void>(
        import.meta.resolve("./test-assets/concurrent-requests-worker.ts"),
        { type: "module" },
      );

      const result = yield* worker.forEach<number, number>(function* (request) {
        yield* sleep(request * 10);
        return request * 2;
      });

      expect(result).toEqual([6, 4, 2]);
    });

    it("supports bidirectional communication", function* () {
      const worker = yield* useWorker<string, string, string, void>(
        import.meta.resolve("./test-assets/bidirectional-worker.ts"),
        { type: "module" },
      );

      yield* spawn(function* () {
        yield* worker.forEach<string, string>(function* (request) {
          return `host-response: ${request}`;
        });
      });

      const hostResult = yield* worker.send("from-host");
      expect(hostResult).toEqual("worker-response: from-host");

      const finalResult = yield* worker;
      expect(finalResult).toEqual("done: host-response: from-worker");
    });

    it("existing workers without send still work", function* () {
      const worker = yield* useWorker(
        import.meta.resolve("./test-assets/echo-worker.ts"),
        { type: "module" },
      );

      const result = yield* worker.send("hello world");
      expect(result).toEqual("hello world");
    });

    it("forEach completes with result when worker sends no requests", function* () {
      const worker = yield* useWorker<never, never, string, void>(
        import.meta.resolve("./test-assets/no-requests-worker.ts"),
        { type: "module" },
      );

      let handlerCalled = false;
      const result = yield* worker.forEach<string, string>(
        function* (_request) {
          handlerCalled = true;
          return "response";
        },
      );

      expect(result).toEqual("done without requests");
      expect(handlerCalled).toBe(false);
    });

    it("yield worker after forEach returns same result", function* () {
      const worker = yield* useWorker<never, never, string, void>(
        import.meta.resolve("./test-assets/single-request-worker.ts"),
        { type: "module" },
      );

      const result1 = yield* worker.forEach<string, string>(
        function* (request) {
          return `echo: ${request}`;
        },
      );

      const result2 = yield* worker;

      expect(result1).toEqual("received: echo: hello");
      expect(result2).toEqual("received: echo: hello");
    });

    it("yield forEach after worker returns cached result", function* () {
      const worker = yield* useWorker<never, never, string, void>(
        import.meta.resolve("./test-assets/no-requests-worker.ts"),
        { type: "module" },
      );

      const result1 = yield* worker;

      let handlerCalled = false;
      const result2 = yield* worker.forEach<string, string>(
        function* (_request) {
          handlerCalled = true;
          return "response";
        },
      );

      expect(result1).toEqual("done without requests");
      expect(result2).toEqual("done without requests");
      expect(handlerCalled).toBe(false);
    });

    it("yield worker multiple times returns same result", function* () {
      const worker = yield* useWorker<never, never, string, void>(
        import.meta.resolve("./test-assets/no-requests-worker.ts"),
        { type: "module" },
      );

      const result1 = yield* worker;
      const result2 = yield* worker;
      const result3 = yield* worker;

      expect(result1).toEqual("done without requests");
      expect(result2).toEqual("done without requests");
      expect(result3).toEqual("done without requests");
    });

    it("queues requests sent before forEach is called", function* () {
      const worker = yield* useWorker<never, never, string, void>(
        import.meta.resolve("./test-assets/single-request-worker.ts"),
        { type: "module" },
      );

      // Small delay to ensure worker sends request before forEach is set up
      yield* sleep(10);

      const result = yield* worker.forEach<string, string>(function* (request) {
        return `echo: ${request}`;
      });

      expect(result).toEqual("received: echo: hello");
    });

    it("throws error when forEach is called concurrently", function* () {
      expect.assertions(1);
      const worker = yield* useWorker<never, never, string, void>(
        import.meta.resolve("./test-assets/slow-request-worker.ts"),
        { type: "module" },
      );

      // Start first forEach in background
      yield* spawn(function* () {
        yield* worker.forEach<string, string>(function* (_request) {
          yield* sleep(100); // Slow handler
          return "slow response";
        });
      });

      // Give first forEach time to start
      yield* sleep(10);

      // Second forEach should throw
      try {
        yield* worker.forEach<string, string>(function* (_request) {
          return "should not be called";
        });
      } catch (e) {
        expect((e as Error).message).toEqual("forEach is already in progress");
      }
    });

    it("error cause contains name, message, and stack from host", function* () {
      const worker = yield* useWorker<never, never, string, void>(
        import.meta.resolve("./test-assets/error-cause-worker.ts"),
        { type: "module" },
      );

      const result = yield* worker.forEach<string, string>(
        function* (_request) {
          const error = new TypeError("custom type error");
          throw error;
        },
      );

      expect(result).toMatch(/caught error with cause/);
      expect(result).toContain("TypeError");
      expect(result).toContain("custom type error");
    });

    it("error cause contains name, message, and stack from worker", function* () {
      expect.assertions(4);
      const worker = yield* useWorker<string, string, void, void>(
        import.meta.resolve("./test-assets/error-throw-worker.ts"),
        { type: "module" },
      );

      try {
        yield* worker.send("trigger-error");
      } catch (e) {
        const error = e as Error & { cause?: unknown };
        expect(error.message).toContain("Worker handler failed");
        expect(error.cause).toBeDefined();
        const cause = error.cause as {
          name: string;
          message: string;
          stack?: string;
        };
        expect(cause.name).toEqual("RangeError");
        expect(cause.message).toEqual("worker range error");
      }
    });

    it("worker can call send inside messages.forEach handler", function* () {
      const worker = yield* useWorker<string, string, string, void>(
        import.meta.resolve("./test-assets/send-inside-foreach-worker.ts"),
        { type: "module" },
      );

      // Handle worker-initiated requests
      yield* spawn(function* () {
        yield* worker.forEach<string, string>(function* (request) {
          return `host-handled: ${request}`;
        });
      });

      // Send message to worker, which triggers it to call send() back to host
      const result = yield* worker.send("trigger");
      expect(result).toEqual(
        "processed: trigger with host-handled: worker-request-for: trigger",
      );
    });
  });
});
