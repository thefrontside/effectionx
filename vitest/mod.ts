import { type TestAdapter, createTestAdapter } from "@effectionx/test-adapter";
import type { Operation } from "effection";

import * as vitest from "vitest";

// biome-ignore lint/complexity/noBannedTypes: vitest.describe accepts Function as name
type DescribeName = string | Function;

function describeWithScope(
  name: DescribeName,
  factory?: vitest.SuiteFactory,
): vitest.SuiteCollector {
  return vitest.describe(name, (...args) => {
    vitest.beforeAll((suite) => {
      let parent = (suite.suite as unknown as { adapter?: TestAdapter })
        ?.adapter as TestAdapter | undefined;
      (suite as unknown as { adapter?: TestAdapter }).adapter =
        createTestAdapter({ name: String(name), parent });
    });

    vitest.afterAll(async (suite) => {
      await (suite as unknown as { adapter?: TestAdapter }).adapter?.destroy();
    });

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
    vitest.beforeAll((suite) => {
      let parent = (suite.suite as unknown as { adapter?: TestAdapter })
        ?.adapter as TestAdapter | undefined;
      (suite as unknown as { adapter?: TestAdapter }).adapter =
        createTestAdapter({ name: String(name), parent });
    });

    vitest.afterAll(async (suite) => {
      await (suite as unknown as { adapter?: TestAdapter }).adapter?.destroy();
    });

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
  vitest.beforeAll((suite) => {
    (suite as unknown as { adapter: TestAdapter }).adapter.addOnetimeSetup(op);
  });
}

export function beforeEach(op: () => Operation<void>): void {
  vitest.beforeAll((suite) => {
    (suite as unknown as { adapter: TestAdapter }).adapter.addSetup(op);
  });
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
