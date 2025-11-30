import { expect } from "expect";
import { spawn, withResolvers } from "effection";
import { describe, it } from "@effectionx/bdd";
import { EventEmitter } from "node:events";

import { once } from "../src/eventemitter.ts";

describe("once", () => {
  it("resolves with single argument as array", function* () {
    expect.assertions(1);
    const emitter = new EventEmitter();
    const { resolve, operation } = withResolvers<[string]>();

    yield* spawn(function* () {
      resolve(yield* once<[string]>(emitter, "test"));
    });

    yield* spawn(function* () {
      emitter.emit("test", "hello");
    });

    expect(yield* operation).toEqual(["hello"]);
  });

  it("resolves with multiple arguments as array", function* () {
    expect.assertions(1);
    const emitter = new EventEmitter();

    let { resolve, operation } = withResolvers<[number, string]>();

    yield* spawn(function* () {
      resolve(yield* once<[number, string]>(emitter, "exit"));
    });

    yield* spawn(function* () {
      emitter.emit("exit", 42, "SIGTERM");
    });

    expect(yield* operation).toEqual([42, "SIGTERM"]);
  });

  it("only resolves once even with multiple emissions", function* () {
    const emitter = new EventEmitter();

    const { resolve, operation } = withResolvers<void>();
    let results: string[][] = [];

    yield* spawn(function* () {
      results.push(yield* once<[string]>(emitter, "data"));
      resolve();
    });

    yield* spawn(function* () {
      emitter.emit("data", "first");
      emitter.emit("data", "second");
    });

    yield* operation;

    expect(results).toEqual([["first"]]);
  });

  it("removes listener after resolving", function* () {
    expect.assertions(2);
    const emitter = new EventEmitter();

    const { resolve, operation } = withResolvers<void>();

    yield* spawn(function* () {
      yield* once<[string]>(emitter, "test");
      resolve();
    });

    yield* spawn(function* () {
      expect(emitter.listenerCount("test")).toBe(1);
      emitter.emit("test", "hello");
    });

    yield* operation;
    expect(emitter.listenerCount("test")).toBe(0);
  });
});
