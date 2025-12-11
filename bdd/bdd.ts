import { createTestAdapter, type TestAdapter } from "@effectionx/test-adapter";
import type { Operation } from "effection";

/**
 * Test primitives interface that abstracts over platform-specific
 * test runners (Deno's @std/testing/bdd or Node's node:test).
 */
export interface TestPrimitives {
  describe: {
    (name: string, fn: () => void): void;
    skip: (name: string, fn: () => void) => void;
    only: (name: string, fn: () => void) => void;
  };
  it: {
    (name: string, fn: () => void | Promise<void>): void;
    skip: (name: string, fn: () => void) => void;
    only: (name: string, fn: () => void | Promise<void>) => void;
  };
  afterAll: (fn: () => void | Promise<void>) => void;
}

/**
 * BDD interface for Effection-based tests.
 */
export interface BDD {
  describe: {
    (name: string, body: () => void): void;
    skip: (name: string, fn: () => void) => void;
    only: (name: string, fn: () => void) => void;
  };
  it: {
    (desc: string, body?: () => Operation<void>): void;
    skip: (...args: Parameters<BDD["it"]>) => void;
    only: (desc: string, body: () => Operation<void>) => void;
  };
  beforeAll: (body: () => Operation<void>) => void;
  beforeEach: (body: () => Operation<void>) => void;
}

/**
 * Creates a BDD test interface using the provided test primitives.
 * This allows the BDD module to work with different test runners.
 */
export function createBDD(primitives: TestPrimitives): BDD {
  const { describe: $describe, it: $it, afterAll: $afterAll } = primitives;

  let current: TestAdapter | undefined;

  function describe(name: string, body: () => void) {
    const original = current;
    try {
      const child = current = createTestAdapter({ name, parent: original });

      $describe(name, () => {
        $afterAll(() => child.destroy());
        body();
      });
    } finally {
      current = original;
    }
  }

  describe.skip = $describe.skip;
  describe.only = function (name: string, fn: () => void): void {
    const original = current;
    try {
      const child = current = createTestAdapter({ name, parent: original });

      $describe.only(name, () => {
        $afterAll(() => child.destroy());
        fn();
      });
    } finally {
      current = original;
    }
  };

  function beforeAll(body: () => Operation<void>) {
    current?.addOnetimeSetup(body);
  }

  function beforeEach(body: () => Operation<void>) {
    current?.addSetup(body);
  }

  function it(desc: string, body?: () => Operation<void>): void {
    const adapter = current!;
    if (!body) {
      $it.skip(desc, () => {});
      return;
    }
    $it(desc, async () => {
      const result = await adapter.runTest(body);
      if (!result.ok) {
        throw result.error;
      }
    });
  }

  it.skip = (...args: Parameters<typeof it>): ReturnType<typeof it> => {
    const [desc] = args;
    return $it.skip(desc, () => {});
  };

  it.only = (desc: string, body: () => Operation<void>): void => {
    const adapter = current!;
    $it.only(desc, async () => {
      const result = await adapter.runTest(body);
      if (!result.ok) {
        throw result.error;
      }
    });
  };

  return { describe, it, beforeAll, beforeEach };
}
