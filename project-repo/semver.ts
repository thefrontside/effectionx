import { rsort } from "semver";

/**
 * Extract a semver version string from an input string (e.g., tag name).
 * Returns "0.0.0" if no valid semver is found.
 *
 * @example
 * ```ts
 * import { extractVersion } from "@effectionx/git";
 *
 * extractVersion("v3.2.1");     // "3.2.1"
 * extractVersion("release-1.0.0-beta.1"); // "1.0.0-beta.1"
 * extractVersion("not-a-version"); // "0.0.0"
 * ```
 */
export function extractVersion(input: string): string {
  // Regex from https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
  const parts = input.match(
    /(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?/,
  );
  if (parts) {
    return parts[0];
  }
  return "0.0.0";
}

/**
 * Find the latest semver tag from an array of tags.
 *
 * @example
 * ```ts
 * import { findLatestSemverTag } from "@effectionx/git";
 *
 * const tags = [
 *   { name: "v1.0.0" },
 *   { name: "v2.0.0" },
 *   { name: "v1.5.0" },
 * ];
 *
 * const latest = findLatestSemverTag(tags);
 * console.log(latest?.name); // "v2.0.0"
 * ```
 */
export function findLatestSemverTag<T extends { name: string }>(
  tags: T[],
): T | undefined {
  if (tags.length === 0) {
    return undefined;
  }

  const versions = tags.map((tag) => extractVersion(tag.name));
  const [latest] = rsort(versions);

  return tags.find((tag) => tag.name.endsWith(latest));
}
