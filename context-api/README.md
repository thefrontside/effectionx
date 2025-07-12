# Context Apis

Often called "Algebraic Effects" or "Contextual Effects", Context apis let you
access an operation via the context in a way that it can be easily (and
contextually) wrapped with middleware.

---

Let's say that you want to define a log operation that behaves differently in
different context. The basic form will just log values to the console.

```ts
// file logging.ts
import { createApi } from "@effectionx/context-api";

// create the `logging` api. By default, it just logs to the console.
const logging = createApi<Logging>(
  "logging",
  function* log(...values: unknown[]) {
    console.log(...values);
  },
);

// export the logging operations.
export const { log } = logging.operations;
```

Now you can use the logging api wherever you want:

```ts
import { log } from "./logging.ts";

export function* op() {
  yield* log(`I am in an operation`);
}
```

However, use can use the `around` function to wrap middleware around your
logging operation. This lets you do stuff like silence logging, or even to
re-route it somewhere else than from the `console` completely.

```ts
import { logging } from "./logging.ts";

function* initCustomLogging(externallogger) {
  yield* logging.around({
    *log(...values, next) {
      externalLogger.log(...values);
      // since we override the logger entirely, we do not invoke next.
    },
  });
}
```

The best part is that the middleware is only in effect inside the scope in which
it is installed.

Middleware can be useful for automatic instrumentation. For example, let's
assume that `fetch` was a an api called `fetching`:

```ts
import { fetch, fetching } from "./fetching.ts";

function* instrumentFetch(tracer) {
  yield* fetching.around({
    *fetch(...args, next) {
	  try {
	    tracer.begin("fetch", args),
		return yield* next(...args);
	  } finally {
	    tracer.end("fetch", args);
	  }
	}
  })
}
```

or mocking inside test cases:

```ts
import { fetch, fetching } from "./fetching.ts";

function* useMocks() {
  yield* fetching.around({
    *fetch(...args, next) {
      if (args[0] === "/my-path") {
        return new MockResponse("my-path");
      } else {
        return yield* next(...args);
      }
    },
  });
}
```
