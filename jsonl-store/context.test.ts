import { describe, it } from "@effectionx/vitest";
import { useStore } from "./mod.ts";
import { expect } from "expect";

describe("StoreContext", () => {
  it("allows accessing context without initializing", function* () {
    let store = yield* useStore();
    expect(store).toBeDefined();
  });
});
