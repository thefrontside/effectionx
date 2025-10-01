import type { Future, Operation, Result, Scope } from "effection";
import { Err, Ok, run, suspend, useScope, withResolvers } from "effection";

export interface TestOperation {
  (): Operation<void>;
}

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
  ["@@init@@"](): Operation<Scope>;
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

  let scope: Scope | undefined = undefined;

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
      return run(() =>
        box(function* () {
          const setups = adapter.lineage.reduce(
            (all, adapter) => all.concat(adapter.setup.each),
            [] as TestOperation[],
          );

          let scope = yield* adapter["@@init@@"]();

          let test = yield* scope.spawn(function* () {
            for (const setup of setups) {
              yield* setup();
            }
            yield* op();
          });

          yield* test;
        }())
      );
    },

    // no-op that will be replaced once initialze
    destroy: () => run(function* () {}),

    *["@@init@@"]() {
      if (scope) {
        return scope;
      }

      let parentScope = parent
        ? yield* parent["@@init@@"]()
        : yield* useScope();

      let initialized = withResolvers<Scope>();

      let task = yield* parentScope.spawn(function* () {
        scope = yield* useScope();
        for (let op of setup.all) {
          yield* op();
        }
        initialized.resolve(scope);
        yield* suspend();
      });

      adapter.destroy = () => run(task.halt);

      return yield* initialized.operation;
    },
  };

  return adapter;
}

function* box<T>(op: Operation<T>): Operation<Result<T>> {
  try {
    return Ok(yield* op);
  } catch (error) {
    return Err(error as Error);
  }
}
