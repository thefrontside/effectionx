# Test Adapter

An abstract helper for integrating Effection with testing frameworks.

---

Typically, you won't use this module directly, but instead you'll use one of the
actual testing framework integrations. The following shows how you might
integrate it with the `@std/bdd` module. You would never use it this way, this
demonstrates the general pattern of lifecycle.

```ts
import { run, sleep } from "effection";
import { createTestAdapter, TestAdapter } from "@effectionx/test-adapter";
import { describe, it, beforeEach } from "@std/bdd";


describe("something", () => {
  let adapter: TestAdapter;
  beforeAll(() => {)
    adapter = createTestAdapter("something");
  });
  
  afterAll(() => adapter.destroy())
  
  adapter.addSetup(function*() {
    /* do some setup. equivalent of beforeEach() */
	/* contexts set here will be visible in the test */
  });
  
  adapter.addOnetimeSetup(function*() {
    /* do some setup that will only happen once. equivalent of beforeAll() */
	/* contexts set here will be visible in the test */
  });

  it("does a thing", async () => {
    await adapter.runTest(function*() {
	  /* ... the body of the test */
	});
  });

});
```
