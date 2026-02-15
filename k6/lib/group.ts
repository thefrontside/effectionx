/**
 * Async-aware group() implementation using Effection contexts.
 *
 * This solves K6's group context loss problem (issues #2848, #5435)
 * where metrics get attributed to wrong groups after async operations.
 *
 * @example
 * ```typescript
 * import { main, group, currentGroupPath } from '@effectionx/k6';
 *
 * export default main(function*() {
 *   yield* group('api-tests', function*() {
 *     const response = yield* httpGet('https://api.example.com');
 *
 *     // Context is preserved across async boundaries!
 *     console.log(yield* currentGroupPath()); // ['api-tests']
 *
 *     yield* group('nested', function*() {
 *       console.log(yield* currentGroupPath()); // ['api-tests', 'nested']
 *     });
 *   });
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
 * Execute an operation within a named group.
 *
 * The group name is scoped - it automatically reverts when the
 * operation completes, even if it throws an error.
 *
 * Uses `Context.with()` for proper scoping (not `Context.set()`),
 * ensuring context is restored after the operation completes.
 *
 * @param name - The group name
 * @param op - The operation to run within the group
 * @returns The result of the operation
 *
 * @example
 * ```typescript
 * yield* group('outer', function*() {
 *   // currentGroupPath() returns ['outer']
 *
 *   yield* group('inner', function*() {
 *     // currentGroupPath() returns ['outer', 'inner']
 *   });
 *
 *   // Back to ['outer'] after inner completes
 * });
 * ```
 */
export function* group<T>(name: string, op: () => Operation<T>): Operation<T> {
  const parent = yield* GroupContext.expect();
  // Use .with() for scoped context - automatically restores after op completes
  return yield* GroupContext.with([...parent, name], op);
}

/**
 * Get the current group path as an array.
 *
 * Returns the full path from root to current group.
 * Empty array if not inside any group.
 *
 * @returns Array of group names from outermost to innermost
 *
 * @example
 * ```typescript
 * yield* group('api', function*() {
 *   yield* group('users', function*() {
 *     const path = yield* currentGroupPath();
 *     // path = ['api', 'users']
 *   });
 * });
 * ```
 */
export function* currentGroupPath(): Operation<string[]> {
  return yield* GroupContext.expect();
}

/**
 * Get the current (innermost) group name.
 *
 * Returns undefined if not inside any group.
 *
 * @returns The innermost group name, or undefined
 *
 * @example
 * ```typescript
 * yield* group('api', function*() {
 *   yield* group('users', function*() {
 *     const name = yield* currentGroupName();
 *     // name = 'users'
 *   });
 * });
 * ```
 */
export function* currentGroupName(): Operation<string | undefined> {
  const path = yield* currentGroupPath();
  return path.length > 0 ? path[path.length - 1] : undefined;
}

/**
 * Get the current group path as a string.
 *
 * Groups are joined with "/" separator.
 * Returns empty string if not inside any group.
 *
 * @returns Group path string like "api/users/list"
 *
 * @example
 * ```typescript
 * yield* group('api', function*() {
 *   yield* group('users', function*() {
 *     const pathStr = yield* currentGroupString();
 *     // pathStr = 'api/users'
 *   });
 * });
 * ```
 */
export function* currentGroupString(): Operation<string> {
  const path = yield* currentGroupPath();
  return path.join("/");
}
