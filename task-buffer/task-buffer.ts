import {
  createChannel,
  Err,
  Ok,
  type Operation,
  type Resolve,
  resource,
  type Result,
  spawn,
  type Stream,
  type Task,
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
   * Spawn `op` in the task buffer when there is room available. If
   *  there is room, then this operation will complete immediately.
   * Otherwise, it will return once there is room in the buffer and
   * the task is successfully spawned.
   * `spawn()` operation will not return until the task has actually
   * been spawned.
   *
   * @param op - the operation to spawn in the buffer.
   * @returns the spawned task.
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

    yield* spawn(function* () {
      while (true) {
        if (requests.length === 0) {
          yield* next(input);
        } else if (buffer.size < max) {
          let request = requests.pop()!;
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
          yield* next(output);
        }
      }
    });

    yield* provide({
      *[Symbol.iterator]() {
        let outputs = yield* output;
        while (buffer.size > 0 || requests.length > 0) {
          yield* outputs.next();
        }
      },
      *spawn<T>(fn: () => Operation<T>) {
        let { operation, resolve } = withResolvers<Task<T>>();
        requests.unshift({
          operation: fn,
          resolve: resolve as Resolve<unknown>,
        });
        yield* input.send();
        return operation;
      },
    });
  });
}

interface SpawnRequest<T> {
  operation(): Operation<T>;
  resolve: Resolve<Task<T>>;
}

function* next<T, TClose>(
  stream: Stream<T, TClose>,
): Operation<IteratorResult<T, TClose>> {
  let subscription = yield* stream;
  return yield* subscription.next();
}
