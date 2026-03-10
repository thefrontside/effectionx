import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { type Middleware, combine, createMiddlewareStack } from "./mod.ts";

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
});

describe("createMiddlewareStack", () => {
  it("composes middleware around a core function", () => {
    const stack = createMiddlewareStack<[number, number], number>();

    stack.use((args, next) => next(...args) * 2);

    const fn = stack.compose((a, b) => a + b);
    assert.equal(fn(3, 4), 14); // (3 + 4) * 2
  });

  it("defaults to max (outermost) priority", () => {
    const log: string[] = [];
    const stack = createMiddlewareStack<[string], string>();

    stack.use((args, next) => {
      log.push("first");
      return next(...args);
    });
    stack.use((args, next) => {
      log.push("second");
      return next(...args);
    });

    stack.compose((s) => s)("hello");
    assert.deepEqual(log, ["first", "second"]);
  });

  it("min middleware runs after max, just before core", () => {
    const log: string[] = [];
    const stack = createMiddlewareStack<[], string>();

    stack.use((_args, next) => {
      log.push("max");
      return next();
    });

    stack.use(
      (_args, next) => {
        log.push("min");
        return next();
      },
      { at: "min" },
    );

    stack.compose(() => {
      log.push("core");
      return "done";
    })();

    assert.deepEqual(log, ["max", "min", "core"]);
  });

  it("preserves insertion order within max", () => {
    const log: string[] = [];
    const stack = createMiddlewareStack<[], void>();

    stack.use((_args, next) => {
      log.push("max-1");
      return next();
    });
    stack.use((_args, next) => {
      log.push("max-2");
      return next();
    });
    stack.use((_args, next) => {
      log.push("max-3");
      return next();
    });

    stack.compose(() => {
      log.push("core");
    })();
    assert.deepEqual(log, ["max-1", "max-2", "max-3", "core"]);
  });

  it("preserves insertion order within min", () => {
    const log: string[] = [];
    const stack = createMiddlewareStack<[], void>();

    stack.use(
      (_args, next) => {
        log.push("min-1");
        return next();
      },
      { at: "min" },
    );
    stack.use(
      (_args, next) => {
        log.push("min-2");
        return next();
      },
      { at: "min" },
    );
    stack.use(
      (_args, next) => {
        log.push("min-3");
        return next();
      },
      { at: "min" },
    );

    stack.compose(() => {
      log.push("core");
    })();
    assert.deepEqual(log, ["min-1", "min-2", "min-3", "core"]);
  });

  it("full ordering: max then min then core regardless of insertion order", () => {
    const log: string[] = [];
    const stack = createMiddlewareStack<[], void>();

    stack.use((_args, next) => {
      log.push("max-1");
      return next();
    });
    stack.use(
      (_args, next) => {
        log.push("min-1");
        return next();
      },
      { at: "min" },
    );
    stack.use((_args, next) => {
      log.push("max-2");
      return next();
    });
    stack.use(
      (_args, next) => {
        log.push("min-2");
        return next();
      },
      { at: "min" },
    );

    stack.compose(() => {
      log.push("core");
    })();
    assert.deepEqual(log, ["max-1", "max-2", "min-1", "min-2", "core"]);
  });

  it("compose reflects current state of the stack", () => {
    const log: string[] = [];
    const stack = createMiddlewareStack<[], string>();

    stack.use((_args, next) => {
      log.push("first");
      return next();
    });

    const fn1 = stack.compose(() => "done");
    fn1();
    assert.deepEqual(log, ["first"]);

    log.length = 0;
    stack.use((_args, next) => {
      log.push("second");
      return next();
    });

    const fn2 = stack.compose(() => "done");
    fn2();
    assert.deepEqual(log, ["first", "second"]);
  });

  it("works with no middleware", () => {
    const stack = createMiddlewareStack<[number], number>();
    const fn = stack.compose((n) => n * 2);
    assert.equal(fn(5), 10);
  });
});
