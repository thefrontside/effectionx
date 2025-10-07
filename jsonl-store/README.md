# JSONL Streaming Store

JSONL Streaming Store provides an easy way to store documents in JSONL files.
This is useful when you need cache responses from HTTP requests for later
processing. This API focuses on providing streaming APIs for working with the
contents of the store with a glob selector syntax for choosing which files to
read.

---

## Getting Started

You can use the default store client which will write store to
`join(import.meta.dirname ?? Deno.cwd(), ".store")`.

```ts
import { run } from "npm:effection@^3";
import { useStore } from "jsr:@effectionx/jsonl-store";

await run(function* () {
  const store = yield* useStore();

  console.log(store.location); // output store location
});
```

## Custom location

You can create a custom store location by using `JSONLStore.from` function. It
ensures that you do not forget to add a trailing forward slash to the path.

```ts
import { run } from "npm:effection@^3";
import {
  JSONLStore,
  StoreContext,
  useStore,
} from "jsr:@effectionx/jsonl-store";

await run(function* () {
  const store = JSONLStore.from({
    location: `file://absolute/path/to/the/location/`,
  });
  yield* StoreContext.set(store);
});
```

## Writing and appending to store

You can write to the store at a given key and append to the same key.

```ts
import { run } from "npm:effection@^3";
import { useStore } from "jsr:@effectionx/jsonl-store";

await run(function* () {
  const store = yield* useStore();

  yield* store.write("greeting", "hello world!");
  yield* store.append("greeting", "another greeting!");
  yield* store.append("greeting", "yet another!");
});
```

`greeting` is the key and `hello world!` is the value. The value will be
serialized to JSON on write - you do not need to worry about it. Appending
content to the same file makes it easy to collocate relevant entities.

## Reading

Reading values from a key produces a stream of all values from the given key.

```ts
import { run } from "npm:effection@^3";
import { useStore } from "jsr:@effectionx/jsonl-store";

await run(function* () {
  const store = yield* useStore();

  for (const item of yield* each(store.read<string>("greeting"))) {
    console.log(item);
    yield* each.next();
  }
});
```
