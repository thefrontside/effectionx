# Web Worker

Easily use Web Workers to offload CPU-intensive computations or manage external
processes. A library for seamlessly integrating [Web Workers][Web Workers] with
Effection programs.

---

This package provides two functions. {@link useWorker} used in the main thread
to start and establish communication with the worker. {@link workerMain} used in
the worker script to invoke a worker function and send data back to the main
thread.

## Features

- Establishes two-way communication between the main and the worker threads
- Gracefully shutdowns the worker from the main thread
- Propagates errors from the worker to the main thread
- Type-safe message handling with TypeScript
- Supports worker-initiated requests handled by the host

## Usage: Get worker's return value

The return value of the worker is the return value of the function passed to
`workerMain`.

### Worker thread

```ts
import { workerMain } from "@effectionx/worker";

await workerMain<number, number, number, number>(function* fibonacci({
  data: n, // data sent to the worker from the main thread
}) {
  if (n <= 1) return n;

  let a = 0,
    b = 1;
  for (let i = 2; i <= n; i++) {
    let temp = a + b;
    a = b;
    b = temp;
  }

  return b;
});
```

### Main Thread

You can easily retrieve this value from the worker object returned by
`useWorker` function in the main thread.

```ts
import { run } from "effection";
import { useWorker } from "@effectionx/worker";

await run(function* () {
  const worker = yield* useWorker<number, number, number, number>(
    "./fibonacci.ts",
    {
      type: "module",
      data: 5, // data is passed to the operation function (can be any serializable value)
    },
  );

  const result = yield* worker; // wait for the result to receive the result

  console.log(result); // Output: 5
});
```

### Error handling

Errors thrown in the function passed to `workerMain` can be captured in the main
thread by wrapping `yield* worker` in a `try/catch` block;

```ts
try {
  const result = yield * worker;

  console.log(result);
} catch (e) {
  console.error(e); // error will be available here
}
```

## Usage: Worker-initiated requests

Workers can initiate requests to the host using the `send` function provided to
`workerMain`. The host handles these requests with `worker.forEach`, returning a
response for each request.

### Worker Thread

```ts
import { workerMain } from "@effectionx/worker";

await workerMain<never, never, string, void, string, string>(
  function* ({ send }) {
    const response = yield* send("hello");
    return `received: ${response}`;
  },
);
```

### Main Thread

```ts
import { run } from "effection";
import { useWorker } from "@effectionx/worker";

await run(function* () {
  const worker = yield* useWorker<never, never, string, void>(
    "./worker.ts",
    { type: "module" },
  );

  const result = yield* worker.forEach<string, string>(function* (request) {
    return `echo: ${request}`;
  });

  console.log(result); // Output: received: echo: hello
});
```

### Notes

- Only one `forEach` can be active at a time; concurrent calls throw.
- Requests are queued until `forEach` is called.
- Errors are serialized and rethrown on the caller side.

## Usage: Sending messages to the worker

The worker can respond to incoming messages using `forEach` function provided by
the `messages` object passed to the `workerMain` function.

### Worker Thread

```ts
import { workerMain } from "../worker.ts";

await workerMain<number, number, void, number>(function* ({ messages, data }) {
  let counter = data;

  yield* messages.forEach(function* (message) {
    counter += message;
    return counter;
  });

  return counter;
});
```

### Main Thread

The main thread can send messages to the worker using the `send` method on the
object returned by `useWorker`. Effection will wait for the value to be returned
from the worker before continuing.

```ts
import { run } from "effection";
import { useWorker } from "@effectionx/worker";

await run(function* () {
  const worker = yield* useWorker<number, number, number, number>(
    "./counter-worker.ts",
    {
      type: "module",
      data: 5, // initial value (can be any serializable value)
    },
  );

  console.log(yield* worker.send(5)); // Output 10

  console.log(yield* worker.send(10)); // Output: 20

  console.log(yield* worker.send(-5)); // Output: 15
});
```

### Error Handling

You can catch error thrown while computing result for a message by wrapping
`yield* wrapper.send()` in a `try`/`catch`.

```ts
try {
  console.log(yield * worker.send(5)); // Output 10
} catch (e) {
  console.error(e); // error will be available here
}
```

[Web Workers]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
