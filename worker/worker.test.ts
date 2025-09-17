import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { emptyDir, exists } from "@std/fs";
import { join } from "@std/path";
import { timebox } from "@effectionx/timebox";
import { call, run, scoped, sleep, spawn, suspend } from "effection";

import { useWorker } from "./worker.ts";
import { assert } from "@std/assert";
import type { ShutdownWorkerParams } from "./test-assets/shutdown-worker.ts";

describe("worker", () => {
  it("sends and receive messages in synchrony", async () => {
    await run(function* () {
      let worker = yield* useWorker(
        import.meta.resolve("./test-assets/echo-worker.ts"),
        { type: "module" },
      );

      let result = yield* worker.send("hello world");
      expect(result).toEqual("hello world");
    });
  });
  it("will raise an exception if an exception happens on the remote side", async () => {
    expect.assertions(1);
    let task = run(function* () {
      let worker = yield* useWorker<void, unknown, unknown, unknown>(
        import.meta.resolve("./test-assets/boom-worker.ts"),
        { type: "module" },
      );

      yield* worker.send();
    });
    await expect(task).rejects.toMatchObject({ message: "boom!" });
  });
  it("produces its return value", async () => {
    await run(function* () {
      let worker = yield* useWorker(
        import.meta.resolve("./test-assets/result-worker.ts"),
        { type: "module", data: "this is the worker result" },
      );

      expect(yield* worker).toEqual("this is the worker result");
      expect(yield* worker).toEqual("this is the worker result");
    });
  });
  it("raises an exception if the worker raises one", async () => {
    expect.assertions(1);
    let task = run(function* () {
      let worker = yield* useWorker(
        import.meta.resolve("./test-assets/boom-result-worker.ts"),
        { type: "module", data: "boom!" },
      );

      let result = yield* worker;
      expect(result).toEqual("hello world");
    });
    await expect(task).rejects.toMatchObject({ message: "boom!" });
  });
  it("shuts down gracefully", async () => {
    let dir = new URL(import.meta.resolve("./test-tmp")).pathname;
    await emptyDir(dir);
    let startFile = join(dir, "started.txt");
    let endFile = join(dir, "ended.txt");
    let url = import.meta.resolve("./test-assets/shutdown-worker.ts");
    await run(function* () {
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

      let started = yield* timebox(10_000, function* () {
        while (true) {
          yield* sleep(1);
          if (yield* call(() => exists(startFile))) {
            break;
          }
        }
      });

      assert(!started.timeout, "worker did not start after 10s");
      yield* task.halt();
    });

    expect(await exists(endFile)).toEqual(true);
    expect(await Deno.readTextFile(endFile)).toEqual("goodbye cruel world!");
  });

  it("becomes halted if you try and await its value out of scope", async () => {
    let url = import.meta.resolve("./test-assets/suspend-worker.ts");
    let task = run(function* () {
      let worker = yield* scoped(function* () {
        return yield* useWorker(url, { type: "module" });
      });
      yield* worker;
    });
    await expect(task).rejects.toMatchObject({ message: "worker terminated" });
  });

  it("supports stateful operations", async () => {
    let url = import.meta.resolve("./test-assets/counter-worker.ts");
    expect.assertions(3);

    await run(function* () {
      let worker = yield* useWorker(url, { type: "module", data: 2 });

      expect(yield* worker.send(10)).toEqual(12);

      expect(yield* worker.send(-5)).toEqual(7);

      expect(yield* worker.send(35)).toEqual(42);
    });
  });

  it.skip("crashes if there is an uncaught error in the worker", async () => {
    let crash = import.meta.resolve("./test-assets/crash-worker.ts");
    let task = run(function* () {
      let worker = yield* useWorker(crash, { name: "crash", type: "module" });
      yield* worker;
    });
    await expect(task).rejects.toMatchObject({ message: "boom!" });
  });
  it.skip("crashes if the worker module cannot be found", async () => {
    let crash = import.meta.resolve("./test-assets/non-existent-worker.ts");
    let task = run(function* () {
      let worker = yield* useWorker(crash, { name: "crash", type: "module" });
      yield* worker;
    });
    await expect(task).rejects.toMatchObject({ message: "boom!" });
  });
  it.skip("crashes if there is a message error from the main thread", async () => {
    // don't know how to reproduce this
  });

  it.skip("crashes if there is a message error from the worker thread", async () => {
    // don't know how to trigger
  });
});
