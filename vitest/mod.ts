import { type TestAdapter, createTestAdapter } from "@effectionx/test-adapter";
import type { Operation } from "effection";

import * as vitest from "vitest";

function describeWithScope(
  name: string | Function,
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
  name: string | Function,
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

export function beforeEach(op: () => Operation<void>): void {
  vitest.beforeEach<{ task: { suite: { adapter: TestAdapter } } }>(
    (context) => {
      context.task.suite.adapter.addSetup(op);
    },
  );
}

export function it(
  desc: string,
  op?: () => Operation<void>,
  timeout?: number,
): void {
  if (op) {
    return vitest.it(
      desc,
      async (context) => {
        if (!(context?.task?.suite && "adapter" in context.task.suite)) {
          throw new Error("missing test adapter");
        }
        let adapter: TestAdapter = context.task.suite.adapter as TestAdapter;
        return await adapter.runTest(op);
      },
      timeout,
    );
  } else {
    return vitest.it.todo(desc);
  }
}

it.only = function only(
  desc: string,
  op?: () => Operation<void>,
  timeout?: number,
): void {
  if (op) {
    return vitest.it.only(
      desc,
      async (context) => {
        if (!(context?.task?.suite && "adapter" in context.task.suite)) {
          throw new Error("missing test adapter");
        }
        let adapter: TestAdapter = context.task.suite.adapter as TestAdapter;
        return await adapter.runTest(op);
      },
      timeout,
    );
  } else {
    return vitest.it.skip(desc, () => {});
  }
};

it.skip = function skip(
  desc: string,
  _op?: () => Operation<void>,
  _timeout?: number,
): void {
  return vitest.it.skip(desc, () => {});
};

export function* captureError<T>(op: Operation<T>): Operation<Error> {
  try {
    yield* op;
    throw new Error("expected operation to throw an error, but it did not!");
  } catch (error) {
    if (error instanceof Error) {
      return error;
    } else {
      return new Error(String(error));
    }
  }
}

export { assert, expect } from "vitest";
