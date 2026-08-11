# Forceable

Put a deadline on a resource's graceful teardown.

---

Well behaved resources shut down cooperatively: they ask, then wait. A worker is
told to close and is given time to finish; a process is sent a signal and is
given time to flush. Waiting is the right default, because it is the only way
the resource gets to run its own cleanup.

But cooperative shutdown assumes the other side is listening. A worker spinning
in a tight loop never reads its control channel. A process ignoring `SIGTERM`
never flushes. Waiting on either one holds the enclosing scope open forever, and
no amount of patience fixes it.

`withForce` puts a deadline on that wait, without changing how the resource
tears itself down.

```ts
import { sleep } from "effection";
import { withForce } from "@effectionx/forceable";
import { useWorker } from "@effectionx/worker";

let worker = yield* withForce(
  useWorker("./transcode.ts", { type: "module" }),
  function* (force) {
    yield* sleep(10_000);
    force("worker did not close within 10s");
  },
);
```

The resource still runs its own graceful teardown, exactly as it would have. The
policy runs alongside it. Whichever finishes first wins: if the resource closes
in time, the policy is cancelled wherever it happens to be suspended and never
forces; if the policy calls `force` first, the graceful teardown is cut short.

## Policies read application state

A policy is an operation, so it can wait on anything — not just a clock. That
matters because a fixed timeout is a guess, while the application usually knows
something more specific about whether shutdown is going to land.

```ts
let worker = yield* withForce(useWorker(url, { type: "module" }), function* (force) {
  let health = yield* WorkerHealth.expect();
  yield* health.controlChannelUnresponsive;
  force("control channel stopped answering");
});
```

This package deliberately does not infer that CPU load, message latency, or
elapsed time mean a particular resource is unhealthy. Applications define that.

## Implementing Forceable

A resource opts in by implementing one symbol. It should tear down immediately,
tolerate being called more than once, and do nothing if the resource has already
finished.

```ts
import { type Forceable, ForcedTerminationError, force } from "@effectionx/forceable";

yield* provide({
  [force](reason?: string) {
    handle.destroy();
    rejectOutcome(new ForcedTerminationError(reason));
  },
});
```

Anything implementing `Forceable` composes with `withForce`, so a single policy
shape works across workers, processes, and anything else holding a handle the
runtime will not reclaim on its own.

## What forcing costs

Forcing skips the resource's cleanup. That is the entire point, and it is not
free: whatever the graceful teardown was responsible for — flushing a buffer,
removing a lock file, acknowledging a message — has not happened. Durable
cleanup for a resource that might be forced has to be owned by the host.

Forcing is also quiet. `force(reason)` returns, teardown finishes, and the
enclosing halt is undisturbed. The policy is the notification: it decided to
force, so it is the natural place to log, count, or alert.

```ts
function* (force) {
  yield* sleep(grace);
  logger.warn({ reason }, "forced teardown");
  force(reason);
}
```

Raising from inside a policy is **not** a reliable way to make forcing loud.
Whether the error escapes is a race against how many turns the resource's own
teardown needs after being forced.
