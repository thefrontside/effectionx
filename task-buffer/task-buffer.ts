import {
  Err,
  Ok,
  type Operation,
  type Resolve,
  type Result,
  type Task,
  createChannel,
  resource,
  spawn,
  useScope,
  withResolvers,
} from "effection";

/**
 * Spawn operations, but only allow a certain number to be active at a
 * given time. Once the `TaskBuffer` becomes full, it will queue up spawn
 * operations until room becomes available
 */
export interface TaskBuffer extends Operation<void> {
  /**
   * Submit `op` to the task buffer. This operation returns as soon as the
   * request has been queued; it does not wait for `op` to be spawned.
   *
   * @param op - the operation to spawn in the buffer.
   * @returns an operation that resolves with the spawned {@link Task} once
   * there is room in the buffer and `op` has been spawned.
   */
  spawn<T>(op: () => Operation<T>): Operation<Operation<Task<T>>>;
}

/**
 * Create a new `TaskBuffer` attached to the current scope. It will
 * not allow its number of active tasks to exceed `max`.
 *
 * ```ts
 * import { run, sleep } from "effection";
 * import { useTaskBuffer } from "@effectionx/task-buffer";
 *
 * await run(function*() {
 *  const buffer = yield* useTaskBuffer(2);
 *
 *  yield* buffer.spawn(() => sleep(10));
 *  yield* buffer.spawn(() => sleep(10));
 *  // the next task won't execute until the above two tasks are completed
 *  yield* buffer.spawn(() => sleep(10));
 *
 *  // will wait for all tasks to be complete
 *  yield* buffer;
 * });
 * ```
 *
 * @param max - the maximum number of concurrent tasks.
 * @returns the new task buffer.
 */
export function useTaskBuffer(max: number): Operation<TaskBuffer> {
  return resource(function* (provide) {
    let input = createChannel<void, never>();

    let output = createChannel<Result<unknown>, never>();

    let buffer = new Set<Task<unknown>>();

    let scope = yield* useScope();

    let requests: SpawnRequest<unknown>[] = [];

    // Subscribe before the loop starts. Re-subscribing per iteration drops any
    // send that lands before the new subscription is established.
    let inputs = yield* input;
    let outputs = yield* output;

    yield* spawn(function* () {
      while (true) {
        if (requests.length === 0) {
          yield* inputs.next();
        } else if (buffer.size < max) {
          const request = requests.pop()!;
          let task = yield* scope.spawn(request.operation);
          buffer.add(task);
          yield* spawn(function* () {
            try {
              let result = Ok(yield* task);
              buffer.delete(task);
              yield* output.send(result);
            } catch (error) {
              buffer.delete(task);
              yield* output.send(Err(error as Error));
            }
          });
          request.resolve(task);
        } else {
          yield* outputs.next();
        }
      }
    });

    yield* provide({
      *[Symbol.iterator]() {
        let results = yield* output;
        while (buffer.size > 0 || requests.length > 0) {
          yield* results.next();
        }
      },
      *spawn<T>(fn: () => Operation<T>) {
        let { operation, resolve } = withResolvers<Task<T>>();
        let request: SpawnRequest<unknown> = {
          operation: fn,
          resolve: resolve as Resolve<unknown>,
        };
        requests.unshift(request);
        yield* input.send();
        return {
          *[Symbol.iterator]() {
            try {
              return yield* operation;
            } finally {
              // Abandoning the wait withdraws the request, so work nobody is
              // waiting for is never admitted.
              let index = requests.indexOf(request);
              if (index !== -1) {
                requests.splice(index, 1);
              }
            }
          },
        };
      },
    });
  });
}

interface SpawnRequest<T> {
  operation(): Operation<T>;
  resolve: Resolve<Task<T>>;
}
