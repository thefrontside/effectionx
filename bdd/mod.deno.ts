import { createTestAdapter, type TestAdapter } from "@effectionx/test-adapter";
import type { Operation } from "effection";
import {
  afterAll as $afterAll,
  describe as $describe,
  it as $it,
} from "@std/testing/bdd";

/**
 * Sanitization options for test cases and test suites.
 * These options control Deno's test sanitizers.
 */
export interface SanitizeOptions {
  /** Ensure the test case does not prematurely cause the process to exit. Defaults to true. */
  sanitizeExit?: boolean;
  /** Check that the number of async completed ops after the test is the same as number of dispatched ops. Defaults to true. */
  sanitizeOps?: boolean;
  /** Ensure the test case does not "leak" resources - ie. the resource table after the test has exactly the same contents as before the test. Defaults to true. */
  sanitizeResources?: boolean;
}

let current: TestAdapter | undefined;

export function describe(
  name: string,
  body: () => void,
  options?: SanitizeOptions,
) {
  const original = current;
  try {
    const child = (current = createTestAdapter({ name, parent: original }));

    $describe({
      name,
      fn: () => {
        $afterAll(() => child.destroy());
        body();
      },
      ...options,
    });
  } finally {
    current = original;
  }
}

describe.skip = $describe.skip;
describe.only = (
  name: string,
  body: () => void,
  options?: SanitizeOptions,
): void => {
  const original = current;
  try {
    const child = (current = createTestAdapter({ name, parent: original }));

    $describe.only({
      name,
      fn: () => {
        $afterAll(() => child.destroy());
        body();
      },
      ...options,
    });
  } finally {
    current = original;
  }
};

export function beforeAll(body: () => Operation<void>) {
  current?.addOnetimeSetup(body);
}

export function beforeEach(body: () => Operation<void>) {
  current?.addSetup(body);
}

export function it(
  desc: string,
  body?: () => Operation<void>,
  options?: SanitizeOptions,
): void {
  const adapter = current!;
  if (!body) {
    $it.skip(desc, () => {});
    return;
  }
  $it({
    name: desc,
    fn: async () => {
      const result = await adapter.runTest(body);
      if (!result.ok) {
        throw result.error;
      }
    },
    ...options,
  });
}

it.skip = (...args: Parameters<typeof it>): ReturnType<typeof it> => {
  const [desc] = args;
  return $it.skip(desc, () => {});
};

it.only = (
  desc: string,
  body: () => Operation<void>,
  options?: SanitizeOptions,
): void => {
  const adapter = current!;
  $it.only({
    name: desc,
    fn: async () => {
      const result = await adapter.runTest(body);
      if (!result.ok) {
        throw result.error;
      }
    },
    ...options,
  });
};
