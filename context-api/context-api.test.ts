import { describe, it } from "bdd";
import { expect } from "@std/expect";
import { type Operation, run, scoped } from "effection";
import { createApi } from "@effectionx/context-api";

describe("context api", () => {
  it("can invoke a handler from anywhere", async () => {
    let { one, two } = createApi("numbers", {
      *one() {
        return 1;
      },
      *two() {
        return 2;
      },
    }).operations;

    await run(function* () {
      expect(yield* one()).toEqual(1);
      expect(yield* two()).toEqual(2);
    });
  });

  it("can have handlers that are not functions", async () => {
    let { one } = createApi("one", {
      one: {
        *[Symbol.iterator]() {
          return 1;
        },
      },
    }).operations;

    await run(function* () {
      expect(yield* one).toEqual(1);
    });
  });

  it("can add middleware around operations and operation functions", async () => {
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

    await run(function* () {
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
  });

  it("passes arguments to an operation", async () => {
    const math = createApi("math", {
      *add(left: number, right: number): Operation<number> {
        return left + right;
      },
    });

    const { add } = math.operations;

    await run(function* () {
      expect(yield* add(1, 1)).toEqual(2);
    });
  });

  it("can modify arguments to operations with middleware", async () => {
    const math = createApi("math", {
      *add(left: number, right: number): Operation<number> {
        return left + right;
      },
    });

    const { add } = math.operations;

    await run(function* () {
      yield* math.around({
        *add([left, right], next) {
          return yield* next(left + 1, right + 1);
        },
      });

      expect(yield* add(1, 1)).toEqual(4);
    });
  });

  it("treats the middleware contextually", async () => {
    const math = createApi("math", {
      *add(left: number, right: number): Operation<number> {
        return left + right;
      },
    });
    const { add } = math.operations;

    await run(function* () {
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
  });

  it("chains multiple middleware", async () => {
    const math = createApi("math", {
      *add(left: number, right: number): Operation<number> {
        return left + right;
      },
    });

    await run(function*() {
      yield* math.around({
        *add([left, right], next) {
          return 10 + (yield* next(left, right));
        }
      });

      yield* math.around({
        *add([left, right], next) {
          return 100 + (yield* next(left, right));
        }
      })

            yield* math.around({
        *add([left, right], next) {
          return 20 + (yield* next(left, right));
        }
      })
      
      expect(yield* math.operations.add(5, 15)).toEqual(150);
    });
  })
});
