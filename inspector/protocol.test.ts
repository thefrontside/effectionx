import { describe, it } from "@effectionx/bdd";
import { expect } from "@std/expect";
import type { Methods } from "./lib/types.ts";
import { scope } from "arktype";

import { createProtocol } from "./lib/mod.ts";

describe("createProtocol()", () => {
  it("returns a protocol object containing the provided methods", function* () {
    const schema = scope({ None: "never[]" }).export();

    const methods: Methods = {
      foo: { args: schema.None, progress: schema.None, returns: schema.None },
    };
    const protocol = createProtocol(methods);

    expect(protocol.methods).toBe(methods);
  });
});
