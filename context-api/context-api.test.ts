import { describe, it } from "@effectionx/bdd";
import { createApi } from "@effectionx/context-api";
import { type Operation, scoped } from "effection";
import { expect } from "expect";

describe("context api", () => {
  it("can invoke a handler from anywhere", function* () {
    let { one, two } = createApi("numbers", {
      *one() {
        return 1;
      },
      *two() {
        return 2;
      },
    }).operations;

    expect(yield* one()).toEqual(1);
    expect(yield* two()).toEqual(2);
  });

  it("can have handlers that are not functions", function* () {
    let { one } = createApi("one", {
      one: {
        *[Symbol.iterator]() {
          return 1;
        },
      },
    }).operations;
    expect(yield* one).toEqual(1);
  });

  it("can add middleware around operations and operation functions", function* () {
    let numbers = createApi("numbers", {
      one: {
        *[Symbol.iterator]() {
          return 1;
        },
      } as Operation<number>,
      *two(): Operation<number> {
        return 2;
      },
    });

    let { one, two } = numbers.operations;
    yield* numbers.around({
      *one(args, next) {
        return (yield* next(...args)) * 2;
      },
      *two(args, next) {
        return (yield* next(...args)) * 2;
      },
    });

    expect(yield* one).toEqual(2);
    expect(yield* two()).toEqual(4);
  });

  it("passes arguments to an operation", function* () {
    const math = createApi("math", {
      *add(left: number, right: number): Operation<number> {
        return left + right;
      },
    });

    const { add } = math.operations;
    expect(yield* add(1, 1)).toEqual(2);
  });

  it("can modify arguments to operations with middleware", function* () {
    const math = createApi("math", {
      *add(left: number, right: number): Operation<number> {
        return left + right;
      },
    });

    const { add } = math.operations;
    yield* math.around({
      *add([left, right], next) {
        return yield* next(left + 1, right + 1);
      },
    });

    expect(yield* add(1, 1)).toEqual(4);
  });

  it("treats the middleware contextually", function* () {
    const math = createApi("math", {
      *add(left: number, right: number): Operation<number> {
        return left + right;
      },
    });
    const { add } = math.operations;
    yield* scoped(function* () {
      yield* math.around({
        *add([left, right], next) {
          return yield* next(left + 1, right + 1);
        },
      });
      expect(yield* add(1, 1)).toEqual(4);
    });

    expect(yield* add(1, 1)).toEqual(2);
  });

  it("chains multiple middleware", function* () {
    const math = createApi("math", {
      *add(left: number, right: number): Operation<number> {
        return left + right;
      },
    });

    yield* math.around({
      *add([left, right], next) {
        return 10 + (yield* next(left, right));
      },
    });

    yield* math.around({
      *add([left, right], next) {
        return 100 + (yield* next(left, right));
      },
    });

    yield* math.around({
      *add([left, right], next) {
        return 20 + (yield* next(left, right));
      },
    });

    expect(yield* math.operations.add(5, 15)).toEqual(150);
  });

  it("places min middleware closest to the core", function* () {
    const math = createApi("math", {
      *add(left: number, right: number): Operation<number> {
        return left + right;
      },
    });

    const log: string[] = [];

    // max middleware wraps outermost
    yield* math.around({
      *add(args, next) {
        log.push("max");
        return yield* next(...args);
      },
    });

    // min middleware runs just before core
    yield* math.around(
      {
        *add(args, next) {
          log.push("min");
          return yield* next(...args);
        },
      },
      { at: "min" },
    );

    expect(yield* math.operations.add(1, 2)).toEqual(3);
    expect(log).toEqual(["max", "min"]);
  });

  it("min middleware can provide an implementation that replaces the core", function* () {
    const math = createApi("math", {
      *add(_left: number, _right: number): Operation<number> {
        throw new Error("not implemented");
      },
    });

    // Provide the real implementation via min
    yield* math.around(
      {
        *add([left, right], _next) {
          return left * right; // multiply instead of add
        },
      },
      { at: "min" },
    );

    // Wrapping middleware at max still works
    yield* math.around({
      *add(args, next) {
        return 1 + (yield* next(...args));
      },
    });

    expect(yield* math.operations.add(3, 4)).toEqual(13); // 1 + (3 * 4)
  });

  it("preserves min/max ordering regardless of insertion order", function* () {
    const math = createApi("math", {
      *add(left: number, right: number): Operation<number> {
        return left + right;
      },
    });

    const log: string[] = [];

    // Register in mixed order: max, min, max, min
    yield* math.around({
      *add(args, next) {
        log.push("max-1");
        return yield* next(...args);
      },
    });

    yield* math.around(
      {
        *add(args, next) {
          log.push("min-1");
          return yield* next(...args);
        },
      },
      { at: "min" },
    );

    yield* math.around({
      *add(args, next) {
        log.push("max-2");
        return yield* next(...args);
      },
    });

    yield* math.around(
      {
        *add(args, next) {
          log.push("min-2");
          return yield* next(...args);
        },
      },
      { at: "min" },
    );

    yield* math.operations.add(1, 1);
    // Most recently installed min middleware gets interception priority
    expect(log).toEqual(["max-1", "max-2", "min-2", "min-1"]);
  });

  it("min/max middleware respects scope isolation", function* () {
    const math = createApi("math", {
      *add(left: number, right: number): Operation<number> {
        return left + right;
      },
    });

    const log: string[] = [];

    // Install max middleware in parent scope
    yield* math.around({
      *add(args, next) {
        log.push("parent-max");
        return yield* next(...args);
      },
    });

    // Install min middleware in parent scope
    yield* math.around(
      {
        *add(args, next) {
          log.push("parent-min");
          return yield* next(...args);
        },
      },
      { at: "min" },
    );

    yield* scoped(function* () {
      // Child scope adds its own max and min middleware
      yield* math.around({
        *add(args, next) {
          log.push("child-max");
          return yield* next(...args);
        },
      });
      yield* math.around(
        {
          *add(args, next) {
            log.push("child-min");
            return yield* next(...args);
          },
        },
        { at: "min" },
      );
      yield* math.operations.add(1, 1);
      // Child scope's min middleware runs before parent's (innermost wins)
      expect(log).toEqual([
        "parent-max",
        "child-max",
        "child-min",
        "parent-min",
      ]);
    });

    // Parent scope doesn't see child's middleware
    log.length = 0;
    yield* math.operations.add(1, 1);
    expect(log).toEqual(["parent-max", "parent-min"]);
  });

  it("defaults to max when no option is provided", function* () {
    const math = createApi("math", {
      *add(left: number, right: number): Operation<number> {
        return left + right;
      },
    });

    const log: string[] = [];

    // No option — should be max (outermost)
    yield* math.around({
      *add(args, next) {
        log.push("default");
        return yield* next(...args);
      },
    });

    // Explicit min
    yield* math.around(
      {
        *add(args, next) {
          log.push("min");
          return yield* next(...args);
        },
      },
      { at: "min" },
    );

    yield* math.operations.add(1, 1);
    expect(log).toEqual(["default", "min"]);
  });

  it("invokes synchronous functions as operations", function* () {
    let api = createApi("test", {
      five: () => 5,
    });

    expect(yield* api.operations.five()).toEqual(5);
  });

  it("invokes constants as operations", function* () {
    let api = createApi("test", {
      five: 5,
    });

    expect(yield* api.operations.five).toEqual(5);
  });

  it("invokes synchronous functions with arguments", function* () {
    let api = createApi("math", {
      add: (a: number, b: number) => a + b,
    });

    expect(yield* api.operations.add(3, 4)).toEqual(7);
  });

  it("can have sync middleware on sync functions", function* () {
    let api = createApi("test", {
      five: () => 5 as number,
    });

    yield* api.around({
      five: (args, next) => next(...args) * 2,
    });

    expect(yield* api.operations.five()).toEqual(10);
  });

  it("can have sync middleware on constants", function* () {
    let api = createApi("test", {
      five: 5,
    });

    yield* api.around({
      five: (args, next) => next(...args) * 2,
    });

    expect(yield* api.operations.five).toEqual(10);
  });

  it("supports mixed handler types with middleware", function* () {
    let api = createApi("test", {
      constFive: 5,
      *operationFnFive(): Operation<number> {
        return 5;
      },
      operationFive: {
        *[Symbol.iterator]() {
          return 5;
        },
      } as Operation<number>,
      syncFive: () => 5 as number,
    });

    yield* api.around({
      constFive: (args, next) => next(...args) * 2,
      *operationFnFive(args, next) {
        return (yield* next(...args)) * 2;
      },
      *operationFive(args, next) {
        return (yield* next(...args)) * 2;
      },
      syncFive: (args, next) => next(...args) * 2,
    });

    expect(yield* api.operations.constFive).toEqual(10);
    expect(yield* api.operations.operationFnFive()).toEqual(10);
    expect(yield* api.operations.operationFive).toEqual(10);
    expect(yield* api.operations.syncFive()).toEqual(10);
  });

  it("does not mistake native iterables for operations", function* () {
    let api = createApi("test", {
      greeting: "hello",
      items: () => [1, 2, 3],
    });

    expect(yield* api.operations.greeting).toEqual("hello");
    expect(yield* api.operations.items()).toEqual([1, 2, 3]);
  });

  it("sync middleware respects scope isolation", function* () {
    let api = createApi("test", {
      value: () => 1 as number,
    });

    yield* scoped(function* () {
      yield* api.around({
        value: (args, next) => next(...args) * 10,
      });
      expect(yield* api.operations.value()).toEqual(10);
    });

    // Parent scope is unaffected
    expect(yield* api.operations.value()).toEqual(1);
  });

  it("inner scope min middleware wraps closer to handler than outer", function* () {
    const api = createApi("test.nested", {
      *greet(name: string): Operation<string> {
        return `hello ${name}`;
      },
    });

    const result = yield* scoped(function* () {
      // Outer scope installs min middleware
      yield* api.around(
        {
          *greet([name], next) {
            return `outer(${yield* next(name)})`;
          },
        },
        { at: "min" },
      );

      return yield* scoped(function* () {
        // Inner scope installs min middleware
        yield* api.around(
          {
            *greet([name], next) {
              return `inner(${yield* next(name)})`;
            },
          },
          { at: "min" },
        );

        return yield* api.operations.greet("world");
      });
    });

    // Inner scope's min middleware intercepts first (innermost wins):
    // inner runs outermost, outer wraps the handler
    // Result: inner(outer(hello world))
    expect(result).toEqual("inner(outer(hello world))");
  });

  it("inner scope min middleware intercepts before delegating to outer", function* () {
    const api = createApi("test.intercept", {
      *handle(value: string): Operation<string> {
        return `default:${value}`;
      },
    });

    const result = yield* scoped(function* () {
      // Outer: passes through to next unless value is "outer-only"
      yield* api.around(
        {
          *handle([value], next) {
            if (value === "outer-only") return "caught-by-outer";
            return yield* next(value);
          },
        },
        { at: "min" },
      );

      return yield* scoped(function* () {
        // Inner: intercepts everything, never calls next
        yield* api.around(
          {
            *handle([value], _next) {
              return `caught-by-inner:${value}`;
            },
          },
          { at: "min" },
        );

        return yield* api.operations.handle("test");
      });
    });

    // Inner intercepts first (innermost wins), never calls next
    expect(result).toEqual("caught-by-inner:test");
  });
});
