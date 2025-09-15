import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { createTestAdapter } from "../mod.ts";
import { createContext } from "effection";

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
});
