import { run } from "effection";
import { describe, it } from "@std/testing/bdd";
import { useStore } from "./mod.ts";
import { expect } from "@std/expect";

describe("StoreContext", () => {
  it("allows accessing context without initializing", async () => {
    let store;
    await run(function* () {
      store = yield* useStore();
    });
    expect(store).toBeDefined();
  });
});
