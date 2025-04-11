# RAF: Request Animation Frame

Subscribe to a stream of Request Animation Frame updates with an Effection
resource.

---

```ts
import { each, main, suspend } from "effection";
import { raf } from "@effectionx/raf";

await main(function* () {
  for (const frame of yield* each(raf)) {
    console.log(frame);
    yield* each.next();
  }

  yield* suspend();
});
```
