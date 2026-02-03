import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { combine, createImplementation, createProtocol } from "../lib/mod.ts";
import { scope } from "arktype";
import type { Stream } from "effection";
import type { Method } from "../lib/types.ts";

describe("combine", () => {
  it("combines protocols methods", function* () {
    type AMethods = { a: Method<never[], never, string> };
    type BMethods = { b: Method<never[], never, string> };

    const schema = scope({
      NoneArr: "never[]",
      None: "never",
      Str: "string",
    }).export();

    const aMethods: AMethods = {
      a: { args: schema.NoneArr, progress: schema.None, returns: schema.Str },
    };
    const bMethods: BMethods = {
      b: { args: schema.NoneArr, progress: schema.None, returns: schema.Str },
    };

    const a = createProtocol(aMethods);
    const b = createProtocol(bMethods);

    const combined = combine.protocols(a, b);
    expect(Object.keys(combined.methods).sort()).toEqual(["a", "b"]);
  });

  it("combines inspectors and their attach results", function* () {
    type AMethods = { a: Method<never[], never, string> };
    type BMethods = { b: Method<never[], never, string> };

    const schema = scope({
      NoneArr: "never[]",
      None: "never",
      Str: "string",
    }).export();

    const aProtoMethods: AMethods = {
      a: { args: schema.NoneArr, progress: schema.None, returns: schema.Str },
    };
    const bProtoMethods: BMethods = {
      b: { args: schema.NoneArr, progress: schema.None, returns: schema.Str },
    };

    const aProto = createProtocol(aProtoMethods);
    const bProto = createProtocol(bProtoMethods);

    const aIns = createImplementation(aProto, function* () {
      return {
        *a(): Stream<never, string> {
          return {
            *next() {
              return { done: true, value: "A" };
            },
          };
        },
      };
    });

    const bIns = createImplementation(bProto, function* () {
      return {
        *b(): Stream<never, string> {
          return {
            *next() {
              return { done: true, value: "B" };
            },
          };
        },
      };
    });

    const combined = combine.inspectors(aIns, bIns);
    const handle = yield* combined.attach();

    expect(Object.keys(handle.protocol.methods).sort()).toEqual(["a", "b"]);

    const aStream = handle.invoke({ name: "a", args: [] });
    const aSub = yield* aStream;
    const aNext = yield* aSub.next();
    expect(aNext).toEqual({ done: true, value: "A" });

    const bStream = handle.invoke({ name: "b", args: [] });
    const bSub = yield* bStream;
    const bNext = yield* bSub.next();
    expect(bNext).toEqual({ done: true, value: "B" });
  });
});
