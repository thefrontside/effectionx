import { expect } from "expect";
import { createContext } from "effection";
import { describe, it } from "@effectionx/bdd";
import { useEvalScope, unbox, box } from "./mod.ts";

describe("box", () => {
  it("returns Ok for successful operations", function* () {
    const result = yield* box(function* () {
      return 42;
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it("returns Err for failed operations", function* () {
    const result = yield* box(function* () {
      throw new Error("test error");
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("test error");
    }
  });
});

describe("unbox", () => {
  it("extracts value from Ok result", function* () {
    const result = yield* box(function* () {
      return "hello";
    });

    expect(unbox(result)).toBe("hello");
  });

  it("throws error from Err result", function* () {
    const result = yield* box(function* () {
      throw new Error("should throw");
    });

    expect(() => unbox(result)).toThrow("should throw");
  });
});

describe("useEvalScope", () => {
  it("can evaluate operations in a separate scope", function* () {
    const context = createContext<string>("test-context");

    const evalScope = yield* useEvalScope();

    // Context not set yet
    expect(evalScope.scope.get(context)).toBeUndefined();

    // Evaluate an operation that sets context
    const result = yield* evalScope.eval(function* () {
      yield* context.set("Hello World!");
      return "done";
    });

    // Context is now visible via scope
    expect(evalScope.scope.get(context)).toBe("Hello World!");
    expect(unbox(result)).toBe("done");
  });

  it("captures errors as Result.Err", function* () {
    const evalScope = yield* useEvalScope();

    const result = yield* evalScope.eval(function* () {
      throw new Error("boom");
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("boom");
    }
  });

  it("can evaluate multiple operations in sequence", function* () {
    const counter = createContext<number>("counter");

    const evalScope = yield* useEvalScope();

    yield* evalScope.eval(function* () {
      yield* counter.set(1);
    });

    yield* evalScope.eval(function* () {
      const current = evalScope.scope.get(counter) ?? 0;
      yield* counter.set(current + 1);
    });

    expect(evalScope.scope.get(counter)).toBe(2);
  });

  it("child scope can see parent context but setting creates own value", function* () {
    const context = createContext<string>("inherited");

    // Set context in parent scope
    yield* context.set("parent value");

    const evalScope = yield* useEvalScope();

    // Child scope CAN see parent's context (Effection context inheritance)
    expect(evalScope.scope.get(context)).toBe("parent value");

    // Set in child scope - this creates a new value in the child
    yield* evalScope.eval(function* () {
      yield* context.set("child value");
    });

    // Child now has its own value
    expect(evalScope.scope.get(context)).toBe("child value");
  });
});
