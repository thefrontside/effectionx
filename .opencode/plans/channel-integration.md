# Plan: Integrate Channel Primitives into Worker Implementation

## Context for Reviewer

This plan describes how to integrate the new `useChannelResponse` and `useChannelRequest` primitives (from `worker/channel.ts`) into the existing worker implementation.

### Background

We created two channel primitives to simplify request-response communication over `MessageChannel`:

- **`useChannelResponse<T>()`** - Requester side. Creates a `MessageChannel`, returns `{ port, operation }`. The `port` is transferred to the responder, and `operation` waits for the response (automatically sending an ACK after receiving).

- **`useChannelRequest<T>(port)`** - Responder side. Wraps a received `MessagePort`, returns `{ resolve, reject }`. Both are Operations that send a response and wait for ACK before closing the port.

The ACK mechanism guarantees the response was received before cleanup.

### What the Primitives Handle Internally

Both primitives encapsulate the full `MessagePort` lifecycle:

| Concern | `useChannelResponse` | `useChannelRequest` |
|---------|---------------------|---------------------|
| `port.start()` | Calls `port1.start()` on creation (line 43) | Calls `port.start()` on creation (line 88) |
| `port.close()` | Closes `port1` in finally block | Closes port in finally block |
| Event listening | Uses `once(port, "message")` internally | Uses `once(port, "message")` for ACK |
| ACK send | Sends ACK after receiving response | N/A (waits for ACK) |
| ACK receive | N/A (sends ACK) | Validates ACK message |

**This means callers no longer need to manually call `port.start()` or `port.close()`** - removing these calls in the integration is intentional, not a regression.

### Current State

The existing implementation in `worker.ts` and `worker-main.ts` manually manages `MessageChannel` lifecycle:
- Creates channels with `new MessageChannel()` or `useMessageChannel()`
- Manually calls `port.start()`, `port.postMessage()`, `port.close()`
- Uses `once(port, "message")` to wait for responses
- No ACK mechanism (fire-and-forget responses)

### Goal

Replace manual channel management with the new primitives to:
1. Simplify the code
2. Add guaranteed delivery via ACK
3. Ensure proper resource cleanup
4. Create a foundation for further abstraction refinement

---

## PREREQUISITE: Fix Cancellation Handling in `channel.ts`

Before integrating, we must fix a cancellation bug in `useChannelRequest`.

### The Problem

When the requester is cancelled while waiting for a response:
1. Requester's scope exits, `port1.close()` is called
2. Responder has sent response, is waiting for ACK via `once(port, "message")`
3. When paired port closes, `once` hangs forever (never resolves)
4. **Responder hangs indefinitely**

### The Fix

Race the ACK wait against the port `close` event. When a `MessagePort`'s paired port closes, it emits a `close` event.

#### Update `worker/channel.ts`

**Change imports:**
```typescript
import { type Operation, resource, once, race } from "effection";
```

**Update `resolve` in `useChannelRequest`:**
```typescript
resolve(value: T): Operation<void> {
  return {
    *[Symbol.iterator]() {
      port.postMessage(value);

      // Race between ACK message and port close (requester cancelled)
      const event = yield* race([
        once(port, "message"),
        once(port, "close"),
      ]);

      // If port closed, requester was cancelled - exit gracefully
      if ((event as Event).type === "close") {
        return;
      }

      // Validate ACK
      const msg = (event as MessageEvent).data;
      if (msg?.type !== "ack") {
        throw new Error(`Expected ACK, got: ${msg?.type}`);
      }

      port.close();
    },
  };
}
```

**Update `reject` in `useChannelRequest`:**
```typescript
reject(error: Error): Operation<void> {
  return {
    *[Symbol.iterator]() {
      port.postMessage(error);

      // Race between ACK message and port close (requester cancelled)
      const event = yield* race([
        once(port, "message"),
        once(port, "close"),
      ]);

      // If port closed, requester was cancelled - exit gracefully
      if ((event as Event).type === "close") {
        return;
      }

      // Validate ACK
      const msg = (event as MessageEvent).data;
      if (msg?.type !== "ack") {
        throw new Error(`Expected ACK, got: ${msg?.type}`);
      }

      port.close();
    },
  };
}
```

#### Add Tests for Cancellation and ACK Behavior

Add the following tests to `worker/channel.test.ts`:

