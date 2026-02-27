import type { Operation } from "effection";
import { replaceAll } from "./replace-all.ts";

/**
 * Function type for resolving JSDoc `@link` references to markdown links.
 *
 * @param symbol - The main symbol being linked (e.g., "Context", "Scope")
 * @param connector - Optional connector between symbol and method (e.g., ".", "#")
 * @param method - Optional method name (e.g., "run")
 * @returns The markdown link string
 */
export type LinkResolver = (
  symbol: string,
  connector?: string,
  method?: string,
) => Operation<string>;

/**
 * Default link resolver that creates simple markdown links.
 *
 * @example
 * ```ts
 * // "Context" -> "[Context](Context)"
 * // "Scope.run" -> "[Scope.run](Scope.run)"
 * ```
 */
export function* defaultLinkResolver(
  symbol: string,
  connector?: string,
  method?: string,
): Operation<string> {
  const parts = [symbol];
  if (symbol && connector && method) {
    parts.push(connector, method);
  }
  const name = parts.filter(Boolean).join("");
  if (name) {
    return `[${name}](${name})`;
  }
  return "";
}

/**
 * Create a sanitizer function that converts JSDoc `@link` syntax to markdown links.
 *
 * MDX throws parse errors when encountering JSDoc `{@link }` syntax, so this
 * sanitizer converts them to standard markdown links before MDX processing.
 *
 * @param resolver - Optional custom link resolver function
 * @returns A function that sanitizes JSDoc links in a string
 *
 * @example
 * ```ts
 * import { createJsDocSanitizer } from "@effectionx/mdx";
 *
 * const sanitize = createJsDocSanitizer();
 *
 * // Basic usage
 * const result = yield* sanitize("{@link Context}");
 * // result: "[Context](Context)"
 *
 * // With method reference
 * const result2 = yield* sanitize("{@link Scope.run}");
 * // result2: "[Scope.run](Scope.run)"
 * ```
 *
 * @example
 * ```ts
 * // Custom resolver for API documentation links
 * const sanitize = createJsDocSanitizer(function* (symbol, connector, method) {
 *   const name = [symbol, connector, method].filter(Boolean).join("");
 *   return `[${name}](/api/${symbol}${method ? `#${method}` : ""})`;
 * });
 *
 * const result = yield* sanitize("{@link Scope.run}");
 * // result: "[Scope.run](/api/Scope#run)"
 * ```
 */
export function createJsDocSanitizer(
  resolver: LinkResolver = defaultLinkResolver,
): (doc: string) => Operation<string> {
  return function* sanitizeJsDoc(doc: string): Operation<string> {
    return yield* replaceAll(
      doc,
      /@?{@?link\s*(\w*)([^\w}])?(\w*)?([^}]*)?}/gm,
      function* (match) {
        const [, symbol, connector, method] = match;
        return yield* resolver(symbol, connector, method);
      },
    );
  };
}
