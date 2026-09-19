# Task Buffer

Manages concurrent task execution by enforcing a maximum limit on simultaneously
active operations.

---

When this limit is reached, the `TaskBuffer` automatically queues additional
spawn requests and processes them in order as capacity becomes available. This
prevents resource overload while ensuring all tasks are eventually executed.

Submitting work, waiting for it to start, and waiting for it to finish are three
separate steps:

```ts
import { run, sleep, type Task } from "effection";
import { useTaskBuffer } from "@effectionx/task-buffer";

await run(function* () {
  // a buffer that keeps at most 2 tasks active at a time
  const buffer = yield* useTaskBuffer(2);

  // 1. submit work. `spawn()` returns as soon as the request is queued; it does
  //    not wait for the task to start. It hands back an operation that resolves
  //    once the task has been admitted into the buffer.
  const admission = yield* buffer.spawn(() => sleep(10));
  yield* buffer.spawn(() => sleep(10));

  // the buffer is now full, so this request waits for capacity before it starts
  yield* buffer.spawn(() => sleep(10));

  // 2. wait for admission. This resolves once there is room in the buffer and
  //    the task has been spawned, and returns that `Task`.
  const task: Task<void> = yield* admission;

  // 3. wait for that one task to run to completion and produce its result.
  yield* task;

  // 4. wait for every queued and active task to complete.
  yield* buffer;
});
```

## Failure

A failing task is not isolated from the rest of the buffer. Its error propagates
out of the buffer and into the scope that created it, halting the buffer's other
active tasks along with everything else in that scope. The buffer is not
fail-fast in the sense of reporting the first failure to whoever is waiting on
it: `yield* buffer` waits only for queued and active tasks to drain, and is
itself halted by the unwinding scope, so it neither returns nor throws.

`yield* task` does rethrow that task's error, but catching it there does not
contain the failure — the scope is torn down regardless. To keep one failure
from tearing down the caller, handle it inside the operation passed to
`spawn()`.

## Cancellation

When the scope holding the buffer exits, its active tasks are halted and any
requests still queued are never spawned.
