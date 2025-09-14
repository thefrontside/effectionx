import { expect } from "@std/expect";
import { run, spawn } from "effection";
import { describe, it } from "@std/testing/bdd";
import { EventEmitter } from "node:events";

import { once } from "../src/eventemitter.ts";

describe("once", () => {
  it("resolves with single argument as array", async () => {
    expect.assertions(1);
    await run(function* () {
      const emitter = new EventEmitter();

      let result;
      yield* spawn(function* () {
        result = yield* once<[string]>(emitter, "test");
      });

      emitter.emit("test", "hello");

      expect(result).toEqual(["hello"]);
    });
  });

  it("resolves with multiple arguments as array", async () => {
    expect.assertions(1);
    await run(function* () {
      const emitter = new EventEmitter();

      let result;

      yield* spawn(function* () {
        result = yield* once<[number, string]>(emitter, "exit");
      });

      emitter.emit("exit", 42, "SIGTERM");

      expect(result).toEqual([42, "SIGTERM"]);
    });
  });

  it("only resolves once even with multiple emissions", async () => {
    await run(function* () {
      const emitter = new EventEmitter();

      let first;
      yield* spawn(function* () {
        first = yield* once<[string]>(emitter, "data");
      });

      emitter.emit("data", "first");
      emitter.emit("data", "second");

      expect(first).toEqual(["first"]);
    });
  });

  it("removes listener after resolving", async () => {
    expect.assertions(2);
    await run(function* () {
      const emitter = new EventEmitter();

      yield* spawn(function* () {
        yield* once<[string]>(emitter, "test");
      });

      expect(emitter.listenerCount("test")).toBe(1);

      emitter.emit("test", "hello");

      expect(emitter.listenerCount("test")).toBe(0);
    });
  });
});