**1. Responder handles requester cancellation gracefully:**
```typescript
it("responder handles requester cancellation gracefully", function* () {
  const channel = new MessageChannel();
  channel.port1.start();
  channel.port2.start();

  let responderCompleted = false;

  // Spawn responder
  yield* spawn(function* () {
    const { resolve } = yield* useChannelRequest<string>(channel.port2);
    yield* resolve("response");
    responderCompleted = true;
  });

  // Give responder time to send response and start waiting for ACK
  yield* sleep(10);

  // Close port1 (simulates requester cancellation)
  channel.port1.close();

  // Give responder time to detect close and exit
  yield* sleep(10);

  // Responder should have completed (not hung)
  expect(responderCompleted).toBe(true);
});
```

**2. ACK is sent and received on error path (full round-trip):**
```typescript
it("ACK is sent for error responses", function* () {
  const { port, operation } = yield* useChannelResponse<Error>();

  let ackWasReceived = false;

  // Spawn responder that tracks ACK receipt
  yield* spawn(function* () {
    const { reject } = yield* useChannelRequest<string>(port);
    yield* reject(new Error("test error"));
    // If we get here, ACK was received (reject waits for ACK)
    ackWasReceived = true;
  });

  yield* operation;

  // Verify responder completed (meaning ACK was received)
  yield* sleep(10);
  expect(ackWasReceived).toBe(true);
});
```

**3. Responder scope exits without calling resolve/reject:**
```typescript
it("port closes if responder exits without responding", function* () {
  const channel = new MessageChannel();
  channel.port1.start();

  // Spawn responder that exits without responding
  yield* spawn(function* () {
    const _request = yield* useChannelRequest<string>(channel.port2);
    // Exit without calling resolve or reject
    // The finally block should close the port
  });

  // Give time for responder to run and exit
  yield* sleep(10);

  // port2 should be closed by useChannelRequest's finally block
  // port1 should receive close event
  let closeReceived = false;
  channel.port1.addEventListener("close", () => {
    closeReceived = true;
  });

  yield* sleep(10);
  expect(closeReceived).toBe(true);
});
```

**4. Responder throws during handler (before resolve/reject):**
```typescript
it("port closes if responder throws before responding", function* () {
  const channel = new MessageChannel();
  channel.port1.start();

  let errorCaught = false;

  // Spawn responder that throws
  yield* spawn(function* () {
    try {
      const _request = yield* useChannelRequest<string>(channel.port2);
      throw new Error("responder crashed");
    } catch (e) {
      errorCaught = true;
      throw e; // re-throw to let finally run
    }
  });

  yield* sleep(10);

  // port2 should be closed by useChannelRequest's finally block
  let closeReceived = false;
  channel.port1.addEventListener("close", () => {
    closeReceived = true;
  });

  yield* sleep(10);
  expect(closeReceived).toBe(true);
});
```

---

## PREREQUISITE: Fix Error Typing with SerializedResult

The current code has a type mismatch when sending errors across the channel boundary.

### The Problem

Current pattern uses unsafe casts:

```typescript
// Sending error (worker-main.ts, worker.ts):
msg.response.postMessage(Err(serializeError(error as Error) as unknown as Error));
//                                                          ^^^^^^^^^^^^^^^^^^
//                        SerializedError cast to Error - type mismatch!

// Receiving (worker.ts):
const result = yield* operation;  // typed as Result<TRecv | SerializedError>
if (!result.ok) {
  throw errorFromSerialized("...", result.error as unknown as SerializedError);
  //                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //                               error is typed as Error but is SerializedError
}
```

The `as unknown as` casts mask the real types. Effection's `Result<T>` type hardcodes `Error` for the error case, but we're actually sending `SerializedError`.

### The Fix

Create a `SerializedResult<T>` type and update `useChannelRequest` to handle serialization internally via `resolve()`/`reject()`.

**Design Decision:** `resolve(value)` and `reject(error)` handle `SerializedResult` wrapping internally. Callers use natural semantics; the channel handles serialization.

#### Add to `worker/types.ts`

```typescript
/**
 * A Result type for cross-boundary communication where errors are serialized.
 * Unlike effection's Result<T> which uses Error, this uses SerializedError.
 */
export type SerializedResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SerializedError };
```

**Note:** `SerializedOk` and `SerializedErr` helper functions are NOT exported - the channel primitive handles wrapping internally.

#### Update `worker/channel.ts`

