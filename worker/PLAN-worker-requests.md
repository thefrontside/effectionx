# Plan: Worker-Initiated Requests for `@effectionx/worker`

## Context

### Repository Location
`~/Repositories/frontside/effectionx/worker/`

### What is `@effectionx/worker`?

A library for integrating Web Workers with Effection's structured concurrency model. It provides:
- `useWorker()` - host-side function to create and communicate with a worker
- `workerMain()` - worker-side function to handle communication with the host

### Current Architecture

**Host → Worker communication (existing):**
```
Host                                    Worker
────                                    ──────
worker.send(value)
  creates MessageChannel
  posts { type: "send", value, response: port2 }
  waits on port1                  ───►  receives via messages.forEach
                                        spawns task to handle
                                        fn(value) returns result
                                  ◄───  response.postMessage(Ok(result))
  returns result
```

Each request gets its own MessageChannel - correlation is by port, no IDs needed.

### Current File Structure

```
worker/
├── mod.ts              # Exports
├── types.ts            # Type definitions
├── worker.ts           # Host-side: useWorker()
├── worker-main.ts      # Worker-side: workerMain()
├── message-channel.ts  # MessageChannel resource helper
├── worker.test.ts      # Tests
├── test-assets/        # Test worker files
│   ├── echo-worker.ts
│   ├── counter-worker.ts
│   ├── boom-worker.ts
│   └── ...
└── README.md
```

### Key Existing Types (`types.ts`)

```typescript
export type WorkerControl<TSend, TData> =
  | { type: "init"; data: TData }
  | { type: "send"; value: TSend; response: MessagePort }
  | { type: "close" };

export interface WorkerMainOptions<TSend, TRecv, TData> {
  messages: WorkerMessages<TSend, TRecv>;
  data: TData;
}

export interface WorkerMessages<TSend, TRecv> {
  forEach(fn: (message: TSend) => Operation<TRecv>): Operation<void>;
}
```

### Key Existing Interfaces (`worker.ts`)

```typescript
export interface WorkerResource<TSend, TRecv, TReturn> extends Operation<TReturn> {
  send(data: TSend): Operation<TRecv>;
}
```

### Why This Change is Needed

The current library only supports **host-initiated** communication. The host calls `worker.send()`, the worker responds.

We need **worker-initiated** communication for use cases like tool sessions where:
- A tool runs in a worker
- The tool needs to send requests to the host (e.g., "sample from LLM", "elicit user input")
- The host handles these requests and sends responses back
- The tool continues execution with the response

This is for the `@sweatpants` framework which uses a Principal/Operative architecture:
- **Principal** initiates requests, receives responses
- **Operative** receives requests, sends responses
- Communication is **Principal-driven** (no unsolicited messages from Operative)

When running tools in workers:
- Worker (tool) is the **Principal** - initiates sample/elicit requests
- Host is the **Operative** - handles requests, returns responses

### Effection Patterns to Follow

