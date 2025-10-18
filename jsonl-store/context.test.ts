import { describe, it } from "@effectionx/bdd";
import { useStore } from "./mod.ts";
import { expect } from "@std/expect";

describe("StoreContext", () => {
  it("allows accessing context without initializing", function* () {
    let store = yield* useStore();
    expect(store).toBeDefined();
  });
});
