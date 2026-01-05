# Chain

There are some use-cases for Promise for which there is not a 1:1 analogue in
Effection. One of these is the "promise chaining" behavior of the `Promise`
constructor itself using `then()`, `catch()`, and `finally()`.

The chain package accomplishes this in a very similar way:

```ts
import { Chain } from "@effectionx/chain";

await main(function* () {
  let chain = new Chain<number>((resolve) => {
    resolve(10);
  });

  let result = yield* chain.then(function* (value) {
    return value * 2;
  });

  console.log(result); //=> 20;
});
```

Another is to share a promise in multiple places. For example this async data
call is used and re-used:

```ts
class Foo {
  data: Promise<number>;

  constructor() {
    this.data = (async () => 5)();
  }

  async getData() {
    return await this.data;
  }
}

const foo = new Foo();
console.log(await foo.getData());
```

This can be accomplished with Chain like so:

```ts
class Foo {
  data: Promise<number>;

  constructor() {
    let operation = (function* () {
      return 5;
    })();
    this.data = Chain.from(operation);
  }

  *getData() {
    return yield* this.data;
  }
}

const foo = new Foo();
console.log(yield * foo.getData());
```

---

```ts
import { Chain } from "@effectionx/chain";

await main(function* () {
  let chain = new Chain<number>((resolve) => {
    resolve(10);
  });

  let result = yield* chain.then(function* (value) {
    return value * 2;
  });

  console.log(result); //=> 20;
});
```
