import { beforeEach, describe, it } from "@effectionx/bdd";
import { timebox } from "@effectionx/timebox";
import { assert } from "@std/assert";
import { expect } from "@std/expect";
import { emptyDir, exists } from "@std/fs";
import { fromFileUrl, join } from "@std/path";
import { scoped, sleep, spawn, suspend, until } from "effection";

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
      expect(e).toMatchObject({ message: "boom!" });
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
      expect(e).toMatchObject({ message: "boom!" });
    }
  });
  describe("shutdown", () => {
    let startFile: string;
    let endFile: string;
    let url: string;

    beforeEach(function* () {
      let dir = fromFileUrl(import.meta.resolve("./test-tmp"));
      yield* until(emptyDir(dir));
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

      let started = yield* timebox(10_000, function* () {
        while (true) {
          yield* sleep(1);
          if (yield* until(exists(startFile))) {
            break;
          }
        }
      });

      assert(!started.timeout, "worker did not start after 10s");
      yield* task.halt();

      expect(yield* until(exists(endFile))).toEqual(true);
      expect(yield* until(Deno.readTextFile(endFile))).toEqual(
        "goodbye cruel world!",
      );
    });
  });

  it(
    "becomes halted if you try and await its value out of scope",
    function* () {
      let url = import.meta.resolve("./test-assets/suspend-worker.ts");
      let worker = yield* scoped(function* () {
        return yield* useWorker(url, { type: "module" });
      });
      try {
        yield* worker;
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e).toMatchObject({ message: "worker terminated" });
      }
    },
  );

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
});
