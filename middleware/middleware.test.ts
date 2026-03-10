import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { type Middleware, combine } from "./mod.ts";

describe("combine", () => {
  it("passes through with empty middleware array", () => {
    const stack = combine<[string], string>([]);
    const result = stack(["hello"], (s) => s.toUpperCase());
    assert.equal(result, "HELLO");
  });

  it("applies a single middleware", () => {
    const log: string[] = [];
    const mw: Middleware<[string], string> = (args, next) => {
      log.push("before");
      const result = next(...args);
      log.push("after");
      return result;
    };
    const stack = combine([mw]);
    const result = stack(["hello"], (s) => s.toUpperCase());
    assert.equal(result, "HELLO");
    assert.deepEqual(log, ["before", "after"]);
  });

  it("composes multiple middleware left-to-right", () => {
    const log: string[] = [];

    const outer: Middleware<[string], string> = (args, next) => {
      log.push("outer-in");
      const result = next(...args);
      log.push("outer-out");
      return result;
    };

    const inner: Middleware<[string], string> = (args, next) => {
      log.push("inner-in");
      const result = next(...args);
      log.push("inner-out");
      return result;
    };

    const stack = combine([outer, inner]);
    const result = stack(["hello"], (s) => {
      log.push("core");
      return s.toUpperCase();
    });

    assert.equal(result, "HELLO");
    assert.deepEqual(log, [
      "outer-in",
      "inner-in",
      "core",
      "inner-out",
      "outer-out",
    ]);
  });

  it("allows middleware to transform arguments", () => {
    const prefix: Middleware<[string], string> = (args, next) => {
      return next(`prefix-${args[0]}`);
    };

    const stack = combine([prefix]);
    const result = stack(["hello"], (s) => s);
    assert.equal(result, "prefix-hello");
  });

  it("allows middleware to short-circuit", () => {
    let coreWasCalled = false;
    const shortCircuit: Middleware<[string], string> = (_args, _next) => {
      return "short-circuited";
    };

    const stack = combine([shortCircuit]);
    const result = stack(["hello"], (s) => {
      coreWasCalled = true;
      return s;
    });

    assert.equal(result, "short-circuited");
    assert.equal(coreWasCalled, false);
  });

  it("allows middleware to transform return value", () => {
    const upper: Middleware<[string], string> = (args, next) => {
      return next(...args).toUpperCase();
    };

    const stack = combine([upper]);
    const result = stack(["hello"], (s) => s);
    assert.equal(result, "HELLO");
  });

  it("wraps a core function when invoked with args and core", () => {
    const doubler: Middleware<[number, number], number> = (args, next) =>
      next(...args) * 2;
    const stack = combine([doubler]);
    const result = stack([3, 4], (a, b) => a + b);
    assert.equal(result, 14); // (3 + 4) * 2
  });
});
