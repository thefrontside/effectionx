/**
 * Unified tags context for K6 metrics tagging.
 *
 * Groups are stored as a derived property on the tags map using "::" separator.
 * Call `initTags()` at the start of your main() operation to seed from exec.vu.tags.
 *
 * @packageDocumentation
 */

import { createContext, type Operation } from "effection";
import exec from "k6/execution";

/**
 * Normalized tags map used for K6 metrics tagging.
 */
export type Tags = Record<string, string>;

/**
 * Internal separator for group path storage.
 */
const GROUP_SEPARATOR = "::";

/**
 * Parse raw tags object into normalized Tags map.
 */
function parseTags(raw: Record<string, unknown> | undefined): Tags {
  return Object.fromEntries(
    Object.entries(raw ?? {})
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, String(v)]),
  );
}

/**
 * Context holding the current tags.
 * Default is empty - call initTags() to seed from exec.vu.tags.
 */
export const TagsContext = createContext<Tags>("k6.tags", {});

/**
 * Initialize tags context from K6's exec.vu.tags.
 * Call this at the start of your main() operation.
 *
 * @example
 * ```typescript
 * export default main(function*() {
 *   yield* initTags();
 *   // Now useTags(), useGroups(), etc. work correctly
 * });
 * ```
 */
export function* initTags(): Operation<void> {
  const vuTags = parseTags(exec?.vu?.tags);
  yield* TagsContext.set(vuTags);
}

/**
 * Get current tags map.
 */
export function useTags(): Operation<Tags> {
  return TagsContext.expect();
}

/**
 * Run an operation with additional/overridden tags.
 */
export function* withTags<T>(
  overlay: Tags,
  op: () => Operation<T>,
): Operation<T> {
  const current = yield* useTags();
  return yield* TagsContext.with({ ...current, ...overlay }, op);
}

/**
 * Get current group path as array, derived from tags.group.
 */
export function* useGroups(): Operation<string[]> {
  const tags = yield* useTags();
  const groupTag = tags.group ?? "";
  if (groupTag === "") return [];
  return groupTag.split(GROUP_SEPARATOR).filter((s) => s !== "");
}

/**
 * Append a group to current context for this scope.
 */
export function* group(name: string): Operation<void> {
  const groups = yield* useGroups();
  const tags = yield* useTags();
  yield* TagsContext.set({
    ...tags,
    group: [...groups, name].join(GROUP_SEPARATOR),
  });
}

/**
 * Run an operation in a nested group context.
 */
export function* withGroup<T>(
  name: string,
  op: () => Operation<T>,
): Operation<T> {
  const groups = yield* useGroups();
  return yield* withTags(
    { group: [...groups, name].join(GROUP_SEPARATOR) },
    op,
  );
}
