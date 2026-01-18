# Vitest

Adapter to add an effection scope to the test suite to allow writing a
`function* () {}` test function.

---

```ts
import {
  assert,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "@effectionx/vitest";

describe("suite name", () => {
  let connection: Connection;

  beforeAll(function* () {
    // Runs once before all tests in this suite
    connection = yield* connectToDatabase();
  });

  beforeEach(function* () {
    // Runs before each test
    yield* connection.clear();
  });

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
