import { describe, it } from "@effectionx/bdd";
import { type Operation, scoped, spawn } from "effection";
import { expect } from "expect";

import { ProcessApi, exec } from "../mod.ts";

describe("ProcessApi middleware", () => {
  it("can intercept process creation with logging", function* () {
    let commands: string[] = [];

    yield* ProcessApi.around({
      *exec(args, next) {
        let [cmd] = args;
        commands.push(cmd);
        return yield* next(...args);
      },
    });

    yield* exec("node", {
      arguments: ["-e", "console.log('hello')"],
    }).join();

    yield* exec("node", {
      arguments: ["-e", "console.log('world')"],
    }).join();

    expect(commands).toEqual(["node", "node"]);
  });

  it("middleware is scoped and does not leak", function* () {
    let outerCalls: string[] = [];

    yield* ProcessApi.around({
      *exec(args, next) {
        outerCalls.push("outer");
        return yield* next(...args);
      },
    });

    yield* exec("node", {
      arguments: ["-e", "console.log('before')"],
    }).join();

    expect(outerCalls).toEqual(["outer"]);

    yield* scoped(function* () {
      let innerCalls: string[] = [];

      yield* ProcessApi.around({
        *exec(args, next) {
          innerCalls.push("inner");
          return yield* next(...args);
        },
      });

      yield* exec("node", {
        arguments: ["-e", "console.log('inner')"],
      }).join();

      // inner scope hits both outer and inner middleware
      expect(outerCalls).toEqual(["outer", "outer"]);
      expect(innerCalls).toEqual(["inner"]);
    });

    // after child scope exits, inner middleware is gone
    outerCalls.length = 0;
    yield* exec("node", {
      arguments: ["-e", "console.log('after')"],
    }).join();

    expect(outerCalls).toEqual(["outer"]);
  });

  it("can mock process creation", function* () {
    yield* ProcessApi.around({
      *exec(_args, _next): Operation<any> {
        // Return a fake process without spawning anything
        return {
          pid: 42,
          stdout: { *[Symbol.iterator]() { return { done: true, value: void 0 }; } },
          stderr: { *[Symbol.iterator]() { return { done: true, value: void 0 }; } },
          stdin: { send() {} },
          *join() { return { code: 0 }; },
          *expect() { return { code: 0 }; },
        };
      },
    });

    let process = yield* exec("anything");
    expect(process.pid).toBe(42);
  });
});
