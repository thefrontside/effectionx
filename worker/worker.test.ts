import { access, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { when } from "@effectionx/converge";
import { beforeEach, describe, it } from "@effectionx/vitest";
import {
  all,
  createContext,
  type Operation,
  scoped,
  sleep,
  spawn,
  suspend,
  until,
  withResolvers,
} from "effection";
import { expect } from "expect";

import { type ForcePolicy, withForce } from "@effectionx/forceable";
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
  it("propagates a worker error through withForce", function* () {
    expect.assertions(2);
    let worker = yield* withForce(
      useWorker(import.meta.resolve("./test-assets/boom-result-worker.ts"), {
        type: "module",
        data: "boom!",
      }),
      function* () {},
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

    function* haltCPUWorker(policy: ForcePolicy): Operation<Error | undefined> {
      let state = new Int32Array(
        new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
      );
      let task = yield* spawn(function* () {
        yield* withForce(
          useWorker(import.meta.resolve("./test-assets/cpu-bound-worker.ts"), {
            type: "module",
            data: state.buffer,
          }),
          policy,
        );
        yield* suspend();
      });

      yield* when(
        function* () {
          if (Atomics.load(state, 0) !== 1) {
            throw new Error("worker has not started spinning");
          }
        },
        { timeout: 10_000 },
      );

      yield* task.halt();

      try {
        yield* task;
      } catch (error) {
        return error as Error;
      }
    }

    it("shuts down gracefully by default", function* () {
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

      yield* when(
        function* () {
          let exists = yield* until(
            access(startFile).then(
              () => true,
              () => false,
            ),
          );
          if (!exists) {
            throw new Error("worker has not started");
          }
        },
        { timeout: 10_000 },
      );

      yield* task.halt();

      expect(yield* until(readFile(endFile, "utf-8"))).toEqual(
        "goodbye cruel world!",
      );
    });

    it("cancels its force policy when graceful shutdown completes", function* () {
      let shutdownContext = createContext<string>("worker shutdown test");
      yield* shutdownContext.set("available during shutdown");

      let policyContext: string | undefined;
      let forced = false;
      let task = yield* spawn(function* () {
        yield* withForce(
          useWorker(url, {
            type: "module",
            data: {
              startFile,
              endFile,
              endText: "graceful",
            } satisfies ShutdownWorkerParams,
          }),
          function* (force) {
            policyContext = yield* shutdownContext.expect();
            yield* suspend();
            forced = true;
            force("should never happen");
          },
        );
        yield* suspend();
      });

      yield* when(
        function* () {
          let exists = yield* until(
            access(startFile).then(
              () => true,
              () => false,
            ),
          );
          if (!exists) {
            throw new Error("worker has not started");
          }
        },
        { timeout: 10_000 },
      );

      yield* task.halt();

      expect(yield* until(readFile(endFile, "utf-8"))).toEqual("graceful");
      expect(policyContext).toEqual("available during shutdown");
      expect(forced).toEqual(false);
    });

    it("forces a CPU-bound worker that cannot service the close message", function* () {
      expect.assertions(1);
      const taskError = yield* haltCPUWorker(function* (force) {
        force("cpu bound");
      });
      expect(taskError?.message).toContain("halted");
    });

    it("can force a CPU-bound worker from host health state", function* () {
      expect.assertions(2);
      const workerHealth = createContext<{
        controlChannelUnresponsive: Operation<void>;
      }>("worker health");
      const controlChannelUnresponsive = withResolvers<void>();
      yield* workerHealth.set({
        controlChannelUnresponsive: controlChannelUnresponsive.operation,
      });
      controlChannelUnresponsive.resolve();

      let observedHealth = false;
      const policy: ForcePolicy = function* (force) {
        const health = yield* workerHealth.expect();
        observedHealth = true;
        yield* health.controlChannelUnresponsive;
        force("control channel unresponsive");
      };

      const taskError = yield* haltCPUWorker(policy);

      expect(observedHealth).toEqual(true);
      expect(taskError?.message).toContain("halted");
    });

    // Documents a gap rather than a guarantee. Forcing settles the outcome as a
    // ForcedTerminationError, but an awaiter inside the halted scope is cancelled
    // before it can observe that rejection, and useWorker's own teardown swallows
    // it via settled(). So the reason reaches nobody. Whether it should escape —
    // and at the cost of masking an in-flight error — is the open question.
    it("does not surface the force reason to an awaiter", function* () {
      expect.assertions(1);
      let state = new Int32Array(
        new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
      );
      let outcome: Error | undefined;

      let task = yield* spawn(function* () {
        let worker = yield* withForce(
          useWorker(import.meta.resolve("./test-assets/cpu-bound-worker.ts"), {
            type: "module",
            data: state.buffer,
          }),
          function* (force) {
            force("event loop p99 300ms");
          },
        );
        yield* spawn(function* () {
          try {
            yield* worker;
          } catch (error) {
            outcome = error as Error;
          }
        });
        yield* suspend();
      });

      yield* when(
        function* () {
          if (Atomics.load(state, 0) !== 1) {
            throw new Error("worker has not started spinning");
          }
        },
        { timeout: 10_000 },
      );

      yield* task.halt();

      expect(outcome).toBeUndefined();
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

    it("propagates errors from host handler to worker and crashes host", function* () {
      const worker = yield* useWorker<never, never, string, void>(
        import.meta.resolve("./test-assets/error-handling-worker.ts"),
        { type: "module" },
      );

      // Host should crash after forwarding error to worker
      let hostError: Error | undefined;
      try {
        yield* worker.forEach<string, string>(function* (request) {
          if (request === "fail") {
            throw new Error("host error");
          }
          return "ok";
        });
      } catch (e) {
        hostError = e as Error;
      }

      // Verify host crashed with the original error
      expect(hostError).toBeDefined();
      expect(hostError?.message).toEqual("host error");
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

      // Yield control to allow worker to send request before forEach is set up
      // The channel implementation buffers requests, so sleep(0) is sufficient
      yield* sleep(0);

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

      const forEachStarted = withResolvers<void>();
      const allowHandlerToComplete = withResolvers<void>();

      // Start first forEach in background
      yield* spawn(function* () {
        yield* worker.forEach<string, string>(function* (_request) {
          forEachStarted.resolve();
          // Block until test signals completion (deterministic latch instead of sleep)
          yield* allowHandlerToComplete.operation;
          return "slow response";
        });
      });

      // Wait for first forEach to start handling a request
      yield* forEachStarted.operation;

      // Second forEach should throw
      try {
        yield* worker.forEach<string, string>(function* (_request) {
          return "should not be called";
        });
      } catch (e) {
        expect((e as Error).message).toEqual("forEach is already in progress");
      }

      // Allow first handler to complete so test can clean up
      allowHandlerToComplete.resolve();
    });

    it("error cause contains name, message, and stack from host", function* () {
      const worker = yield* useWorker<never, never, string, void>(
        import.meta.resolve("./test-assets/error-cause-worker.ts"),
        { type: "module" },
      );

      // Host should crash after forwarding error to worker
      let hostError: Error | undefined;
      try {
        yield* worker.forEach<string, string>(function* (_request) {
          const error = new TypeError("custom type error");
          throw error;
        });
      } catch (e) {
        hostError = e as Error;
      }

      // Verify host crashed with the original error
      expect(hostError).toBeDefined();
      expect(hostError?.name).toEqual("TypeError");
      expect(hostError?.message).toEqual("custom type error");
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
