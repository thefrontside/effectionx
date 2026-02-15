/**
 * Async-aware group context APIs built with Effection contexts.
 *
 * This solves K6's group context loss problem (issues #2848, #5435)
 * where metrics get attributed to wrong groups after async operations.
 *
 * @example
 * ```typescript
 * import { main, group, withGroup, useGroups } from '@effectionx/k6';
 *
 * export default main(function*() {
 *   yield* group('api-tests');
 *   console.log(yield* useGroups()); // ['api-tests']
 *
 *   yield* withGroup('nested', function*() {
 *     console.log(yield* useGroups()); // ['api-tests', 'nested']
 *   });
 *
 *   console.log(yield* useGroups()); // ['api-tests']
 * });
 * ```
 *
 * @packageDocumentation
 */

import { createContext, type Operation } from "effection";

/**
 * Context holding the current group path as an array.
 *
 * Using an array allows tracking nested groups and building
 * hierarchical group names (e.g., "api-tests/nested/deep").
 */
export const GroupContext = createContext<string[]>("k6.group", []);

/**
 * Append a named group to the current group context.
 *
 * This mutation is persistent for the remainder of the current scope.
 * Calling `group()` multiple times appends multiple segments.
 *
 * @param name - The group name
 * @returns Nothing
 *
 * @example
 * ```typescript
 * yield* group('outer');
 * console.log(yield* useGroups()); // ['outer']
 *
 * yield* group('inner');
 * console.log(yield* useGroups()); // ['outer', 'inner']
 * ```
 */
export function* group(name: string): Operation<void> {
  const groups = yield* GroupContext.expect();
  yield* GroupContext.set([...groups, name]);
}

/**
 * Run an operation in a nested group context.
 *
 * Unlike `group()`, this does not permanently mutate the current context.
 * The appended group is only visible while `op` executes.
 *
 * @param name - The group name
 * @param op - The operation to run in the nested group
 * @returns The result of `op`
 *
 * @example
 * ```typescript
 * yield* group('api');
 *
 * yield* withGroup('users', function*() {
 *   console.log(yield* useGroups()); // ['api', 'users']
 * });
 *
 * console.log(yield* useGroups()); // ['api']
 * ```
 */
export function* withGroup<T>(
  name: string,
  op: () => Operation<T>,
): Operation<T> {
  const groups = yield* GroupContext.expect();
  return yield* GroupContext.with([...groups, name], op);
}

/**
 * Get all current group segments from outermost to innermost.
 *
 * @returns Group path as an array
 *
 * @example
 * ```typescript
 * yield* group('api');
 *
 * yield* withGroup('users', function*() {
 *   console.log(yield* useGroups()); // ['api', 'users']
 * });
 * ```
 */
export function* useGroups(): Operation<string[]> {
  return yield* GroupContext.expect();
}
