import { expect } from "@std/expect";
import { run, spawn } from "effection";
import { describe, it } from "@std/testing/bdd";
import { EventEmitter } from "node:events";

import { onceEmit } from "../src/eventemitter.ts";

describe("onceEmit", () => {
  it("resolves with single argument as array", async () => {
    expect.assertions(1);
    await run(function*() {
      const emitter = new EventEmitter();
      
      let result;
      yield* spawn(function*() {
        result = yield* onceEmit<[string]>(emitter, 'test')
      });
      
      emitter.emit('test', 'hello');
      
      expect(result).toEqual(['hello']);
    });
  });

  it("resolves with multiple arguments as array", async () => {
    expect.assertions(1);
    await run(function*() {
      const emitter = new EventEmitter();

      let result;

      yield* spawn(function*() {
        result = yield* onceEmit<[number, string]>(emitter, 'exit')
      });
      
      emitter.emit('exit', 42, 'SIGTERM');
      
      expect(result).toEqual([42, 'SIGTERM']);
    });
  });

  it("only resolves once even with multiple emissions", async () => {
    await run(function*() {
      const emitter = new EventEmitter();
      
      let first;
      yield* spawn(function*() {
        first = yield* onceEmit<[string]>(emitter, 'data');
      });
      
      emitter.emit('data', 'first');
      emitter.emit('data', 'second');
      
      expect(first).toEqual(['first']);
    });
  });

  it("removes listener after resolving", async () => {
    expect.assertions(2);
    await run(function*() {
      const emitter = new EventEmitter();
      
      yield* spawn(function*() {
        yield* onceEmit<[string]>(emitter, 'test');
      });
      
      expect(emitter.listenerCount('test')).toBe(1);
      
      emitter.emit('test', 'hello');
      
      expect(emitter.listenerCount('test')).toBe(0);
    });
  });
});