From the [Effection AGENTS.md](https://github.com/thefrontside/effection/blob/v4/AGENTS.md):

1. **Operations are lazy** - they execute only when yielded
2. **`spawn()` returns an Operation** - must `yield* spawn(...)` to start work
3. **`each()` pattern** - must call `yield* each.next()` at end of every iteration
4. **Signals for callbacks** - use `Signal` to bridge from sync callbacks into Effection
5. **Channels for operations** - use `Channel` for communication between operations
6. **`withResolvers()`** - creates an operation plus resolve/reject functions

---

## Goal

Add support for workers to send requests to the host and receive responses, using a symmetric API that mirrors the existing `messages.forEach` pattern.

---

## API Design

> Reviewer note: comments below are from a fresh review pass and call out remaining gaps/clarifications to resolve before implementation.

---

## Resolutions to Reviewer Comments

### R1: WorkerToHost Type

**Issue:** `WorkerControl` is host→worker only. Need a separate type for worker→host messages.

**Resolution:** Add a new type in `types.ts`:

```typescript
export type WorkerToHost<TRequest, TReturn> =
  | { type: "open" }
  | { type: "request"; value: TRequest; response: MessagePort }
  | { type: "close"; result: Result<TReturn> };
```

This mirrors `WorkerControl` but for the opposite direction.

> Reviewer note: clarify whether the `{ type: "open" }` message is required (and when it is sent/consumed). It is introduced here but not referenced in later phases/tests.

**Clarification:** The `{ type: "open" }` message is **existing behavior**, not new. The worker already sends it on startup (`worker-main.ts:153`) and the host already expects it (`worker.ts:102-105`). It's included in `WorkerToHost` for type completeness only - no new implementation needed.

---

### R2: Error Serialization with Cause

**Issue:** `Error` objects aren't structured-clone safe across the MessagePort.

**Resolution:** Serialize errors before `postMessage`, then wrap in a new Error with `cause` on the receiving side:

```typescript
// Serialization format
interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

// Sending side (serialize before postMessage):
response.postMessage(Err({
  name: error.name,
  message: error.message,
  stack: error.stack
}));

// Receiving side (wrap with cause):
const serialized = result.error as SerializedError;
throw new Error(`Host handler failed: ${serialized.message}`, {
  cause: serialized  // Original error data available via error.cause
});
```

**Rationale:** Error classes (TypeError, RangeError, etc.) are only meaningful in the context where they're created. Wrapping in a new Error with `cause` follows modern JavaScript error chaining patterns and provides:
1. A proper `Error` instance to throw/catch
2. A meaningful message in the current context
3. Access to all original error data via `error.cause`

This pattern applies to both directions:
- Host→Worker: When host handler throws, worker receives wrapped error
- Worker→Host: When worker handler throws (existing `messages.forEach`), host receives wrapped error

> Reviewer note: ensure `errorFromSerialized` is used for all inbound errors (host `send()` responses and worker `close` results) so the error shape is consistent.

**Clarification:** Yes, `errorFromSerialized` will be used consistently for all inbound errors:
- Host `send()` responses when worker handler throws (existing code path at `worker.ts:136`)
- Worker `close` results with errors
- Worker receiving errors from host `forEach` handlers

---

### R3: MessagePort Cleanup

**Issue:** Ports should be closed after response to prevent leaks.

**Resolution:** Both sides close ports after use:

```typescript
// Worker side (in send function, after receiving response):
channel.port1.close();

// Host side (in forEach handler, after sending response):
msg.response.close();
```

---

### R4: Request Queueing

**Issue:** What happens if worker sends requests before host calls `worker.forEach()`?

**Decision:** Queue requests until `forEach` is called (unbounded queue).

**Resolution:** The host-side message subscription is already running. Buffer `"request"` messages in an array. When `forEach` is called, drain the buffer first, then continue processing live requests.

> Reviewer note: add a test that sends a request before `worker.forEach()` is called to lock in queueing behavior.

**Test coverage:** Test 11 will verify queueing behavior by having the host delay `forEach` slightly to ensure the worker's request is queued first.

> Reviewer note: call out the unbounded queue risk in the README behavior contract (even if it is acceptable) so users know this can grow without backpressure.

**README note:** The behavior contract will explicitly mention that the queue is unbounded and can grow without backpressure if workers send many requests before `forEach` is called.

**Rationale:** This is more forgiving and matches how `messages.forEach` works on the worker side. Workers typically don't spam requests, so an unbounded queue is acceptable.

---

### R5: In-Flight Requests on Close

**Issue:** What if worker sends `close` while host is still handling a request?

**Decision:** Worker cannot close until all its requests are completed.

**Resolution:** This is naturally enforced by the design:

1. `yield* send(...)` blocks until response is received
2. Worker body cannot return/complete while blocked on `send()`
3. Worker only sends `close` after body completes
4. Therefore, by the time host receives `close`, all handlers have already responded

For concurrent requests via `all([send(1), send(2), ...])`, the same applies - `all()` doesn't complete until all operations complete.

No additional implementation needed - the blocking nature of `send()` guarantees this behavior.

---

### R6: Concurrent forEach Calls

**Issue:** What if host calls `forEach` multiple times concurrently?

**Decision:** Throw if `forEach` is called while already in progress.

**Resolution:** Add a flag to track state with proper cleanup:

```typescript
let forEachInProgress = false;

*forEach<TRequest, TResponse>(fn) {
  // Check closed FIRST, before setting flag (avoids permanent lock on closed worker)
  if (closed) {
    return yield* outcome.operation;
  }
  
  if (forEachInProgress) {
    throw new Error("forEach is already in progress");
  }
  forEachInProgress = true;
  
  try {
    // ... loop implementation
  } finally {
    forEachInProgress = false;  // Always reset, even on error
  }
}
```

**Rationale:** 
- Check `closed` before setting flag to avoid permanently locking `forEach` on a closed worker
- Use `try/finally` to ensure flag is reset even if handler throws
- Clear contract prevents confusion from concurrent calls

> Reviewer note: ensure `forEachInProgress` is reset in a `finally` block so a failure doesn't permanently block subsequent calls.

**Resolution:** Addressed above - `try/finally` ensures cleanup.

> Reviewer note: also reset `forEachInProgress` when `closed` is detected before entering the loop, otherwise a closed worker could permanently lock `forEach` if the flag is set.

**Resolution:** Addressed above - check `closed` before setting `forEachInProgress`.

---

### R7: README Behavior Contract

**Issue:** Document the behavioral contracts so users know what to expect.

**Resolution:** Add a "Behavior Contract" section to README covering:

- **Request queueing:** Requests sent before `forEach()` is called are queued and processed once `forEach()` starts. **Note:** The queue is unbounded - if workers send many requests before `forEach` is called, memory usage will grow without backpressure.
- **Error format:** Errors are serialized as `{ name, message, stack }` and wrapped with `cause` on receiving side
- **Close semantics:** Worker cannot close until all `send()` calls have received responses (enforced by blocking `send()`)
- **Concurrent forEach:** Only one `forEach()` call allowed at a time (throws otherwise)
- **Idempotency:** Both `yield* worker` and `yield* worker.forEach(fn)` return cached result after completion

---

### API Symmetry

| Side | Send to other side | Handle from other side |
|------|-------------------|------------------------|
| **Host** | `worker.send(msg)` | `worker.forEach(fn)` → returns `TReturn` |
| **Worker** | `send(msg)` | `messages.forEach(fn)` |

### Type Parameters

| Function | Type Parameters | Notes |
|----------|-----------------|-------|
| `useWorker` | 4: `TSend, TRecv, TReturn, TData` | Unchanged, backward compatible |
| `worker.forEach` | 2: `TRequest, TResponse` | Types specified at call site |
| `workerMain` | 6: `TSend, TRecv, TReturn, TData, TRequest, TResponse` | `send` used throughout body |

### Host Usage

```typescript
const worker = yield* useWorker<HostMsg, HostResp, Result, InitData>(url, opts);

// Option A: Handle worker requests, get result when done
const result = yield* worker.forEach<WorkerRequest, WorkerResponse>(function* (request) {
  return response;
});

// Option B: Just wait for result (worker sends no requests)
const result = yield* worker;
```

Both `yield* worker` and `yield* worker.forEach(fn)` return `TReturn`.

### Worker Usage

```typescript
await workerMain<HostMsg, HostResp, Result, InitData, WorkerRequest, WorkerResponse>(
  function* ({ messages, data, send }) {
    const resp = yield* send({ type: "sample", prompt: "..." });
    return result;
  }
);
```

### Idempotency

Both `yield* worker` and `yield* worker.forEach(fn)` are idempotent:

- **`yield* worker` multiple times**: Returns the same cached result
- **`yield* worker.forEach(fn)` then `yield* worker`**: Both return same result
- **`yield* worker` then `yield* worker.forEach(fn)`**: Second call returns cached result immediately (fn never called)
- **`yield* worker.forEach(fn)` multiple times**: Second call returns cached result immediately

---

## Tests (TDD)

> Reviewer note: add coverage for request-queued-before-`forEach`, concurrent `forEach` call error, and error serialization (ensure `cause` contains `{ name, message, stack }`).

**Resolution:** Tests 11-14 added below to cover these cases.

### Test 1: Basic worker→host request/response

```typescript
it("handles a single request from worker", function* () {
  const worker = yield* useWorker<never, never, string, void>(
    import.meta.resolve("./test-assets/single-request-worker.ts"),
    { type: "module" }
  );

  const result = yield* worker.forEach<string, string>(function* (request) {
    return `echo: ${request}`;
  });

  expect(result).toEqual("received: echo: hello");
});
```

**Test asset `test-assets/single-request-worker.ts`:**

```typescript
import { workerMain } from "../worker-main.ts";

await workerMain<never, never, string, void, string, string>(
  function* ({ send }) {
    const response = yield* send("hello");
    return `received: ${response}`;
  }
);
```

---

### Test 2: Multiple sequential requests from worker

```typescript
it("handles multiple sequential requests from worker", function* () {
  const worker = yield* useWorker<never, never, number, void>(
    import.meta.resolve("./test-assets/sequential-requests-worker.ts"),
    { type: "module" }
  );

  let counter = 0;
  const result = yield* worker.forEach<string, number>(function* (request) {
    counter += 1;
    return counter;
  });

  expect(result).toEqual(3);
});
```

**Test asset `test-assets/sequential-requests-worker.ts`:**

```typescript
import { workerMain } from "../worker-main.ts";

await workerMain<never, never, number, void, string, number>(
  function* ({ send }) {
    const a = yield* send("first");
    const b = yield* send("second");
    const c = yield* send("third");
    return c;
  }
);
```

---

### Test 3: Error handling - host handler throws

```typescript
it("propagates errors from host handler to worker", function* () {
  const worker = yield* useWorker<never, never, string, void>(
    import.meta.resolve("./test-assets/error-handling-worker.ts"),
    { type: "module" }
  );

  const result = yield* worker.forEach<string, string>(function* (request) {
    if (request === "fail") {
      throw new Error("host error");
    }
    return "ok";
  });

  expect(result).toEqual("caught: host error");
});
```

**Test asset `test-assets/error-handling-worker.ts`:**

```typescript
import { workerMain } from "../worker-main.ts";

await workerMain<never, never, string, void, string, string>(
  function* ({ send }) {
    try {
      yield* send("fail");
      return "no error";
    } catch (e) {
      return `caught: ${(e as Error).message}`;
    }
  }
);
```

---

### Test 4: Concurrent requests from worker

```typescript
it("handles concurrent requests from worker", function* () {
  const worker = yield* useWorker<never, never, number[], void>(
    import.meta.resolve("./test-assets/concurrent-requests-worker.ts"),
    { type: "module" }
  );

  const result = yield* worker.forEach<number, number>(function* (request) {
    yield* sleep(request * 10);
    return request * 2;
  });

  expect(result).toEqual([6, 4, 2]);
});
```

**Test asset `test-assets/concurrent-requests-worker.ts`:**

```typescript
import { all } from "effection";
import { workerMain } from "../worker-main.ts";

await workerMain<never, never, number[], void, number, number>(
  function* ({ send }) {
    const results = yield* all([
      send(3),
      send(2),
      send(1),
    ]);
    return results;
  }
);
```

---

### Test 5: Bidirectional communication

```typescript
it("supports bidirectional communication", function* () {
  const worker = yield* useWorker<string, string, string, void>(
    import.meta.resolve("./test-assets/bidirectional-worker.ts"),
    { type: "module" }
  );

  yield* spawn(function* () {
    yield* worker.forEach<string, string>(function* (request) {
      return `host-response: ${request}`;
    });
  });

  const hostResult = yield* worker.send("from-host");
  expect(hostResult).toEqual("worker-response: from-host");

  const finalResult = yield* worker;
  expect(finalResult).toEqual("done: host-response: from-worker");
});
```

**Test asset `test-assets/bidirectional-worker.ts`:**

```typescript
import { workerMain } from "../worker-main.ts";

await workerMain<string, string, string, void, string, string>(
  function* ({ messages, send }) {
    const fromHost = yield* send("from-worker");
    
    yield* messages.forEach(function* (msg) {
      return `worker-response: ${msg}`;
    });

    return `done: ${fromHost}`;
  }
);
```

---

### Test 6: Worker without requests (backward compatibility)

```typescript
it("existing workers without send still work", function* () {
  const worker = yield* useWorker(
    import.meta.resolve("./test-assets/echo-worker.ts"),
    { type: "module" }
  );

  const result = yield* worker.send("hello world");
  expect(result).toEqual("hello world");
});
```

---

### Test 7: forEach completes when worker sends no requests

```typescript
it("forEach completes with result when worker sends no requests", function* () {
  const worker = yield* useWorker<never, never, string, void>(
    import.meta.resolve("./test-assets/no-requests-worker.ts"),
    { type: "module" }
  );

  let handlerCalled = false;
  const result = yield* worker.forEach<string, string>(function* (request) {
    handlerCalled = true;
    return "response";
  });

  expect(result).toEqual("done without requests");
  expect(handlerCalled).toBe(false);
});
```

**Test asset `test-assets/no-requests-worker.ts`:**

```typescript
import { workerMain } from "../worker-main.ts";

await workerMain<never, never, string, void, string, string>(
  function* () {
    return "done without requests";
  }
);
```

---

### Test 8: Idempotency - forEach then worker

```typescript
it("yield worker after forEach returns same result", function* () {
  const worker = yield* useWorker<never, never, string, void>(
    import.meta.resolve("./test-assets/single-request-worker.ts"),
    { type: "module" }
  );

  const result1 = yield* worker.forEach<string, string>(function* (request) {
    return `echo: ${request}`;
  });

  const result2 = yield* worker;

  expect(result1).toEqual("received: echo: hello");
  expect(result2).toEqual("received: echo: hello");
});
```

---

### Test 9: Idempotency - worker then forEach

```typescript
it("yield forEach after worker returns cached result", function* () {
  const worker = yield* useWorker<never, never, string, void>(
    import.meta.resolve("./test-assets/no-requests-worker.ts"),
    { type: "module" }
  );

  const result1 = yield* worker;

  let handlerCalled = false;
  const result2 = yield* worker.forEach<string, string>(function* (request) {
    handlerCalled = true;
    return "response";
  });

  expect(result1).toEqual("done without requests");
  expect(result2).toEqual("done without requests");
  expect(handlerCalled).toBe(false);
});
```

---

### Test 10: Idempotency - worker multiple times

```typescript
it("yield worker multiple times returns same result", function* () {
  const worker = yield* useWorker<never, never, string, void>(
    import.meta.resolve("./test-assets/no-requests-worker.ts"),
    { type: "module" }
  );

  const result1 = yield* worker;
  const result2 = yield* worker;
  const result3 = yield* worker;

  expect(result1).toEqual("done without requests");
  expect(result2).toEqual("done without requests");
  expect(result3).toEqual("done without requests");
});
```

---

### Test 11: Request queued before forEach is called

```typescript
it("queues requests sent before forEach is called", function* () {
  const worker = yield* useWorker<never, never, string, void>(
    import.meta.resolve("./test-assets/single-request-worker.ts"),
    { type: "module" }
  );

  // Small delay to ensure worker sends request before forEach is set up
  yield* sleep(10);

  const result = yield* worker.forEach<string, string>(function* (request) {
    return `echo: ${request}`;
  });

  expect(result).toEqual("received: echo: hello");
});
```

---

### Test 12: Concurrent forEach calls throw error

```typescript
it("throws error when forEach is called concurrently", function* () {
  const worker = yield* useWorker<never, never, string, void>(
    import.meta.resolve("./test-assets/slow-request-worker.ts"),
    { type: "module" }
  );

  // Start first forEach in background
  yield* spawn(function* () {
    yield* worker.forEach<string, string>(function* (request) {
      yield* sleep(100);  // Slow handler
      return `echo: ${request}`;
    });
  });

  // Give first forEach time to start
  yield* sleep(10);

  // Second forEach should throw
  try {
    yield* worker.forEach<string, string>(function* (request) {
      return "should not be called";
    });
    expect.fail("Expected error to be thrown");
  } catch (e) {
    expect((e as Error).message).toEqual("forEach is already in progress");
  }
});
```

**Test asset `test-assets/slow-request-worker.ts`:**

```typescript
import { workerMain } from "../worker-main.ts";

await workerMain<never, never, string, void, string, string>(
  function* ({ send }) {
    const response = yield* send("hello");
    return `received: ${response}`;
  }
);
```

---

### Test 13: Error cause contains serialized error data (host to worker)

```typescript
it("error cause contains name, message, and stack from host", function* () {
  const worker = yield* useWorker<never, never, string, void>(
    import.meta.resolve("./test-assets/error-cause-worker.ts"),
    { type: "module" }
  );

  const result = yield* worker.forEach<string, string>(function* (request) {
    const error = new TypeError("custom type error");
    throw error;
  });

  expect(result).toMatch(/caught error with cause/);
  expect(result).toContain("TypeError");
  expect(result).toContain("custom type error");
});
```

**Test asset `test-assets/error-cause-worker.ts`:**

```typescript
import { workerMain } from "../worker-main.ts";

await workerMain<never, never, string, void, string, string>(
  function* ({ send }) {
    try {
      yield* send("trigger-error");
      return "no error";
    } catch (e) {
      const error = e as Error;
      const cause = error.cause as { name: string; message: string; stack?: string };
      if (cause && cause.name && cause.message) {
        return `caught error with cause: ${cause.name} - ${cause.message}`;
      }
      return `caught error without proper cause: ${error.message}`;
    }
  }
);
```

---

### Test 14: Error cause contains serialized error data (worker to host)

```typescript
it("error cause contains name, message, and stack from worker", function* () {
  const worker = yield* useWorker<string, string, void, void>(
    import.meta.resolve("./test-assets/error-throw-worker.ts"),
    { type: "module" }
  );

  try {
    yield* worker.send("trigger-error");
    expect.fail("Expected error to be thrown");
  } catch (e) {
    const error = e as Error;
    expect(error.message).toContain("Worker handler failed");
    expect(error.cause).toBeDefined();
    const cause = error.cause as { name: string; message: string; stack?: string };
    expect(cause.name).toEqual("RangeError");
    expect(cause.message).toEqual("worker range error");
  }
});
```

**Test asset `test-assets/error-throw-worker.ts`:**

```typescript
import { workerMain } from "../worker-main.ts";

await workerMain<string, string, void, void, never, never>(
  function* ({ messages }) {
    yield* messages.forEach(function* (msg) {
      throw new RangeError("worker range error");
    });
  }
);
```

---

## Implementation Phases

### Phase 1: Update Types (`types.ts`)

1. Add `WorkerToHost` type for worker→host messages (R1):

```typescript
export type WorkerToHost<TRequest, TReturn> =
  | { type: "open" }
  | { type: "request"; value: TRequest; response: MessagePort }
  | { type: "close"; result: Result<TReturn> };
```

2. Add `SerializedError` interface (R2):

```typescript
export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}
```

3. Add helper functions for error serialization (R2):

```typescript
export function serializeError(error: Error): SerializedError {
  return { name: error.name, message: error.message, stack: error.stack };
}

export function errorFromSerialized(context: string, serialized: SerializedError): Error {
  return new Error(`${context}: ${serialized.message}`, { cause: serialized });
}
```

4. Update `WorkerMainOptions` to include `send`:

```typescript
export interface WorkerMainOptions<TSend, TRecv, TData, TRequest, TResponse> {
  messages: WorkerMessages<TSend, TRecv>;
  data: TData;
  send: (value: TRequest) => Operation<TResponse>;
}
```

### Phase 2: Update Worker Side (`worker-main.ts`)

1. Update `workerMain` signature to 6 type params
2. Implement `send` function:
   - Creates MessageChannel
   - Posts `{ type: "request", value, response: port2 }` to host
   - Waits on `port1` for response
   - Closes `port1` after receiving response (R3)
   - Returns result or throws wrapped error with cause (R2)
3. Pass `send` to body alongside existing `messages` and `data`
4. Update error serialization in existing `messages.forEach` to use `serializeError` (R2)

```typescript
function* send(value: TRequest): Operation<TResponse> {
  const channel = new MessageChannel();
  port.postMessage(
    { type: "request", value, response: channel.port2 },
    [channel.port2]
  );
  channel.port1.start();
  const event = yield* once(channel.port1, "message");
  channel.port1.close(); // R3: cleanup
  const result = (event as MessageEvent).data;
  if (result.ok) {
    return result.value;
  }
  // R2: wrap with cause
  throw errorFromSerialized("Host handler failed", result.error);
}
```

### Phase 3: Update Host Side (`worker.ts`)

1. Add state tracking:
   - `closed` flag for worker completion state
   - `forEachInProgress` flag to prevent concurrent forEach (R6)
   - `requestQueue` array to buffer requests before forEach is called (R4)

2. Restructure message handling:
   - Start buffering `"request"` messages immediately
   - Handle `"close"` messages to set closed state and resolve outcome

3. Add `forEach<TRequest, TResponse>` method to `WorkerResource`:
    - Throw if `forEachInProgress` is true (R6)
    - If already closed, return cached result immediately
    - Drain request queue first (R4)
    - Then continue processing live requests
    - Spawn handler for each request (concurrent handling)
    - Close response port after sending (R3)
    - Serialize errors with `serializeError` (R2)
    - Return final result when worker closes

> Reviewer note: make sure `forEachInProgress` is cleared even when `forEach` throws (e.g., wrap loop in `try`/`finally`).

**Resolution:** Addressed below with `try/finally` wrapper.

4. Update existing error handling in `send()` to use `errorFromSerialized` (R2)

```typescript
*forEach<TRequest, TResponse>(
  fn: (request: TRequest) => Operation<TResponse>
): Operation<TReturn> {
  // R6: check closed FIRST, before setting flag (avoids permanent lock)
  if (closed) {
    return yield* outcome.operation;
  }
  
  // R6: prevent concurrent forEach
  if (forEachInProgress) {
    throw new Error("forEach is already in progress");
  }
  forEachInProgress = true;
  
  try {
    // Helper to handle a single request
    function* handleRequest(msg: { value: TRequest; response: MessagePort }) {
      try {
        const result = yield* fn(msg.value);
        msg.response.postMessage(Ok(result));
      } catch (error) {
        // R2: serialize error
        msg.response.postMessage(Err(serializeError(error as Error)));
      } finally {
        // R3: cleanup
        msg.response.close();
      }
    }
    
    // R4: drain queued requests first
    for (const request of requestQueue) {
      yield* spawn(function* () {
        yield* handleRequest(request);
      });
    }
    requestQueue.length = 0;
    
    // Process live requests
    for (const event of yield* each(subscription)) {
      const msg = event.data;
      
      if (msg.type === "request") {
        yield* spawn(function* () {
          yield* handleRequest(msg);
        });
      } else if (msg.type === "close") {
        closed = true;
        const { result } = msg;
        if (result.ok) {
          outcome.resolve(result.value);
        } else {
          outcome.reject(errorFromSerialized("Worker failed", result.error));
        }
        break;
      }
      
      yield* each.next();
    }
    
    return yield* outcome.operation;
  } finally {
    // R6: always reset flag, even on error
    forEachInProgress = false;
  }
}
```

## File Changes Summary

| File | Changes |
|------|---------|
| `types.ts` | Add `WorkerToHost` type (R1), `SerializedError` interface (R2), `serializeError`/`errorFromSerialized` helpers (R2), update `WorkerMainOptions` to 5 type params with `send` |
| `worker-main.ts` | Implement `send` function with port cleanup (R3) and error wrapping (R2), update to 6 type params, update `messages.forEach` error handling (R2) |
| `worker.ts` | Add `forEach` method with request queueing (R4), concurrent forEach guard with try/finally (R6), port cleanup (R3), error serialization (R2), update `send()` error handling (R2) |
| `worker.test.ts` | Add 14 new test cases |
| `test-assets/*.ts` | 9 new test worker files (single-request, sequential-requests, error-handling, concurrent-requests, bidirectional, no-requests, slow-request, error-cause, error-throw) |
| `README.md` | Document new APIs and behavior contract (R7) including unbounded queue warning |

---

## Reference: Current Source Files

For implementation, review these existing files:

1. **`worker.ts`** - Host-side implementation
   - `useWorker()` function
   - `WorkerResource` interface
   - Message subscription setup
   - `send()` implementation using MessageChannel

2. **`worker-main.ts`** - Worker-side implementation
   - `workerMain()` function
   - `messages.forEach()` implementation with spawn for concurrent handling
   - Worker state machine (`createWorkerStatesSignal`)

3. **`types.ts`** - Type definitions
   - `WorkerControl` - messages from host to worker
   - `WorkerMainOptions` - options passed to worker body
   - `WorkerMessages` - the `messages` object with `forEach`

4. **`worker.test.ts`** - Existing tests to maintain backward compatibility
