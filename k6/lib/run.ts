/**
 * Effection run() adapter for K6 VU iteration lifecycle.
 *
 * K6 runs each Virtual User (VU) iteration as a function call.
 * This module adapts Effection's `run()` to work within K6's lifecycle.
 *
 * @example
 * ```typescript
 * import { main } from '@effectionx/k6';
 * import { sleep } from 'effection';
 *
 * export default main(function*() {
 *   console.log('Starting iteration');
 *   yield* sleep(100);
 *   console.log('Done');
 * });
 * ```
 *
 * @packageDocumentation
 */

import { run, type Operation } from "effection";

/**
 * Wraps an Effection operation as a K6 VU iteration function.
 *
 * The returned function is async and awaits the Effection operation
 * to completion. This ensures:
 * - Proper error propagation (test fails if operation throws)
 * - Proper cleanup (finally blocks run before iteration ends)
 * - Deterministic teardown (Effection scope closes before K6 moves on)
 *
 * @param makeOp - Factory function that creates the operation to run.
 *                 Called fresh for each VU iteration.
 * @returns An async function suitable as K6's default export.
 *
 * @example
 * ```typescript
 * export default main(function*() {
 *   const db = yield* useDatabase();
 *   yield* httpGet('https://api.example.com');
 *   // db cleanup runs even if httpGet fails or times out
 * });
 * ```
 */
export function main<T>(makeOp: () => Operation<T>) {
  return function iteration() {
    return run(makeOp);
  };
}
