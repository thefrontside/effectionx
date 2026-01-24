import type { Stream } from "effection";

/**
 * Lift a synchronous iterable into a stream context.
 *
 * @param iterable - synchronous iterable to present as an Effection `Stream`
 * @returns a stream that yields the members of the iterable.
 */
export function streamOf<T, TDone>(
  iterable: Iterable<T, TDone>,
): Stream<T, TDone> {
  return {
    *[Symbol.iterator]() {
      let iterator = iterable[Symbol.iterator]();
      return {
        *next() {
          return iterator.next();
        },
      };
    },
  };
}