**Add import:**
```typescript
import { serializeError, type SerializedResult } from "./types.ts";
```

**Update `ChannelResponse` interface:**

The `operation` now returns `SerializedResult<T>` (the channel always wraps responses):

```typescript
/**
 * Requester side - creates channel, waits for SerializedResult response
 */
export interface ChannelResponse<T> {
  /** Port to transfer to the responder */
  port: MessagePort;

  /** Operation that waits for SerializedResult<T> response (sends ACK after receiving) */
  operation: Operation<SerializedResult<T>>;
}
```

**Update `ChannelRequest` implementation:**

`resolve()` wraps value in `{ ok: true, value }`, `reject()` serializes error and wraps in `{ ok: false, error }`:

```typescript
/**
 * Responder side - wraps port, sends response as SerializedResult
 */
export interface ChannelRequest<T> {
  /** Send success response (wraps in SerializedResult internally) and wait for ACK */
  resolve(value: T): Operation<void>;

  /** Send error response (serializes and wraps in SerializedResult internally) and wait for ACK */
  reject(error: Error): Operation<void>;
}

export function useChannelRequest<T>(
  port: MessagePort,
): Operation<ChannelRequest<T>> {
  return resource(function* (provide) {
    port.start();

    try {
      yield* provide({
        resolve(value: T): Operation<void> {
          return {
            *[Symbol.iterator]() {
              // Wrap in SerializedResult internally
              const result: SerializedResult<T> = { ok: true, value };
              port.postMessage(result);

              // Race between ACK and close (same as before)
              const event = yield* race([
                once(port, "message"),
                once(port, "close"),
              ]);

              if ((event as Event).type === "close") {
                return;
              }

              const msg = (event as MessageEvent).data;
              if (msg?.type !== "ack") {
                throw new Error(`Expected ACK, got: ${msg?.type}`);
              }

              port.close();
            },
          };
        },

        reject(error: Error): Operation<void> {
          return {
            *[Symbol.iterator]() {
              // Serialize and wrap in SerializedResult internally
              const result: SerializedResult<T> = { ok: false, error: serializeError(error) };
              port.postMessage(result);

              // Race between ACK and close (same as before)
              const event = yield* race([
                once(port, "message"),
                once(port, "close"),
              ]);

              if ((event as Event).type === "close") {
                return;
              }

              const msg = (event as MessageEvent).data;
              if (msg?.type !== "ack") {
                throw new Error(`Expected ACK, got: ${msg?.type}`);
              }

              port.close();
            },
          };
        },
      });
    } finally {
      port.close();
    }
  });
}
```

#### Update Usage in `worker.ts`

**Imports:**
```typescript
import {
  errorFromSerialized,
  type SerializedResult,
} from "./types.ts";
import { useChannelResponse, useChannelRequest } from "./channel.ts";
```

**In `send()` method:**
```typescript
*send(value) {
  const { port, operation } = yield* useChannelResponse<TRecv>();
  worker.postMessage(
    { type: "send", value, response: port },
    [port],
  );
  const result = yield* operation;  // Returns SerializedResult<TRecv>
  if (result.ok) {
    return result.value;
  }
  throw errorFromSerialized("Worker handler failed", result.error);
}
```

**In `handleRequest`:**
```typescript
function* handleRequest(msg: { value: unknown; response: MessagePort }): Operation<void> {
  const { resolve, reject } = yield* useChannelRequest<WResponse>(msg.response);
  try {
    const result = yield* fn(msg.value as WRequest);
    yield* resolve(result);  // Wrapped in SerializedResult internally
  } catch (error) {
    yield* reject(error as Error);  // Serialized and wrapped internally
  }
}
```

**Note:** Callers use natural `resolve(value)` / `reject(error)` semantics. The channel handles `SerializedResult` wrapping and error serialization internally.

#### Update Usage in `worker-main.ts`

**Imports:**
```typescript
import {
  errorFromSerialized,
  type SerializedResult,
} from "./types.ts";
import { useChannelResponse, useChannelRequest } from "./channel.ts";
```

**In `send()` function:**
```typescript
function* send(requestValue: WRequest): Operation<WResponse> {
  const { port: responsePort, operation } = yield* useChannelResponse<WResponse>();
  port.postMessage(
    { type: "request", value: requestValue, response: responsePort },
    [responsePort] as any,
  );
  const result = yield* operation;  // Returns SerializedResult<WResponse>
  if (result.ok) {
    return result.value;
  }
  throw errorFromSerialized("Host handler failed", result.error);
}
```

