import { createTestAdapter, type TestAdapter } from "@effectionx/test-adapter";
import type { Operation } from "effection";

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
  describe.only = $describe.only;

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
