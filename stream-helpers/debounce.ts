import { race, sleep, type Stream } from "effection";

/**
 * Debounce stream helpers allows to reduce number of items sent downstream by taking the last value produced by the
 * source stream within a given time period and ignoring the rest.
 *
 * @param ms - The number of milliseconds to debounce the stream.
 * @returns A stream that emits the last value emitted by the source stream within the debounce period.
 */
export function debounce(
  ms: number,
): <T, TDone>(stream: Stream<T, TDone>) => Stream<T, TDone> {
  return function (stream) {
    return {
      *[Symbol.iterator]() {
        let subscription = yield* stream;
        return {
        *next() {
          let next = yield* subscription.next();
          while (!next.done) {
            let result = yield* race([sleep(ms), subscription.next()]);
            if (result) {
              next = result;
            } else {
              return next;
            }
          }
          return next;
        },
      };
      },
    };
  };
}
