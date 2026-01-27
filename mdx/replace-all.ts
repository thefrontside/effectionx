import type { Operation } from "effection";

/**
 * Asynchronously replace all matches of a regex pattern in a string.
 * Unlike `String.prototype.replace`, the replacement function can be an Effection operation,
 * allowing for async replacements.
 *
 * @example
 * ```ts
 * import { replaceAll } from "@effectionx/mdx";
 *
 * const result = yield* replaceAll(
 *   "Hello {{name}}, welcome to {{place}}!",
 *   /\{\{(\w+)\}\}/g,
 *   function* (match) {
 *     const [, key] = match;
 *     // Could fetch from database, API, etc.
 *     const values = { name: "World", place: "Effection" };
 *     return values[key] ?? match[0];
 *   }
 * );
 * // result: "Hello World, welcome to Effection!"
 * ```
 */
export function* replaceAll(
  input: string,
  regex: RegExp,
  replacement: (match: RegExpMatchArray) => Operation<string>,
): Operation<string> {
  // Ensure global flag is set for matchAll
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const matcher = new RegExp(regex.source, flags);

  // Get all matches
  const matches = Array.from(input.matchAll(matcher));

  if (matches.length === 0) {
    return input;
  }

  // Process all replacements
  const replacements: string[] = [];
  for (const match of matches) {
    const replaced = yield* replacement(match);
    replacements.push(replaced);
  }

  // Convert capturing groups to non-capturing for split
  // (capturing groups would be included in the split result)
  const splitSource = regex.source.replace(/(?<!\\)\((?!\?:)/g, "(?:");
  const splitter = new RegExp(splitSource, flags);

  // Split and reconstruct with replacements
  const parts = input.split(splitter);

  let result = parts[0];
  for (let i = 0; i < replacements.length; i++) {
    result += replacements[i] + parts[i + 1];
  }

  return result;
}
