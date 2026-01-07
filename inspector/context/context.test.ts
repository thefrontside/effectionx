import { describe, it } from "@effectionx/bdd";
import { expect } from "@std/expect";
import { watch } from "./implementation.ts";
import { sleep, spawn, suspend, useScope } from "effection";

describe("watchContextTree()", () => {
  it("emits initial value and subsequent changes", function* () {
    const handle = yield* watch.attach();
    const sub = yield* handle.invoke({
      name: "watchContextTree",
      args: [],
    });

    console.log("sub ->", sub);
    const first = yield* sub.next();
    console.log("first ->", first);
    expect(first.done).toBe(false);
    expect(first.value.children.length).toBe(0);

    console.log("spawning");
    // will end up creating a new scope
    yield* spawn(function* () {
      yield* sleep(10);
      yield* suspend();
    });

    // pause to allow async to start
    yield* sleep(10);

    console.log("waiting for second");
    const second = yield* sub.next();
    expect(second.done).toBe(false);
    expect(JSON.stringify(second.value)).toContain('"counter":1');
  });
});
