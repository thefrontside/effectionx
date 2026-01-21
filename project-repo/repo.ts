import { exec } from "@effectionx/process";
import type { Operation } from "effection";
import { findLatestSemverTag } from "./semver.ts";

/**
 * Represents a git reference (tag, branch, or commit)
 */
export interface Ref {
  /** The ref name (e.g., "v3.0.0", "main") */
  name: string;
  /** The full repository identifier in "owner/repo" format */
  nameWithOwner: string;
  /** URL to view this ref on GitHub */
  url: string;
}

/**
 * Options for creating a repository abstraction
 */
export interface RepoOptions {
  /** Repository name */
  name: string;
  /** Repository owner (organization or user) */
  owner: string;
}

/**
 * Repository abstraction for working with git tags
 */
export interface Repo {
  /** Repository name */
  name: string;
  /** Repository owner */
  owner: string;
  /**
   * Get all tags matching a pattern
   *
   * @example
   * ```ts
   * const tags = yield* repo.tags(/^v4\./);
   * ```
   */
  tags(matching: RegExp): Operation<Ref[]>;
  /**
   * Get the latest semver tag matching a pattern
   *
   * @example
   * ```ts
   * const latest = yield* repo.latest(/^v4\./);
   * console.log(latest.name); // "v4.2.1"
   * ```
   */
  latest(matching: RegExp): Operation<Ref>;
}

/**
 * Create a repository abstraction for working with git tags.
 * This assumes you're running commands from within the repository.
 *
 * @example
 * ```ts
 * import { createRepo } from "@effectionx/git";
 *
 * const repo = createRepo({ owner: "thefrontside", name: "effection" });
 *
 * // Get all v4.x tags
 * const v4Tags = yield* repo.tags(/^v4\./);
 *
 * // Get the latest v4.x tag
 * const latest = yield* repo.latest(/^v4\./);
 * console.log(latest.name); // "v4.2.1"
 * console.log(latest.url);  // "https://github.com/thefrontside/effection/tree/v4.2.1"
 * ```
 */
export function createRepo(options: RepoOptions): Repo {
  const { name, owner } = options;

  const repo: Repo = {
    name,
    owner,

    *tags(matching: RegExp): Operation<Ref[]> {
      const result = yield* exec("git tag").expect();
      const names = result.stdout
        .trim()
        .split(/\s+/)
        .filter((tag: string) => matching.test(tag));

      return names.map((tagname: string) => ({
        name: tagname,
        nameWithOwner: `${owner}/${name}`,
        url: `https://github.com/${owner}/${name}/tree/${tagname}`,
      }));
    },

    *latest(matching) {
      const tags = yield* repo.tags(matching);
      const latest = findLatestSemverTag(tags);

      if (!latest) {
        throw new Error(`Could not retrieve latest tag matching ${matching}`);
      }

      return latest;
    },
  };

  return repo;
}
