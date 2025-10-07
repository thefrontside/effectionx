import { createTestAdapter, type TestAdapter } from "@effectionx/test-adapter";
import type { Operation } from "effection";
import {
  afterAll as $afterAll,
  describe as $describe,
  it as $it,
} from "@std/testing/bdd";

let current: TestAdapter | undefined;

export function describe(name: string, body: () => void) {
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

export function beforeAll(body: () => Operation<void>) {
  current?.addOnetimeSetup(body);
}

export function beforeEach(body: () => Operation<void>) {
  current?.addSetup(body);
}

export function it(desc: string, body?: () => Operation<void>): void {
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
