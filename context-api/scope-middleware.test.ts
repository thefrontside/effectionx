import { describe, it } from "@effectionx/bdd";
import { createApi } from "@effectionx/context-api";
import { type Operation, scoped, spawn, withResolvers } from "effection";
import { expect } from "expect";

describe("scope middleware", () => {
  describe("inheritance", () => {
    it("inherits parent middleware into a spawned child", function* () {
      const api = createApi("inherit.spawn", {
        *value(): Operation<string> {
          return "core";
        },
      });

      const log: string[] = [];

      yield* api.around({
        *value(args, next) {
          log.push("parent:enter");
          const result = yield* next(...args);
          log.push("parent:exit");
          return result;
        },
      });

      const task = yield* spawn(function* () {
        return yield* api.operations.value();
      });

      const result = yield* task;
      expect(result).toEqual("core");
      expect(log).toEqual(["parent:enter", "parent:exit"]);
    });

    it("child max middleware extends parent max instead of replacing it", function* () {
      const api = createApi("inherit.max", {
        *value(): Operation<string> {
          return "core";
        },
      });

      const log: string[] = [];

      yield* api.around({
        *value(args, next) {
          log.push("max-a:enter");
          const result = yield* next(...args);
          log.push("max-a:exit");
          return result;
        },
      });

      yield* scoped(function* () {
        yield* api.around({
          *value(args, next) {
            log.push("max-b:enter");
            const result = yield* next(...args);
            log.push("max-b:exit");
            return result;
          },
        });

        yield* api.operations.value();
      });

      expect(log).toEqual([
        "max-a:enter",
        "max-b:enter",
        "max-b:exit",
        "max-a:exit",
      ]);

      log.length = 0;
      yield* api.operations.value();
      expect(log).toEqual(["max-a:enter", "max-a:exit"]);
    });

    it("child min middleware extends parent min instead of replacing it", function* () {
      const api = createApi("inherit.min", {
        *value(): Operation<string> {
          return "core";
        },
      });

      const log: string[] = [];

      yield* api.around(
        {
          *value(args, next) {
            log.push("min-a:enter");
            const result = yield* next(...args);
            log.push("min-a:exit");
            return result;
          },
        },
        { at: "min" },
      );

      yield* scoped(function* () {
        yield* api.around(
          {
            *value(args, next) {
              log.push("min-b:enter");
              const result = yield* next(...args);
              log.push("min-b:exit");
              return result;
            },
          },
          { at: "min" },
        );

        yield* api.operations.value();
      });

      expect(log).toEqual([
        "min-b:enter",
        "min-a:enter",
        "min-a:exit",
        "min-b:exit",
      ]);

      log.length = 0;
      yield* api.operations.value();
      expect(log).toEqual(["min-a:enter", "min-a:exit"]);
    });

    it("child with both max and min composes with parent max and min", function* () {
      const api = createApi("inherit.both", {
        *value(): Operation<string> {
          return "core";
        },
      });

      const log: string[] = [];

      yield* api.around({
        *value(args, next) {
          log.push("max-a:enter");
          const result = yield* next(...args);
          log.push("max-a:exit");
          return result;
        },
      });

      yield* api.around(
        {
          *value(args, next) {
            log.push("min-a:enter");
            const result = yield* next(...args);
            log.push("min-a:exit");
            return result;
          },
        },
        { at: "min" },
      );

      yield* scoped(function* () {
        yield* api.around({
          *value(args, next) {
            log.push("max-b:enter");
            const result = yield* next(...args);
            log.push("max-b:exit");
            return result;
          },
        });

        yield* api.around(
          {
            *value(args, next) {
              log.push("min-b:enter");
              const result = yield* next(...args);
              log.push("min-b:exit");
              return result;
            },
          },
          { at: "min" },
        );

        yield* api.operations.value();
      });

      expect(log).toEqual([
        "max-a:enter",
        "max-b:enter",
        "min-b:enter",
        "min-a:enter",
        "min-a:exit",
        "min-b:exit",
        "max-b:exit",
        "max-a:exit",
      ]);
    });
  });

  describe("ordering", () => {
    it("max wraps outside min with full enter/exit order", function* () {
      const api = createApi("order.maxmin", {
        *value(): Operation<string> {
          return "core";
        },
      });

      const log: string[] = [];

      yield* api.around({
        *value(args, next) {
          log.push("max:enter");
          const result = yield* next(...args);
          log.push("max:exit");
          return result;
        },
      });

      yield* api.around(
        {
          *value(args, next) {
            log.push("min:enter");
            const result = yield* next(...args);
            log.push("min:exit");
            return result;
          },
        },
        { at: "min" },
      );

      yield* api.operations.value();
      expect(log).toEqual(["max:enter", "min:enter", "min:exit", "max:exit"]);
    });

    it("parent max wraps outside child max with enter/exit order", function* () {
      const api = createApi("order.outermax", {
        *value(): Operation<string> {
          return "core";
        },
      });

      const log: string[] = [];

      yield* api.around({
        *value(args, next) {
          log.push("max-a:enter");
          const result = yield* next(...args);
          log.push("max-a:exit");
          return result;
        },
      });

      yield* scoped(function* () {
        yield* api.around({
          *value(args, next) {
            log.push("max-b:enter");
            const result = yield* next(...args);
            log.push("max-b:exit");
            return result;
          },
        });

        yield* api.operations.value();
      });

      expect(log).toEqual([
        "max-a:enter",
        "max-b:enter",
        "max-b:exit",
        "max-a:exit",
      ]);
    });

    it("child min runs inside parent min with enter/exit order", function* () {
      const api = createApi("order.innermin", {
        *value(): Operation<string> {
          return "core";
        },
      });

      const log: string[] = [];

      yield* api.around(
        {
          *value(args, next) {
            log.push("min-a:enter");
            const result = yield* next(...args);
            log.push("min-a:exit");
            return result;
          },
        },
        { at: "min" },
      );

      yield* scoped(function* () {
        yield* api.around(
          {
            *value(args, next) {
              log.push("min-b:enter");
              const result = yield* next(...args);
              log.push("min-b:exit");
              return result;
            },
          },
          { at: "min" },
        );

        yield* api.operations.value();
      });

      expect(log).toEqual([
        "min-b:enter",
        "min-a:enter",
        "min-a:exit",
        "min-b:exit",
      ]);
    });

    it("mixed parent/child min/max ordering is stable", function* () {
      const api = createApi("order.mixed", {
        *value(): Operation<string> {
          return "core";
        },
      });

      const log: string[] = [];

      yield* api.around({
        *value(args, next) {
          log.push("max-a:enter");
          const result = yield* next(...args);
          log.push("max-a:exit");
          return result;
        },
      });

      yield* api.around(
        {
          *value(args, next) {
            log.push("min-a:enter");
            const result = yield* next(...args);
            log.push("min-a:exit");
            return result;
          },
        },
        { at: "min" },
      );

      yield* scoped(function* () {
        yield* api.around({
          *value(args, next) {
            log.push("max-b:enter");
            const result = yield* next(...args);
            log.push("max-b:exit");
            return result;
          },
        });

        yield* api.around(
          {
            *value(args, next) {
              log.push("min-b:enter");
              const result = yield* next(...args);
              log.push("min-b:exit");
              return result;
            },
          },
          { at: "min" },
        );

        yield* api.operations.value();
      });

      expect(log).toEqual([
        "max-a:enter",
        "max-b:enter",
        "min-b:enter",
        "min-a:enter",
        "min-a:exit",
        "min-b:exit",
        "max-b:exit",
        "max-a:exit",
      ]);
    });
  });

  describe("isolation", () => {
    it("child middleware does not leak to parent after scope exit", function* () {
      const api = createApi("iso.leak", {
        five: 5,
      });

      yield* api.around({
        five: (args, next) => next(...args) * 2,
      });

      const childResult = yield* scoped(function* () {
        yield* api.around({
          five: (args, next) => next(...args) + 10,
        });
        return yield* api.operations.five;
      });

      expect(childResult).toEqual((5 + 10) * 2);

      const parentResult = yield* api.operations.five;
      expect(parentResult).toEqual(5 * 2);
    });

    it("sibling scopes do not share local middleware", function* () {
      const api = createApi("iso.sibling", {
        value: () => 1 as number,
      });

      yield* api.around({
        value: (args, next) => next(...args) * 2,
      });

      const resultA = yield* scoped(function* () {
        yield* api.around({
          value: (args, next) => next(...args) + 100,
        });
        return yield* api.operations.value();
      });

      expect(resultA).toEqual((1 + 100) * 2);

      const resultB = yield* scoped(function* () {
        yield* api.around({
          value: (args, next) => next(...args) + 200,
        });
        return yield* api.operations.value();
      });

      expect(resultB).toEqual((1 + 200) * 2);

      const parentResult = yield* api.operations.value();
      expect(parentResult).toEqual(1 * 2);
    });
  });

  describe("spawn semantics", () => {
    it("spawned task sees live middleware from parent scope", function* () {
      const api = createApi("spawn.capture", {
        *value(): Operation<string> {
          return "core";
        },
      });

      const log: string[] = [];

      yield* api.around({
        *value(args, next) {
          log.push("a:enter");
          const result = yield* next(...args);
          log.push("a:exit");
          return result;
        },
      });

      // Gate: child waits until middleware-b is installed
      const gate = withResolvers<void>();

      const task = yield* spawn(function* () {
        yield* gate.operation;
        return yield* api.operations.value();
      });

      // Install middleware-b AFTER spawning the child
      yield* api.around({
        *value(args, next) {
          log.push("b:enter");
          const result = yield* next(...args);
          log.push("b:exit");
          return result;
        },
      });

      // Ungate the child — it now reads context with both middlewares installed
      gate.resolve();

      const result = yield* task;
      expect(result).toEqual("core");
      // Spawned tasks share parent scope context — they see live updates,
      // not a snapshot from spawn time. Middleware-b added after spawn is visible.
      expect(log).toEqual(["a:enter", "b:enter", "b:exit", "a:exit"]);
    });

    it("grandchild inherits accumulated middleware through spawned tasks", function* () {
      const api = createApi("spawn.grandchild", {
        *value(): Operation<string> {
          return "core";
        },
      });

      const log: string[] = [];

      yield* api.around({
        *value(args, next) {
          log.push("a:enter");
          const result = yield* next(...args);
          log.push("a:exit");
          return result;
        },
      });

      const outer = yield* spawn(function* () {
        yield* api.around({
          *value(args, next) {
            log.push("b:enter");
            const result = yield* next(...args);
            log.push("b:exit");
            return result;
          },
        });

        const inner = yield* spawn(function* () {
          yield* api.around({
            *value(args, next) {
              log.push("c:enter");
              const result = yield* next(...args);
              log.push("c:exit");
              return result;
            },
          });

          return yield* api.operations.value();
        });

        return yield* inner;
      });

      yield* outer;

      expect(log).toEqual([
        "a:enter",
        "b:enter",
        "c:enter",
        "c:exit",
        "b:exit",
        "a:exit",
      ]);
    });
  });

  describe("args and results", () => {
    it("parent and child both transform args and results cumulatively", function* () {
      const api = createApi("transform", {
        *add(a: number, b: number): Operation<number> {
          return a + b;
        },
      });

      yield* api.around({
        *add([a, b], next) {
          const result = yield* next(a + 1, b + 1);
          return result + 100;
        },
      });

      const childResult = yield* scoped(function* () {
        yield* api.around({
          *add([a, b], next) {
            const result = yield* next(a * 2, b * 2);
            return result + 1000;
          },
        });

        // parent: [3,4] -> [4,5], child: [4,5] -> [8,10], core: 18, child: +1000=1018, parent: +100=1118
        return yield* api.operations.add(3, 4);
      });

      expect(childResult).toEqual(1118);

      // parent only: [3,4] -> [4,5], core: 9, parent: +100=109
      const parentResult = yield* api.operations.add(3, 4);
      expect(parentResult).toEqual(109);
    });
  });

  describe("handler-shape coverage across scopes", () => {
    it("cross-scope composition works for all handler types", function* () {
      const api = createApi("shapes", {
        constVal: 10,
        *opFn(): Operation<number> {
          return 10;
        },
        opObj: {
          *[Symbol.iterator]() {
            return 10;
          },
        } as Operation<number>,
        syncFn: () => 10 as number,
      });

      // Parent: multiply by 2
      yield* api.around({
        constVal: (args, next) => next(...args) * 2,
        *opFn(args, next) {
          return (yield* next(...args)) * 2;
        },
        *opObj(args, next) {
          return (yield* next(...args)) * 2;
        },
        syncFn: (args, next) => next(...args) * 2,
      });

      const childResults = yield* scoped(function* () {
        // Child: add 5
        yield* api.around({
          constVal: (args, next) => next(...args) + 5,
          *opFn(args, next) {
            return (yield* next(...args)) + 5;
          },
          *opObj(args, next) {
            return (yield* next(...args)) + 5;
          },
          syncFn: (args, next) => next(...args) + 5,
        });

        return {
          constVal: yield* api.operations.constVal,
          opFn: yield* api.operations.opFn(),
          opObj: yield* api.operations.opObj,
          syncFn: yield* api.operations.syncFn(),
        };
      });

      // Child: parent wraps outside child -> (10 + 5) * 2 = 30
      expect(childResults.constVal).toEqual(30);
      expect(childResults.opFn).toEqual(30);
      expect(childResults.opObj).toEqual(30);
      expect(childResults.syncFn).toEqual(30);

      // Parent after child exits: 10 * 2 = 20
      expect(yield* api.operations.constVal).toEqual(20);
      expect(yield* api.operations.opFn()).toEqual(20);
      expect(yield* api.operations.opObj).toEqual(20);
      expect(yield* api.operations.syncFn()).toEqual(20);
    });
  });
});
