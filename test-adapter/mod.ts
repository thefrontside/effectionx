import type {
  Future,
  Operation,
  Result,
  Scope,
  WithResolvers,
} from "effection";
import {
  createScope,
  Ok,
  run,
  suspend,
  useScope,
  withResolvers,
} from "effection";
import { box } from "./box.ts";

export type TestOperation = () => Operation<void>;

export interface TestAdapter {
  /**
   * The parent of this adapter. All of the setup from this adapter will be
   * run in addition to the setup of this adapter during `runTest()`
   */
  readonly parent?: TestAdapter;

  /**
   * The name of this adapter which is mostly useful for debugging purposes
   */
  readonly name: string;

  /**
   * A qualified name that contains not only the name of this adapter, but of all its
   * ancestors. E.g. `All Tests > File System > write`
   */
  readonly fullname: string;

  /**
   * A list of this test adapter and every adapter that it descends from.
   */
  readonly lineage: Array<TestAdapter>;

  /**
   * The setup operations that will be run by this test adapter. It only includes those
   * setups that are associated with this adapter, not those of its ancestors.
   */
  readonly setup: { all: TestOperation[]; each: TestOperation[] };

  /**
   * Add a setup operation to every test that is part of this adapter. In BDD integrations,
   * this is usually called by `beforEach()`
   */
  addSetup(op: TestOperation): void;

  /**
   * Add a setup operation that will run exactly once before any tests that are run in this
   * adapter. In BDD integrations, this is usually called by beforeAll()
   */
  addOnetimeSetup(op: TestOperation): void;

  /**
   * Actually run a test. This evaluates all setup operations, and then after those have completed
   * it runs the body of the test itself.
   */
  runTest(body: TestOperation): Future<Result<void>>;

  /**
   * Teardown this test adapter and all of the task and resources that are running inside it.
   * This basically destroys the Effection `Scope` associated with this adapter.
   */
  destroy(): Future<void>;

  /**
   * Used internally to prepare adapters to run test
   *
   * @ignore
   */
  "@@init@@"(): Operation<Result<Scope>>;
}

export interface TestAdapterOptions {
  /**
   * The name of this test adapter which is handy for debugging.
   * Usually, you'll give this the same name as the current test
   * context. For example, when integrating with BDD, this would be
   * the same as
   */
  name?: string;
  /**
   * The parent test adapter. All of the setup from this adapter will be
   * run in addition to the setup of this adapter during `runTest()`
   */
  parent?: TestAdapter;
}

const anonymousNames: Iterator<string, never> = (function* () {
  let count = 1;
  while (true) {
    yield `anonymous test adapter ${count++}`;
  }
})();

/**
 * Create a new test adapter with the given options.
 */
export function createTestAdapter(
  options: TestAdapterOptions = {},
): TestAdapter {
  const setup = {
    all: [] as TestOperation[],
    each: [] as TestOperation[],
  };
  const { parent, name = anonymousNames.next().value } = options;

  let scope: WithResolvers<Result<Scope>> | undefined = undefined;
  let destroy: () => Operation<void> = function* () {};

  const adapter: TestAdapter = {
    parent,
    name,
    setup,
    get lineage() {
      const lineage = [adapter];
      for (let current = parent; current; current = current.parent) {
        lineage.unshift(current);
      }
      return lineage;
    },
    get fullname() {
      return adapter.lineage.map((adapter) => adapter.name).join(" > ");
    },
    addSetup(op) {
      setup.each.push(op);
    },
    addOnetimeSetup(op) {
      setup.all.push(op);
    },
    runTest(op) {
      return run(function* () {
        let init = yield* adapter["@@init@@"]();
        if (!init.ok) {
          return init;
        }
        let scope = init.value;

        const setups = adapter.lineage.reduce(
          (all, adapter) => all.concat(adapter.setup.each),
          [] as TestOperation[],
        );

        let test = yield* scope.spawn(() =>
          box(function* () {
            for (let fn of setups) {
              yield* fn();
            }
            yield* op();
          }),
        );
        return yield* test;
      });
    },

    *"@@init@@"() {
      if (scope) {
        return yield* scope.operation;
      }
      scope = withResolvers<Result<Scope>>();

      let parent = adapter.parent
        ? yield* adapter.parent["@@init@@"]()
        : Ok(createScope()[0]);

      if (!parent.ok) {
        scope.resolve(parent);
        return yield* scope.operation;
      }

      let task = yield* parent.value.spawn(function* () {
        let init = yield* box(function* () {
          for (let initializer of adapter.setup.all) {
            yield* initializer();
          }
        });
        if (!init.ok) {
          scope?.resolve(init);
        } else {
          scope?.resolve(Ok(yield* useScope()));
          yield* suspend();
        }
      });

      destroy = task.halt;

      return yield* scope.operation;
    },
    destroy: () => run(destroy),
  };

  return adapter;
}
