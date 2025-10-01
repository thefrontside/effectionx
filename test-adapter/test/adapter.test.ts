import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { createContext, resource } from "effection";
import { createTestAdapter } from "../mod.ts";

describe("TestAdapter", () => {
  it("can run a test", async () => {
    let adapter = createTestAdapter();
    let result: string = "pending";
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
      sequence.push("grandparent/setup:each");
    });

    let parent = createTestAdapter({ name: "parent", parent: grandparent });

    parent.addOnetimeSetup(() =>
      resource<void>(function* (provide) {
        try {
          sequence.push("parent/setup:once");
          contexts["parent"] = yield* context.expect();
          yield* provide();
        } finally {
          sequence.push("parent/teardown:once");
        }
      })
    );

    let child = createTestAdapter({ name: "child", parent });

    await child.runTest(function* () {
      sequence.push("child/run");
      contexts["child"] = yield* context.expect();
    });

    await grandparent.destroy();

    expect(sequence).toEqual([
      "grandparent/setup:once",
      "parent/setup:once",
      "grandparent/setup:each",
      "child/run",
      "parent/teardown:once",
      "grandparent/teardown:once",
    ]);

    expect(contexts).toEqual({ parent: "initialized", child: "initialized" });
  });
});