**In `messages.forEach` handler:**
```typescript
*forEach(fn: (value: TSend) => Operation<TRecv>) {
  for (let { value, response } of yield* each(sent)) {
    yield* spawn(function* () {
      const { resolve, reject } = yield* useChannelRequest<TRecv>(response);
      try {
        let result = yield* fn(value);
        yield* resolve(result);
      } catch (error) {
        yield* reject(error as Error);
      }
    });
    yield* each.next();
  }
}
```

---

## Files to Modify

### 1. `worker/worker.ts` (Host Side)

#### Change 1: Update imports

**Remove:**
```typescript
import { useMessageChannel } from "./message-channel.ts";
```

**Add:**
```typescript
import { useChannelResponse, useChannelRequest } from "./channel.ts";
import { errorFromSerialized } from "./types.ts";
```

#### Change 2: Update `send()` method (lines 172-195)

**Current:**
```typescript
*send(value) {
  let channel = yield* useMessageChannel();
  worker.postMessage(
    { type: "send", value, response: channel.port2 },
    [channel.port2],
  );
  channel.port1.start();
  let event = yield* once(channel.port1, "message");
  let result = (event as MessageEvent).data as Result<TRecv | SerializedError>;
  if (result.ok) {
    return result.value as TRecv;
  }
  throw errorFromSerialized("Worker handler failed", result.error as unknown as SerializedError);
}
```

**Replace with:**
```typescript
*send(value) {
  const { port, operation } = yield* useChannelResponse<TRecv>();
  worker.postMessage(
    { type: "send", value, response: port },
    [port],
  );
  const result = yield* operation;  // Returns SerializedResult<TRecv>
  if (result.ok) {
    return result.value;
  }
  throw errorFromSerialized("Worker handler failed", result.error);
}
```

#### Change 3: Update `handleRequest` in `forEach` (lines 213-227)

**Current:**
```typescript
function* handleRequest(msg: { value: unknown; response: MessagePort }): Operation<void> {
  try {
    const result = yield* fn(msg.value as WRequest);
    msg.response.postMessage(Ok(result));
  } catch (error) {
    msg.response.postMessage(Err(serializeError(error as Error) as unknown as Error));
  } finally {
    msg.response.close();
  }
}
```

**Replace with:**
```typescript
function* handleRequest(msg: { value: unknown; response: MessagePort }): Operation<void> {
  const { resolve, reject } = yield* useChannelRequest<WResponse>(msg.response);
  try {
    const result = yield* fn(msg.value as WRequest);
    yield* resolve(result);  // Wrapped in SerializedResult internally
  } catch (error) {
    yield* reject(error as Error);  // Serialized and wrapped internally
  }
}
```

**Note:** Remove the `finally` block - `useChannelRequest` handles port cleanup. The channel's `resolve()`/`reject()` handle `SerializedResult` wrapping and error serialization internally.

---

### 2. `worker/worker-main.ts` (Worker Side)

#### Change 1: Update imports

**Add:**
```typescript
import { useChannelResponse, useChannelRequest } from "./channel.ts";
import { errorFromSerialized } from "./types.ts";
```

#### Change 2: Update `send()` function (lines 132-157)

**Current:**
```typescript
function* send(requestValue: WRequest): Operation<WResponse> {
  const channel = new MessageChannel();
  port.postMessage(
    { type: "request", value: requestValue, response: channel.port2 },
    [channel.port2] as any,
  );
  channel.port1.start();
  const event = yield* once(channel.port1, "message");
  channel.port1.close();
  const result = (event as MessageEvent).data as Result<WResponse | SerializedError>;
  if (result.ok) {
    return result.value as WResponse;
  }
  throw errorFromSerialized("Host handler failed", result.error as unknown as SerializedError);
}
```

**Replace with:**
```typescript
function* send(requestValue: WRequest): Operation<WResponse> {
  const { port: responsePort, operation } = yield* useChannelResponse<WResponse>();
  port.postMessage(
    { type: "request", value: requestValue, response: responsePort },
    [responsePort] as any,
  );
  const result = yield* operation;  // Returns SerializedResult<WResponse>
  if (result.ok) {
    return result.value;
  }
  throw errorFromSerialized("Host handler failed", result.error);
}
```

