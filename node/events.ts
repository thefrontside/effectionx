import { createSignal, resource, withResolvers } from "effection";
import type { Operation, Stream, Subscription } from "effection";

/**
 * Interface for objects that support Node.js EventEmitter-style event handling.
 * This includes Node.js EventEmitter and worker_threads MessagePort.
 */
export interface EventEmitterLike {
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}

/**
 * Interface for objects that support DOM EventTarget-style event handling.
 * This includes browser EventTarget and web-worker's global `self`.
 */
export interface EventTargetLike {
  addEventListener(event: string, listener: (event: unknown) => void): void;
  removeEventListener(event: string, listener: (event: unknown) => void): void;
}

/**
 * Union type for objects that support either EventEmitter or EventTarget style.
 */
export type EventSourceLike = EventEmitterLike | EventTargetLike;

function isEventTarget(target: EventSourceLike): target is EventTargetLike {
  return "addEventListener" in target;
}

/**
 * Create a {@link Stream} of events from any EventEmitter or EventTarget-like object.
 *
 * This works with:
 * - Node.js EventEmitters (using `on`/`off`)
 * - DOM EventTargets (using `addEventListener`/`removeEventListener`)
 * - web-worker's global `self` object
 *
 * For EventEmitters, events are emitted as arrays of arguments.
 * For EventTargets, events are emitted as single-element arrays containing the event object.
 *
 * See the guide on [Streams and Subscriptions](https://frontside.com/effection/docs/collections)
 * for details on how to use streams.
 *
 * @example
 * ```ts
 * import { on } from "@effectionx/node/events";
 * import { each } from "effection";
 *
 * // In a worker thread (EventTarget style)
 * for (const [event] of yield* each(on(self, "message"))) {
 *   console.log("received:", event.data);
 *   yield* each.next();
 * }
 *
 * // With Node.js EventEmitter
 * for (const [chunk] of yield* each(on(stream, "data"))) {
 *   console.log("data:", chunk);
 *   yield* each.next();
 * }
 * ```
 *
 * @param target - the event source whose events will be streamed
 * @param eventName - the name of the event to stream. E.g. "message", "data"
 * @returns a stream that will see one item for each event
 */
export function on<T extends unknown[]>(
  target: EventSourceLike | null,
  eventName: string,
): Stream<T, never> {
  return resource(function* (provide) {
    let signal = createSignal<T, never>();

    if (target) {
      if (isEventTarget(target)) {
        // EventTarget style (DOM, web-worker self)
        const listener = (event: unknown) => signal.send([event] as T);
        target.addEventListener(eventName, listener);
        try {
          yield* provide(yield* signal as Operation<Subscription<T, never>>);
        } finally {
          target.removeEventListener(eventName, listener);
        }
      } else {
        // EventEmitter style (Node.js)
        const listener = (...args: unknown[]) => signal.send(args as T);
        target.on(eventName, listener);
        try {
          yield* provide(yield* signal as Operation<Subscription<T, never>>);
        } finally {
          target.off(eventName, listener);
        }
      }
    } else {
      // null target - just provide an empty subscription
      yield* provide(yield* signal as Operation<Subscription<T, never>>);
    }
  });
}

/**
 * Create an {@link Operation} that yields the next event to be emitted by an EventEmitter or EventTarget-like object.
 *
 * This works with:
 * - Node.js EventEmitters (using `on`/`off`)
 * - DOM EventTargets (using `addEventListener`/`removeEventListener`)
 * - web-worker's global `self` object
 *
 * For EventEmitters, returns an array of arguments.
 * For EventTargets, returns a single-element array containing the event object.
 *
 * @example
 * ```ts
 * import { once } from "@effectionx/node/events";
 *
 * // Wait for a single message (EventTarget style)
 * const [event] = yield* once(self, "message");
 * console.log(event.data);
 * ```
 *
 * @param target - the event source to be watched
 * @param eventName - the name of the event to watch. E.g. "message", "close"
 * @returns an Operation that yields the next emitted event
 */
export function once<TArgs extends unknown[] = unknown[]>(
  target: EventSourceLike | null,
  eventName: string,
): Operation<TArgs> {
  const result = withResolvers<TArgs>();

  if (target) {
    if (isEventTarget(target)) {
      // EventTarget style (DOM, web-worker self)
      const listener = (event: unknown) => {
        result.resolve([event] as TArgs);
        target.removeEventListener(eventName, listener);
      };
      target.addEventListener(eventName, listener);
    } else {
      // EventEmitter style (Node.js)
      const listener = (...args: unknown[]) => {
        result.resolve(args as TArgs);
        target.off(eventName, listener);
      };
      target.on(eventName, listener);
    }
  }

  return result.operation;
}
