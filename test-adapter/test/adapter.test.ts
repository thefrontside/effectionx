import { expect } from "expect";
import { describe, it } from "node:test";
import { createContext, resource } from "effection";
import { createTestAdapter } from "../mod.ts";

describe("TestAdapter", () => {
  it("can run a test", async () => {
    let adapter = createTestAdapter();
    let result = "pending";
    await adapter.runTest(function* () {
      result = "done";
    });

    expect(result).toEqual("done");
  });
  it("runs hierarchical setup within a scope", async () => {
    let count = createContext<number>("count", 1);

    function* update() {
      let current = yield* count.expect();
      yield* count.set(current * 2);
    }
    let grandparent = createTestAdapter({ name: "grandparent" });
    let parent = createTestAdapter({ name: "parent", parent: grandparent });
    let child = createTestAdapter({ name: "child", parent });

    grandparent.addSetup(update);
    parent.addSetup(update);
    child.addSetup(update);

    await child.runTest(function* () {
      expect(yield* count.expect()).toEqual(8);
    });
  });

  it("has one time setup", async () => {
    let grandparent = createTestAdapter({ name: "grandparent" });

    let context = createContext<string>("context", "uninitialized");

    let sequence: string[] = [];
    let contexts: Record<string, string> = {};

    grandparent.addOnetimeSetup(function* () {
      yield* context.set("initialized");

      yield* resource<void>(function* (provide) {
        try {
          sequence.push("grandparent/setup:once");
          yield* provide();
        } finally {
          sequence.push("grandparent/teardown:once");
        }
      });
    });

    grandparent.addSetup(function* () {
      yield* resource<void>(function* (provide) {
        try {
          sequence.push("grandparent/setup:each");
          yield* provide();
        } finally {
          sequence.push("grandparent/teardown:each");
        }
      });
    });

    let parent = createTestAdapter({ name: "parent", parent: grandparent });

    parent.addOnetimeSetup(() =>
      resource<void>(function* (provide) {
        try {
          sequence.push("parent/setup:once");
          contexts.parent = yield* context.expect();
          yield* provide();
        } finally {
          sequence.push("parent/teardown:once");
        }
      }),
    );

    parent.addSetup(() =>
      resource(function* (provide) {
        try {
          sequence.push("parent/setup:each");
          yield* provide();
        } finally {
          sequence.push("parent/teardown:each");
        }
      }),
    );

    let first = createTestAdapter({ name: "child", parent });

    let result = await first.runTest(function* () {
      sequence.push("first-child/run");
      contexts["first-child/run"] = yield* context.expect();
    });

    if (!result.ok) {
      throw result.error;
    }

    let second = createTestAdapter({ name: "child", parent });

    result = await second.runTest(function* () {
      sequence.push("second-child/run");
      contexts["second-child/run"] = yield* context.expect();
    });

    if (!result.ok) {
      throw result.error;
    }

    await grandparent.destroy();

    expect(sequence).toEqual([
      "grandparent/setup:once",
      "parent/setup:once",
      "grandparent/setup:each",
      "parent/setup:each",
      "first-child/run",
      "parent/teardown:each",
      "grandparent/teardown:each",
      "grandparent/setup:each",
      "parent/setup:each",
      "second-child/run",
      "parent/teardown:each",
      "grandparent/teardown:each",
      "parent/teardown:once",
      "grandparent/teardown:once",
    ]);

    expect(contexts).toEqual({
      parent: "initialized",
      "first-child/run": "initialized",
      "second-child/run": "initialized",
    });
  });

  it("can run multiple tests", async () => {});
});
