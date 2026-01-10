import { describe, it } from "@effectionx/bdd";
import { expect } from "@std/expect";
import type { Stream } from "effection";
import { scope } from "arktype";
import type { Method } from "./lib/types.ts";

import { createImplementation, createProtocol } from "./lib/mod.ts";

describe("createImplementation()", () => {
  it("attach yields a handle with protocol and methods and invoke calls the method", function* () {
    type EchoMethod = { echo: Method<never[], never, string> };

    const schema = scope({
      NoneArr: "never[]",
      None: "never",
      Str: "string",
    }).export();

    const protocolMethods: EchoMethod = {
      echo: {
        args: schema.NoneArr,
        progress: schema.None,
        returns: schema.Str,
      },
    };

    const protocol = createProtocol(protocolMethods);

    const inspector = createImplementation(protocol, function* () {
      return {
        *echo(): Stream<never, string> {
          return {
            *next() {
              return { done: true, value: "hello" };
            },
          };
        },
      };
    });

    const handle = yield* inspector.attach();

    // ensure protocol and methods exist
    expect(handle.protocol).toBe(protocol);
    expect(typeof handle.methods.echo).toBe("function");

    // invoke the method and read the stream result
    const stream = handle.invoke({ name: "echo", args: [] });
    const sub = yield* stream;
    const next = yield* sub.next();
    expect(next).toEqual({ done: true, value: "hello" });
  });
});
