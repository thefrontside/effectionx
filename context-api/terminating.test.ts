import { createApi } from "@effectionx/context-api";
import { describe, it } from "@effectionx/vitest";
import {
  type Operation,
  scoped,
  spawn,
  suspend,
  withResolvers,
} from "effection";
import { expect } from "expect";

/**
 * `terminating` composes the same public middleware as `operations`, around a
 * final continuation the caller supplies for that one call.
 *
 * The distinction it exists for: the stable name composes replaceable policy,
 * while the base of the chain belongs to whoever started the call. Middleware
 * cannot tell the two apart, and cannot reach the base of either.
 */
describe("context api: per-call terminal", () => {
  it("still terminates in the createApi default when none is supplied", function* () {
    let api = createApi("numbers", {
      *one(): Operation<number> {
        return 1;
      },
    });

    expect(yield* api.operations.one()).toEqual(1);
  });

  it("replaces the default for that call only", function* () {
    let api = createApi("numbers", {
      *one(): Operation<number> {
        return 1;
      },
    });

    expect(
      yield* api.terminating.one(function* (): Operation<number> {
        return 99;
      })(),
    ).toEqual(99);
    // The next ordinary call is unaffected.
    expect(yield* api.operations.one()).toEqual(1);
  });

  it("collects the same middleware, in the same max/min order, either way", function* () {
    let order: string[] = [];
    let api = createApi("numbers", {
      *one(): Operation<string> {
        order.push("default");
        return "default";
      },
    });

    yield* scoped(function* () {
      yield* api.around({
        *one([], next) {
          order.push("outer");
          return yield* next();
        },
      });
      yield* api.around(
        {
          *one([], next) {
            order.push("inner");
            return yield* next();
          },
        },
        { at: "min" },
      );

      order.length = 0;
      yield* api.operations.one();
      expect(order).toEqual(["outer", "inner", "default"]);

      order.length = 0;
      yield* api.terminating.one(function* (): Operation<string> {
        order.push("supplied");
        return "supplied";
      })();
      expect(order).toEqual(["outer", "inner", "supplied"]);
    });
  });

  it("does not reach the continuation when a handler declines to delegate", function* () {
    let reached: string[] = [];
    let api = createApi("numbers", {
      *one(): Operation<string> {
        return "default";
      },
    });

    let answer = yield* scoped(function* () {
      yield* api.around({
        // deno-lint-ignore require-yield
        *one() {
          return "refused";
        },
      });
      return yield* api.terminating.one(function* (): Operation<string> {
        reached.push("supplied");
        return "supplied";
      })();
    });

    expect(answer).toEqual("refused");
    expect(reached).toEqual([]);
  });

  it("gives nested calls their own continuations", function* () {
    let api = createApi("numbers", {
      *one(): Operation<string> {
        return "default";
      },
    });

    let seen: string[] = [];
    let nested = false;
    yield* scoped(function* () {
      yield* api.around({
        *one([], next) {
          // A nested call started from inside the outer call's own chain — the
          // shape that matters, since the nested chain collects this very
          // middleware. The guard is what stops it recursing forever; what is
          // under test is that each call reaches its own continuation.
          if (!nested) {
            nested = true;
            seen.push(
              yield* api.terminating.one(function* (): Operation<string> {
                return "inner-terminal";
              })(),
            );
          }
          return yield* next();
        },
      });
      seen.push(
        yield* api.terminating.one(function* (): Operation<string> {
          return "outer-terminal";
        })(),
      );
    });

    expect(seen).toEqual(["inner-terminal", "outer-terminal"]);
  });

  it("keeps concurrent calls from exchanging continuations", function* () {
    let api = createApi("numbers", {
      *one(): Operation<string> {
        return "default";
      },
    });

    let answers = yield* scoped(function* () {
      let first = yield* spawn(() =>
        api.terminating.one(function* (): Operation<string> {
          return "first";
        })(),
      );
      let second = yield* spawn(() =>
        api.terminating.one(function* (): Operation<string> {
          return "second";
        })(),
      );
      return [yield* first, yield* second];
    });

    expect(answers).toEqual(["first", "second"]);
  });

  it("composes middleware installed through another descriptor of the same name", function* () {
    let seen: string[] = [];
    let api = createApi("numbers", {
      *one(): Operation<string> {
        return "default";
      },
    });
    // A separately constructed descriptor of the same stable name, which is
    // what a second loaded copy of a package is.
    let elsewhere = createApi("numbers", {
      *one(): Operation<string> {
        return "elsewhere-default";
      },
    });

    let answer = yield* scoped(function* () {
      yield* elsewhere.around({
        *one([], next) {
          seen.push("foreign");
          return yield* next();
        },
      });
      return yield* api.terminating.one(function* (): Operation<string> {
        return "supplied";
      })();
    });

    expect(seen).toEqual(["foreign"]);
    expect(answer).toEqual("supplied");
  });

  it("keeps later at:min and at:max registrations outside the supplied terminal", function* () {
    let order: string[] = [];
    let api = createApi("numbers", {
      *one(): Operation<string> {
        return "default";
      },
    });

    yield* scoped(function* () {
      yield* api.around(
        {
          *one([], next) {
            order.push("min");
            return yield* next();
          },
        },
        { at: "min" },
      );
      yield* api.around(
        {
          *one([], next) {
            order.push("max");
            return yield* next();
          },
        },
        { at: "max" },
      );

      yield* api.terminating.one(function* (): Operation<string> {
        order.push("terminal");
        return "supplied";
      })();
    });

    // Both public layers ran, and both ran outside the supplied terminal.
    expect(order).toEqual(["max", "min", "terminal"]);
  });

  it("tears the call down normally when the continuation fails", function* () {
    let api = createApi("numbers", {
      *one(): Operation<string> {
        return "default";
      },
    });

    let unwound: string[] = [];
    let failure = yield* scoped(function* () {
      yield* api.around({
        *one([], next) {
          try {
            return yield* next();
          } finally {
            unwound.push("middleware");
          }
        },
      });
      try {
        yield* api.terminating.one(function* (): Operation<string> {
          throw new Error("the continuation failed");
        })();
        return undefined;
      } catch (error) {
        return error;
      }
    });

    expect(String(failure)).toContain("the continuation failed");
    expect(unwound).toEqual(["middleware"]);
  });

  it("tears the call down normally when the caller is halted", function* () {
    let api = createApi("numbers", {
      *one(): Operation<string> {
        return "default";
      },
    });
    let unwound: string[] = [];

    // The continuation says when it is running, so the halt lands inside it by
    // construction rather than by winning a race against the scheduler.
    let started = withResolvers<void>();
    yield* scoped(function* () {
      let task = yield* spawn(() =>
        api.terminating.one(function* (): Operation<string> {
          try {
            started.resolve();
            yield* suspend();
            return "never";
          } finally {
            unwound.push("terminal");
          }
        })(),
      );
      yield* started.operation;
      yield* task.halt();
    });

    expect(unwound).toEqual(["terminal"]);
  });
});
