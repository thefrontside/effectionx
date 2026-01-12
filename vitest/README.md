# Vitest

Adapter to add an effection scope to the test suite to allow writing a
`function* () {}` test function.

---

```ts
import { assert, describe, expect, it } from "@effectionx/vitest";

describe("suite name", () => {
  it("foo", function* () {
    const thing = yield* otherThing();
    assert.equal(Math.sqrt(4), thing);
  });

  it("bar", function* () {
    const thing = yield* otherThing();
    expect(1 + 1).eq(thing);
  });

  it("snapshot", function* () {
    const thing = yield* otherThing();
    expect(thing).toMatchSnapshot();
  });
});
```
