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

#### Add Test for Cancellation

Add a test to `worker/channel.test.ts`:

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

Create a `SerializedResult<T>` type that properly types the error case.

#### Add to `worker/types.ts`

```typescript
/**
 * A Result type for cross-boundary communication where errors are serialized.
 * Unlike effection's Result<T> which uses Error, this uses SerializedError.
 */
export type SerializedResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SerializedError };

/**
 * Create a successful SerializedResult
 */
export function SerializedOk<T>(value: T): SerializedResult<T> {
  return { ok: true, value };
}

/**
 * Create a failed SerializedResult with a serialized error
 */
export function SerializedErr<T>(error: SerializedError): SerializedResult<T> {
  return { ok: false, error };
}
```

#### Update Usage in `worker.ts`

**Imports:**
```typescript
import {
  serializeError,
  errorFromSerialized,
  type SerializedError,
  type SerializedResult,
  SerializedOk,
  SerializedErr,
} from "./types.ts";
```

**In `send()` method:**
```typescript
*send(value) {
  const { port, operation } = yield* useChannelResponse<SerializedResult<TRecv>>();
  worker.postMessage(
    { type: "send", value, response: port },
    [port],
  );
  const result = yield* operation;
  if (result.ok) {
    return result.value;  // No cast needed - properly typed as TRecv
  }
  throw errorFromSerialized("Worker handler failed", result.error);  // No cast needed
}
```

**In `handleRequest`:**
```typescript
function* handleRequest(msg: { value: unknown; response: MessagePort }): Operation<void> {
  const { resolve, reject } = yield* useChannelRequest<SerializedResult<WResponse>>(msg.response);
  try {
    const result = yield* fn(msg.value as WRequest);
    yield* resolve(SerializedOk(result));
  } catch (error) {
    yield* resolve(SerializedErr(serializeError(error as Error)));  // Note: use resolve, not reject
  }
}
```

**Note:** We use `resolve()` for both success and error because the channel's `reject()` is for Operation-level errors (like ACK timeout), not application-level errors. The `SerializedResult` discriminated union carries the application success/error.

#### Update Usage in `worker-main.ts`

**Imports:**
```typescript
import {
  serializeError,
  errorFromSerialized,
  type SerializedError,
  type SerializedResult,
  SerializedOk,
  SerializedErr,
} from "./types.ts";
```

**In `send()` function:**
```typescript
function* send(requestValue: WRequest): Operation<WResponse> {
  const { port: responsePort, operation } = yield* useChannelResponse<SerializedResult<WResponse>>();
  port.postMessage(
    { type: "request", value: requestValue, response: responsePort },
    [responsePort] as any,
  );
  const result = yield* operation;
  if (result.ok) {
    return result.value;  // No cast needed
  }
  throw errorFromSerialized("Host handler failed", result.error);  // No cast needed
}
```

**In `messages.forEach` handler:**
```typescript
*forEach(fn: (value: TSend) => Operation<TRecv>) {
  for (let { value, response } of yield* each(sent)) {
    yield* spawn(function* () {
      const { resolve } = yield* useChannelRequest<SerializedResult<TRecv>>(response);
      try {
        let result = yield* fn(value);
        yield* resolve(SerializedOk(result));
      } catch (error) {
        yield* resolve(SerializedErr(serializeError(error as Error)));
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
import {
  type SerializedResult,
  SerializedOk,
  SerializedErr,
} from "./types.ts";
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
  const { port, operation } = yield* useChannelResponse<SerializedResult<TRecv>>();
  worker.postMessage(
    { type: "send", value, response: port },
    [port],
  );
  const result = yield* operation;
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
  const { resolve } = yield* useChannelRequest<SerializedResult<WResponse>>(msg.response);
  try {
    const result = yield* fn(msg.value as WRequest);
    yield* resolve(SerializedOk(result));
  } catch (error) {
    yield* resolve(SerializedErr(serializeError(error as Error)));
  }
}
```

**Note:** Remove the `finally` block - `useChannelRequest` handles port cleanup. We use `resolve()` for both success and error because the channel's `reject()` is for Operation-level errors, not application-level errors wrapped in `SerializedResult`.

---

### 2. `worker/worker-main.ts` (Worker Side)

#### Change 1: Update imports

**Add:**
```typescript
import { useChannelResponse, useChannelRequest } from "./channel.ts";
import {
  type SerializedResult,
  SerializedOk,
  SerializedErr,
} from "./types.ts";
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
  const { port: responsePort, operation } = yield* useChannelResponse<SerializedResult<WResponse>>();
  port.postMessage(
    { type: "request", value: requestValue, response: responsePort },
    [responsePort] as any,
  );
  const result = yield* operation;
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
      const { resolve } = yield* useChannelRequest<SerializedResult<TRecv>>(response);
      try {
        let result = yield* fn(value);
        yield* resolve(SerializedOk(result));
      } catch (error) {
        yield* resolve(SerializedErr(serializeError(error as Error)));
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

**Important:** The ACK is sent for BOTH success and error responses. In `useChannelResponse`, the `operation` sends an ACK immediately after receiving any message, before the caller inspects whether it's an `Ok` or `Err`:

```typescript
operation: {
  *[Symbol.iterator]() {
    const event = yield* once(channel.port1, "message");
    const data = (event as MessageEvent).data as T;  // Could be Ok or Err
    
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
| `types.ts` | new types | (none) | `SerializedResult<T>`, `SerializedOk`, `SerializedErr` |
| `channel.ts` | imports | `once` | `once`, `race` |
| `channel.ts` | `resolve`/`reject` | `once(port, "message")` | `race([once(port, "message"), once(port, "close")])` |
| `worker.ts` | imports | `useMessageChannel`, `Ok`, `Err` | `useChannelResponse`, `useChannelRequest`, `SerializedResult`, `SerializedOk`, `SerializedErr` |
| `worker.ts` | `send()` | Manual channel + `Result` | `useChannelResponse` + `SerializedResult` |
| `worker.ts` | `handleRequest` | Manual port + `Ok`/`Err` | `useChannelRequest` + `SerializedOk`/`SerializedErr` |
| `worker-main.ts` | imports | (none for channel) | `useChannelResponse`, `useChannelRequest`, `SerializedResult`, `SerializedOk`, `SerializedErr` |
| `worker-main.ts` | `send()` | Manual channel + `Result` | `useChannelResponse` + `SerializedResult` |
| `worker-main.ts` | `forEach` handler | Manual port + `Ok`/`Err` | `useChannelRequest` + `SerializedOk`/`SerializedErr` |
