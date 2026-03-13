import { type TestAdapter, createTestAdapter } from "@effectionx/test-adapter";
import type { Operation } from "effection";

import * as vitest from "vitest";

// biome-ignore lint/complexity/noBannedTypes: vitest.describe accepts Function as name
type DescribeName = string | Function;

/**
 * Internal type for a vitest Suite object augmented with an adapter property.
 * Used to store the TestAdapter on vitest's own per-describe suite objects,
 * which provides proper per-suite scoping without any module-level state.
 */
interface SuiteWithAdapter {
  adapter?: TestAdapter;
  suite?: SuiteWithAdapter;
}

/**
 * Create a hook callback compatible with both vitest 3 and vitest 4.
 *
 * Vitest 4 statically parses the callback's source text (via `.toString()`)
 * and requires the first parameter to use object destructuring syntax.
 * The suite object moved from the 1st argument (vitest 3) to the 2nd
 * argument (vitest 4).
 *
 * We override `.toString()` to report a destructuring signature that satisfies
 * vitest 4's parser, while the actual function accepts `(first, second)` and
 * resolves the suite from whichever position it appears in.
 */
function createHook(
  fn: (suite: SuiteWithAdapter) => void | Promise<void>,
): (...args: unknown[]) => void | Promise<void> {
  const hook = (first: unknown, second: unknown) => {
    const suite = (second ?? first) as SuiteWithAdapter;
    return fn(suite);
  };
  // Override toString so vitest 4's fixture argument parser sees a
  // destructuring pattern and skips fixture injection for this callback.
  hook.toString = () => "function({}){}";
  return hook;
}

function describeWithScope(
  name: DescribeName,
  factory?: vitest.SuiteFactory,
): vitest.SuiteCollector {
  return vitest.describe(name, (...args) => {
    // biome-ignore lint/suspicious/noExplicitAny: vitest 3/4 bridge
    (vitest.beforeAll as any)(
      createHook((suite) => {
        let parent = suite.suite?.adapter;
        suite.adapter = createTestAdapter({ name: String(name), parent });
      }),
    );

    // biome-ignore lint/suspicious/noExplicitAny: vitest 3/4 bridge
    (vitest.afterAll as any)(
      createHook(async (suite) => {
        await suite.adapter?.destroy();
      }),
    );

    if (factory && typeof factory === "function") {
      factory(...args);
    }
  });
}

describeWithScope.only = function describeWithScope(
  name: DescribeName,
  factory?: vitest.SuiteFactory,
): vitest.SuiteCollector {
  return vitest.describe.only(name, (...args) => {
    // biome-ignore lint/suspicious/noExplicitAny: vitest 3/4 bridge
    (vitest.beforeAll as any)(
      createHook((suite) => {
        let parent = suite.suite?.adapter;
        suite.adapter = createTestAdapter({ name: String(name), parent });
      }),
    );

    // biome-ignore lint/suspicious/noExplicitAny: vitest 3/4 bridge
    (vitest.afterAll as any)(
      createHook(async (suite) => {
        await suite.adapter?.destroy();
      }),
    );

    if (factory && typeof factory === "function") {
      factory(...args);
    }
  });
};
describeWithScope.skip = vitest.describe.skip;
describeWithScope.skipIf = (condition: unknown) =>
  condition ? describeWithScope.skip : describeWithScope;
describeWithScope.runIf = (condition: unknown) =>
  condition ? describeWithScope : describeWithScope.skip;

export const describe = <typeof vitest.describe>(<unknown>describeWithScope);

export function beforeAll(op: () => Operation<void>): void {
  // biome-ignore lint/suspicious/noExplicitAny: vitest 3/4 bridge
  (vitest.beforeAll as any)(
    createHook((suite) => {
      if (!suite.adapter) {
        throw new Error("missing test adapter");
      }
      suite.adapter.addOnetimeSetup(op);
    }),
  );
}

export function beforeEach(op: () => Operation<void>): void {
  // biome-ignore lint/suspicious/noExplicitAny: vitest 3/4 bridge
  (vitest.beforeAll as any)(
    createHook((suite) => {
      if (!suite.adapter) {
        throw new Error("missing test adapter");
      }
      suite.adapter.addSetup(op);
    }),
  );
}

export function it(
  desc: string,
  op?: () => Operation<void>,
  timeout?: number,
): void {
  if (op) {
    vitest.it(
      desc,
      async (context) => {
        if (!(context?.task?.suite && "adapter" in context.task.suite)) {
          throw new Error("missing test adapter");
        }
        let adapter: TestAdapter = context.task.suite.adapter as TestAdapter;
        let result = await adapter.runTest(op);
        if (!result.ok) {
          throw result.error;
        }
      },
      timeout,
    );
    return;
  }
  vitest.it.todo(desc);
}

it.only = function only(
  desc: string,
  op?: () => Operation<void>,
  timeout?: number,
): void {
  if (op) {
    vitest.it.only(
      desc,
      async (context) => {
        if (!(context?.task?.suite && "adapter" in context.task.suite)) {
          throw new Error("missing test adapter");
        }
        let adapter: TestAdapter = context.task.suite.adapter as TestAdapter;
        let result = await adapter.runTest(op);
        if (!result.ok) {
          throw result.error;
        }
      },
      timeout,
    );
    return;
  }
  vitest.it.skip(desc, () => {});
};

it.skip = function skip(
  desc: string,
  _op?: () => Operation<void>,
  _timeout?: number,
): void {
  vitest.it.skip(desc, () => {});
};

export function* captureError<T>(op: Operation<T>): Operation<Error> {
  try {
    yield* op;
    throw new Error("expected operation to throw an error, but it did not!");
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error));
  }
}

export { assert, expect } from "vitest";
