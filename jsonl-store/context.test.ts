import { run } from "effection";
import { describe, it } from "jsr:@std/testing@1.0.5/bdd";
import { useStore } from "./mod.ts";
import { expect } from "expect/expect";

describe("StoreContext", () => {
  it("allows accessing context without initializing", async () => {
    let store;
    await run(function* () {
      store = yield* useStore();
    });
    expect(store).toBeDefined();
  });
});
