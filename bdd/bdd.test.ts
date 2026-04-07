import { describe, it } from "@effectionx/bdd";
import { sleep } from "effection";

describe("@effectionx/bdd", () => {
  it("should run basic test", function* () {
    // passes
  });

  it("should support Effection operations", function* () {
    yield* sleep(1);
  });
});