#### Change 3: Update `messages.forEach` handler (lines 162-180)

**Current:**
```typescript
*forEach(fn: (value: TSend) => Operation<TRecv>) {
  for (let { value, response } of yield* each(sent)) {
    yield* spawn(function* () {
      try {
        let result = yield* fn(value);
        response.postMessage(Ok(result));
      } catch (error) {
        response.postMessage(Err(serializeError(error as Error) as unknown as Error));
      }
    });
    yield* each.next();
  }
}
```

**Replace with:**
```typescript
*forEach(fn: (value: TSend) => Operation<TRecv>) {
  for (let { value, response } of yield* each(sent)) {
    yield* spawn(function* () {
      const { resolve, reject } = yield* useChannelRequest<TRecv>(response);
      try {
        let result = yield* fn(value);
        yield* resolve(result);  // Wrapped in SerializedResult internally
      } catch (error) {
        yield* reject(error as Error);  // Serialized and wrapped internally
      }
    });
    yield* each.next();
  }
}
```

---

## Protocol Change: ACK Mechanism

The new implementation adds an ACK round-trip:

**Before (fire-and-forget):**
```
Requester                    Responder
    |------- request -------->|
    |<------ response --------|
    X                         X
```

**After (with ACK):**
```
Requester                    Responder
    |------- request -------->|
    |<------ response --------|
    |---------- ACK --------->|
    X                         X
```

This guarantees the response was received before either side cleans up.

### ACK Behavior Clarification

**Important:** The ACK is sent for BOTH success and error responses. In `useChannelResponse`, the `operation` sends an ACK immediately after receiving any message, before the caller inspects whether it's `{ ok: true }` or `{ ok: false }`:

```typescript
operation: {
  *[Symbol.iterator]() {
    const event = yield* once(channel.port1, "message");
    const data = (event as MessageEvent).data as SerializedResult<T>;  // Could be success or error
    
    channel.port1.postMessage({ type: "ack" });  // ACK sent regardless
    
    return data;
  },
}
```

This means:
- `resolve(Ok(value))` receives ACK ✓
- `reject(Err(error))` receives ACK ✓
- Neither will hang waiting for ACK

---

## Verification Steps

After making changes:

1. **Type check:** `pnpm check`
2. **Run worker tests:** `node --env-file=.env --test "worker/**/*.test.ts"`
3. **Run full test matrix:** `pnpm test:matrix` (tests with effection v3 and v4)

All 31 existing worker tests should pass. The ACK mechanism is transparent to the test assertions.

---

## Future Cleanup (Separate PR)

After this integration is verified:
- Remove `worker/message-channel.ts` (no longer used)
- Consider removing `Ok`/`Err` imports from effection if no longer needed in worker files

---

## Summary Table

| File | Location | Current | New |
|------|----------|---------|-----|
| `types.ts` | new types | (none) | `SerializedResult<T>` (type only, no helper functions) |
| `channel.ts` | imports | `once` | `once`, `race`, `serializeError` |
| `channel.ts` | `resolve()` | sends raw value | wraps in `{ ok: true, value }` internally |
| `channel.ts` | `reject()` | sends raw error | serializes and wraps in `{ ok: false, error }` internally |
| `channel.ts` | ACK wait | `once(port, "message")` | `race([once(port, "message"), once(port, "close")])` |
| `channel.ts` | `ChannelResponse.operation` | returns `T` | returns `SerializedResult<T>` |
| `worker.ts` | imports | `useMessageChannel`, `Ok`, `Err` | `useChannelResponse`, `useChannelRequest`, `errorFromSerialized` |
| `worker.ts` | `send()` | Manual channel + `Result` | `useChannelResponse<T>` (operation returns `SerializedResult<T>`) |
| `worker.ts` | `handleRequest` | Manual port + `Ok`/`Err` | `useChannelRequest<T>` + `resolve(value)`/`reject(error)` |
| `worker-main.ts` | imports | (none for channel) | `useChannelResponse`, `useChannelRequest`, `errorFromSerialized` |
| `worker-main.ts` | `send()` | Manual channel + `Result` | `useChannelResponse<T>` (operation returns `SerializedResult<T>`) |
| `worker-main.ts` | `forEach` handler | Manual port + `Ok`/`Err` | `useChannelRequest<T>` + `resolve(value)`/`reject(error)` |
