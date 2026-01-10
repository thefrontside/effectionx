import type { Implementation } from "./lib/types.ts";
import { scope } from "arktype";
import type { Method } from "./lib/types.ts";

// This file is a compile-time (type-level) test to ensure that
// `createImplementation` enforces the method signatures described by the
// protocol (i.e. the `Implementation<M>` type). If the types below do not
// conform, the TypeScript type-check will fail when running `deno test`.

const _schema = scope({
  Args: "string[]",
  Obj: { greeting: "string" },
}).export();

type FooMethods = { greet: Method<[string], never, { greeting: string }> };

// This implementation must match `Implementation<FooMethods>` exactly. If it
// doesn't, the type-check will fail and indicate a problem in the typings.
const _impl: Implementation<FooMethods> = function* () {
  return {
    *greet(name: string) {
      return {
        *next() {
          return { done: true, value: { greeting: `hello ${name}` } };
        },
      };
    },
  };
};

export {};
