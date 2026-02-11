import {
  createQueue,
  resource,
  scoped,
  spawn,
  Err,
  type Result,
  type Stream,
  type Yielded,
} from "effection";

/**
 * Trying to connect, but not sure yet.
 */
type Pending = {
  type: "pending";
};

/**
 * The connection failed completely. Nothing was ever returned.
 *  There is no record that has been delivered
 */
type Failed = {
  type: "failed";
  error: Error;
};

/**
 * The connection is active and data is flowing.
 */
type Live<T> = {
  type: "live";
  latest: T;
};

/**
 * The connection was closed by the remote end in an orderly fashion .
 */
type Closed<T, TClose> = {
  type: "closed";
  latest: T;
  result: Result<TClose>;
};

export type ConnectionState<T, TClose> =
  | Pending
  | Failed
  | Live<T>
  | Closed<T, TClose>;

export interface Connection<T, TClose>
  extends Stream<ConnectionState<T, TClose>, never> {
  initial: ConnectionState<T, TClose>;
}

export function createConnection<T, TClose>(
  stream: Stream<T, TClose>,
): Connection<T, TClose> {
  let initial: ConnectionState<T, TClose> = { type: "pending" };
  let connection = resource<Yielded<Connection<T, TClose>>>(
    function* (provide) {
      let queue = createQueue<ConnectionState<T, TClose>, never>();

      //    queue.add(initial);

      let latest: IteratorYieldResult<T> | undefined = undefined;

      yield* spawn(function* () {
        try {
          yield* scoped(function* () {
            let subscription = yield* stream;
            let next = yield* subscription.next();
            while (!next.done) {
              latest = next;
              queue.add({ type: "live", latest: latest.value });
              next = yield* subscription.next();
            }
            if (!latest) {
              queue.add({
                type: "failed",
                error: new Error(
                  "connection closed before returning anything",
                  { cause: next.value },
                ),
              });
            }
          });
        } catch (cause) {
          let error =
            cause instanceof Error ? cause : new Error("unknown", { cause });
          if (latest) {
            queue.add({
              type: "closed",
              latest: latest.value,
              result: Err(error),
            });
          } else {
            queue.add({ type: "failed", error });
          }
        }
      });

      yield* provide(queue);
    },
  );

  return Object.assign(connection, {
    initial,
  });
}
