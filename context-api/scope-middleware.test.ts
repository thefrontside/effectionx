import { describe, it } from "@effectionx/vitest";
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

    it("child extension remains live with later parent max middleware", function* () {
      const api = createApi("spawn.child-extends-parent", {
        *value(): Operation<string> {
          return "core";
        },
      });

      const log: string[] = [];
      const childReady = withResolvers<void>();
      const parentUpdated = withResolvers<void>();

      yield* api.around({
        *value(args, next) {
          log.push("max-a:enter");
          const result = yield* next(...args);
          log.push("max-a:exit");
          return result;
        },
      });

      const task = yield* spawn(function* () {
        yield* api.around({
          *value(args, next) {
            log.push("max-b:enter");
            const result = yield* next(...args);
            log.push("max-b:exit");
            return result;
          },
        });

        childReady.resolve();
        yield* parentUpdated.operation;
        return yield* api.operations.value();
      });

      yield* childReady.operation;

      // Parent adds a second max AFTER child has already extended locally.
      yield* api.around({
        *value(args, next) {
          log.push("max-c:enter");
          const result = yield* next(...args);
          log.push("max-c:exit");
          return result;
        },
      });

      parentUpdated.resolve();

      const childResult = yield* task;
      expect(childResult).toEqual("core");
      expect(log).toEqual([
        "max-a:enter",
        "max-c:enter",
        "max-b:enter",
        "max-b:exit",
        "max-c:exit",
        "max-a:exit",
      ]);

      log.length = 0;
      expect(yield* api.operations.value()).toEqual("core");
      expect(log).toEqual([
        "max-a:enter",
        "max-c:enter",
        "max-c:exit",
        "max-a:exit",
      ]);
    });

    it("child extension remains live with later parent min middleware", function* () {
      const api = createApi("spawn.child-extends-parent-min", {
        *value(): Operation<string> {
          return "core";
        },
      });

      const log: string[] = [];
      const childReady = withResolvers<void>();
      const parentUpdated = withResolvers<void>();

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

      const task = yield* spawn(function* () {
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

        childReady.resolve();
        yield* parentUpdated.operation;
        return yield* api.operations.value();
      });

      yield* childReady.operation;

      // Parent adds a second min AFTER child has already extended locally.
      yield* api.around(
        {
          *value(args, next) {
            log.push("min-c:enter");
            const result = yield* next(...args);
            log.push("min-c:exit");
            return result;
          },
        },
        { at: "min" },
      );

      parentUpdated.resolve();

      const childResult = yield* task;
      expect(childResult).toEqual("core");
      expect(log).toEqual([
        "min-b:enter",
        "min-c:enter",
        "min-a:enter",
        "min-a:exit",
        "min-c:exit",
        "min-b:exit",
      ]);

      log.length = 0;
      expect(yield* api.operations.value()).toEqual("core");
      expect(log).toEqual([
        "min-c:enter",
        "min-a:enter",
        "min-a:exit",
        "min-c:exit",
      ]);
    });

    it("child extension remains live with later parent mixed max and min middleware", function* () {
      const api = createApi("spawn.child-extends-parent-mixed", {
        *value(): Operation<string> {
          return "core";
        },
      });

      const log: string[] = [];
      const childReady = withResolvers<void>();
      const parentUpdated = withResolvers<void>();

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

      const task = yield* spawn(function* () {
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

        childReady.resolve();
        yield* parentUpdated.operation;
        return yield* api.operations.value();
      });

      yield* childReady.operation;

      yield* api.around({
        *value(args, next) {
          log.push("max-c:enter");
          const result = yield* next(...args);
          log.push("max-c:exit");
          return result;
        },
      });
      yield* api.around(
        {
          *value(args, next) {
            log.push("min-c:enter");
            const result = yield* next(...args);
            log.push("min-c:exit");
            return result;
          },
        },
        { at: "min" },
      );

      parentUpdated.resolve();

      const childResult = yield* task;
      expect(childResult).toEqual("core");
      expect(log).toEqual([
        "max-a:enter",
        "max-c:enter",
        "max-b:enter",
        "min-b:enter",
        "min-c:enter",
        "min-a:enter",
        "min-a:exit",
        "min-c:exit",
        "min-b:exit",
        "max-b:exit",
        "max-c:exit",
        "max-a:exit",
      ]);

      log.length = 0;
      expect(yield* api.operations.value()).toEqual("core");
      expect(log).toEqual([
        "max-a:enter",
        "max-c:enter",
        "min-c:enter",
        "min-a:enter",
        "min-a:exit",
        "min-c:exit",
        "max-c:exit",
        "max-a:exit",
      ]);
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

  describe("custom groups", () => {
    const THREE_LANE = [
      { name: "max", mode: "append" },
      { name: "replay", mode: "append" },
      { name: "min", mode: "prepend" },
    ] as const;

    it("executes middleware in declared group order", function* () {
      const api = createApi(
        "groups.declared-order",
        {
          *value(): Operation<string> {
            return "core";
          },
        },
        { groups: THREE_LANE },
      );

      const log: string[] = [];

      yield* api.around(
        {
          *value(args, next) {
            log.push("max:enter");
            const result = yield* next(...args);
            log.push("max:exit");
            return result;
          },
        },
        { at: "max" },
      );

      yield* api.around(
        {
          *value(args, next) {
            log.push("replay:enter");
            const result = yield* next(...args);
            log.push("replay:exit");
            return result;
          },
        },
        { at: "replay" },
      );

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
      expect(log).toEqual([
        "max:enter",
        "replay:enter",
        "min:enter",
        "min:exit",
        "replay:exit",
        "max:exit",
      ]);
    });

    it("append preserves install order within a lane", function* () {
      const api = createApi(
        "groups.append-order",
        {
          *value(): Operation<string> {
            return "core";
          },
        },
        { groups: THREE_LANE },
      );

      const log: string[] = [];

      yield* api.around(
        {
          *value(args, next) {
            log.push("max-a:enter");
            const result = yield* next(...args);
            log.push("max-a:exit");
            return result;
          },
        },
        { at: "max" },
      );

      yield* api.around(
        {
          *value(args, next) {
            log.push("max-b:enter");
            const result = yield* next(...args);
            log.push("max-b:exit");
            return result;
          },
        },
        { at: "max" },
      );

      yield* api.operations.value();
      expect(log).toEqual([
        "max-a:enter",
        "max-b:enter",
        "max-b:exit",
        "max-a:exit",
      ]);
    });

    it("prepend reverses install order within a lane", function* () {
      const api = createApi(
        "groups.prepend-order",
        {
          *value(): Operation<string> {
            return "core";
          },
        },
        { groups: THREE_LANE },
      );

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
      expect(log).toEqual([
        "min-b:enter",
        "min-a:enter",
        "min-a:exit",
        "min-b:exit",
      ]);
    });

    it("middle lane stays between outer and inner regardless of install order", function* () {
      const api = createApi(
        "groups.middle-stable",
        {
          *value(): Operation<string> {
            return "core";
          },
        },
        { groups: THREE_LANE },
      );

      const log: string[] = [];

      // Install in mixed order: min, max, replay, min
      yield* api.around(
        {
          *value(args, next) {
            log.push("min-1:enter");
            const result = yield* next(...args);
            log.push("min-1:exit");
            return result;
          },
        },
        { at: "min" },
      );

      yield* api.around(
        {
          *value(args, next) {
            log.push("max-1:enter");
            const result = yield* next(...args);
            log.push("max-1:exit");
            return result;
          },
        },
        { at: "max" },
      );

      yield* api.around(
        {
          *value(args, next) {
            log.push("replay-1:enter");
            const result = yield* next(...args);
            log.push("replay-1:exit");
            return result;
          },
        },
        { at: "replay" },
      );

      yield* api.around(
        {
          *value(args, next) {
            log.push("min-2:enter");
            const result = yield* next(...args);
            log.push("min-2:exit");
            return result;
          },
        },
        { at: "min" },
      );

      yield* api.operations.value();
      // max → replay → min (with min prepend so min-2 before min-1)
      expect(log).toEqual([
        "max-1:enter",
        "replay-1:enter",
        "min-2:enter",
        "min-1:enter",
        "min-1:exit",
        "min-2:exit",
        "replay-1:exit",
        "max-1:exit",
      ]);
    });

    it("child extends parent per-group across all lanes", function* () {
      const api = createApi(
        "groups.child-extends-parent",
        {
          *value(): Operation<string> {
            return "core";
          },
        },
        { groups: THREE_LANE },
      );

      const log: string[] = [];

      yield* api.around(
        {
          *value(args, next) {
            log.push("max-a:enter");
            const result = yield* next(...args);
            log.push("max-a:exit");
            return result;
          },
        },
        { at: "max" },
      );
      yield* api.around(
        {
          *value(args, next) {
            log.push("replay-a:enter");
            const result = yield* next(...args);
            log.push("replay-a:exit");
            return result;
          },
        },
        { at: "replay" },
      );
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
              log.push("max-b:enter");
              const result = yield* next(...args);
              log.push("max-b:exit");
              return result;
            },
          },
          { at: "max" },
        );
        yield* api.around(
          {
            *value(args, next) {
              log.push("replay-b:enter");
              const result = yield* next(...args);
              log.push("replay-b:exit");
              return result;
            },
          },
          { at: "replay" },
        );
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

      // append lanes: parent outer / child inner (a outer, b inner)
      // prepend lane: child outer / parent inner (b outer, a inner)
      expect(log).toEqual([
        "max-a:enter",
        "max-b:enter",
        "replay-a:enter",
        "replay-b:enter",
        "min-b:enter",
        "min-a:enter",
        "min-a:exit",
        "min-b:exit",
        "replay-b:exit",
        "replay-a:exit",
        "max-b:exit",
        "max-a:exit",
      ]);
    });

    it("child custom-group middleware does not leak back to parent", function* () {
      const api = createApi(
        "groups.no-leak",
        {
          *value(): Operation<string> {
            return "core";
          },
        },
        { groups: THREE_LANE },
      );

      const log: string[] = [];

      yield* api.around(
        {
          *value(args, next) {
            log.push("max-a:enter");
            const result = yield* next(...args);
            log.push("max-a:exit");
            return result;
          },
        },
        { at: "max" },
      );
      yield* api.around(
        {
          *value(args, next) {
            log.push("replay-a:enter");
            const result = yield* next(...args);
            log.push("replay-a:exit");
            return result;
          },
        },
        { at: "replay" },
      );
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
              log.push("max-b:enter");
              const result = yield* next(...args);
              log.push("max-b:exit");
              return result;
            },
          },
          { at: "max" },
        );
        yield* api.around(
          {
            *value(args, next) {
              log.push("replay-b:enter");
              const result = yield* next(...args);
              log.push("replay-b:exit");
              return result;
            },
          },
          { at: "replay" },
        );
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

      log.length = 0;
      yield* api.operations.value();
      expect(log).toEqual([
        "max-a:enter",
        "replay-a:enter",
        "min-a:enter",
        "min-a:exit",
        "replay-a:exit",
        "max-a:exit",
      ]);
    });

    it("spawned child sees later parent replay middleware", function* () {
      const api = createApi(
        "groups.spawn-replay",
        {
          *value(): Operation<string> {
            return "core";
          },
        },
        { groups: THREE_LANE },
      );

      const log: string[] = [];
      const gate = withResolvers<void>();

      yield* api.around(
        {
          *value(args, next) {
            log.push("replay-a:enter");
            const result = yield* next(...args);
            log.push("replay-a:exit");
            return result;
          },
        },
        { at: "replay" },
      );

      const task = yield* spawn(function* () {
        yield* gate.operation;
        return yield* api.operations.value();
      });

      yield* api.around(
        {
          *value(args, next) {
            log.push("replay-b:enter");
            const result = yield* next(...args);
            log.push("replay-b:exit");
            return result;
          },
        },
        { at: "replay" },
      );

      gate.resolve();

      const result = yield* task;
      expect(result).toEqual("core");
      // Spawned child reads live context: sees both earlier and later replay.
      // replay is append, so replay-a runs outer.
      expect(log).toEqual([
        "replay-a:enter",
        "replay-b:enter",
        "replay-b:exit",
        "replay-a:exit",
      ]);
    });

    it("mixed later parent updates across all three lanes remain deterministic", function* () {
      const api = createApi(
        "groups.mixed-later-updates",
        {
          *value(): Operation<string> {
            return "core";
          },
        },
        { groups: THREE_LANE },
      );

      const log: string[] = [];
      const childReady = withResolvers<void>();
      const parentUpdated = withResolvers<void>();

      yield* api.around(
        {
          *value(args, next) {
            log.push("max-a:enter");
            const result = yield* next(...args);
            log.push("max-a:exit");
            return result;
          },
        },
        { at: "max" },
      );
      yield* api.around(
        {
          *value(args, next) {
            log.push("replay-a:enter");
            const result = yield* next(...args);
            log.push("replay-a:exit");
            return result;
          },
        },
        { at: "replay" },
      );
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

      const task = yield* spawn(function* () {
        yield* api.around(
          {
            *value(args, next) {
              log.push("max-b:enter");
              const result = yield* next(...args);
              log.push("max-b:exit");
              return result;
            },
          },
          { at: "max" },
        );
        yield* api.around(
          {
            *value(args, next) {
              log.push("replay-b:enter");
              const result = yield* next(...args);
              log.push("replay-b:exit");
              return result;
            },
          },
          { at: "replay" },
        );
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

        childReady.resolve();
        yield* parentUpdated.operation;
        return yield* api.operations.value();
      });

      yield* childReady.operation;

      yield* api.around(
        {
          *value(args, next) {
            log.push("max-c:enter");
            const result = yield* next(...args);
            log.push("max-c:exit");
            return result;
          },
        },
        { at: "max" },
      );
      yield* api.around(
        {
          *value(args, next) {
            log.push("replay-c:enter");
            const result = yield* next(...args);
            log.push("replay-c:exit");
            return result;
          },
        },
        { at: "replay" },
      );
      yield* api.around(
        {
          *value(args, next) {
            log.push("min-c:enter");
            const result = yield* next(...args);
            log.push("min-c:exit");
            return result;
          },
        },
        { at: "min" },
      );

      parentUpdated.resolve();

      const childResult = yield* task;
      expect(childResult).toEqual("core");
      // append lanes (max, replay): parent outer / child inner;
      // parent install order preserved (a then c), child appended inner.
      // prepend lane (min): child outer / parent inner, with later installs outermost.
      expect(log).toEqual([
        "max-a:enter",
        "max-c:enter",
        "max-b:enter",
        "replay-a:enter",
        "replay-c:enter",
        "replay-b:enter",
        "min-b:enter",
        "min-c:enter",
        "min-a:enter",
        "min-a:exit",
        "min-c:exit",
        "min-b:exit",
        "replay-b:exit",
        "replay-c:exit",
        "replay-a:exit",
        "max-b:exit",
        "max-c:exit",
        "max-a:exit",
      ]);
    });

    describe("validation", () => {
      it("createApi throws on duplicate group names", function* () {
        expect(() =>
          createApi(
            "groups.dup",
            { *v(): Operation<void> {} },
            {
              groups: [
                { name: "max", mode: "append" },
                { name: "replay", mode: "append" },
                { name: "max", mode: "prepend" },
              ] as const,
            },
          ),
        ).toThrow(/duplicate group name/);

        expect(() =>
          createApi(
            "groups.dup",
            { *v(): Operation<void> {} },
            {
              groups: [
                { name: "max", mode: "append" },
                { name: "max", mode: "prepend" },
              ] as const,
            },
          ),
        ).toThrow(/duplicate group names?:[^:]*\bmax\b/);
      });

      it("createApi throws on an empty groups array", function* () {
        expect(() =>
          createApi(
            "groups.empty",
            { *v(): Operation<void> {} },
            { groups: [] as const },
          ),
        ).toThrow(/must not be empty/);
      });

      it("around throws on unknown `at` with known names in the error message", function* () {
        const api = createApi(
          "groups.unknown-at",
          { *v(): Operation<void> {} },
          { groups: THREE_LANE },
        );

        let error: unknown;
        try {
          yield* api.around(
            {
              *v(args, next) {
                yield* next(...args);
              },
            },
            // deliberately cast to bypass the compile-time guard
            { at: "nope" as unknown as "max" | "replay" | "min" },
          );
        } catch (e) {
          error = e;
        }

        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toMatch(/unknown group "nope"/);
        expect(message).toMatch(/max/);
        expect(message).toMatch(/replay/);
        expect(message).toMatch(/min/);
      });
    });
  });
});
