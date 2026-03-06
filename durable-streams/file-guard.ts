/**
 * useFileContentGuard — replay guard for file-backed effects.
 *
 * Detects when a file's content has changed since the journal entry was
 * recorded. Effects store the file path in their description (as an extra
 * field beyond `type` and `name`) and the content hash in their result
 * value. This guard reads the path from `event.description.path`, computes
 * the current hash during the check phase, and compares against
 * `event.result.value.contentHash` during the decide phase.
 *
 * This is the primary use case for the executable document runtime:
 * if a source file has changed, the system should detect it and error
 * rather than silently replaying stale content.
 *
 * See replay-guard-spec.md §6.
 */

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { call, useScope } from "effection";
import type { Operation } from "effection";
import { StaleInputError } from "./errors.ts";
import { ReplayGuard, type ReplayOutcome } from "./replay-guard.ts";

/**
 * Compute a SHA-256 hash of file content.
 *
 * Uses Node's crypto module.
 */
async function computeFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  const hash = createHash("sha256").update(content).digest("hex");
  return hash;
}

/**
 * Install a file content replay guard on the current scope.
 *
 * Effects that read files should:
 * - Store the file path as an extra field on the effect description
 *   (e.g., `{ type: "call", name: "resolve", path: "./component.mdx" }`)
 * - Return a rich result that includes the content hash alongside the
 *   content (e.g., `{ content: "...", contentHash: "sha256:abc123" }`)
 *
 * During replay, if the file's current content hash differs from the
 * hash stored in the result value, the guard returns an error outcome
 * and replay halts with `StaleInputError`.
 *
 * ## Lifecycle Notes
 *
 * - **Install timing**: Must be called before `durableRun()` so the guard
 *   observes all journal events during the check phase.
 * - **Cache lifetime**: The internal file hash cache lives for the scope's
 *   lifetime. Each `durableRun()` creates a fresh scope chain, so caches
 *   don't persist across workflow runs.
 * - **Check/Decide separation**: The check phase runs before replay starts
 *   (I/O allowed), and the decide phase runs during replay (synchronous).
 *   The cache is populated in check and only read in decide — no concurrent
 *   mutation.
 * - **Cancellation**: File hashing in the check phase uses `yield* call()`,
 *   making it cancellable if the workflow is aborted during startup.
 *
 * ## Usage
 *
 * ```ts
 * function* workflow(): Operation<void> {
 *   // Install the guard — children inherit it
 *   yield* useFileContentGuard();
 *
 *   // Effects store path in description, hash in result
 *   const { content } = yield* durableCall("resolve", async () => {
 *     const data = await Deno.readTextFile("./input.txt");
 *     return { content: data, contentHash: sha256(data) };
 *   });
 *   // description: { type: "call", name: "resolve", path: "./input.txt" }
 *   // result: { status: "ok", value: { content: "...", contentHash: "sha256:..." } }
 *
 *   yield* durableRun(innerWorkflow, { stream });
 * }
 * ```
 *
 * Note: The guard only validates events that have `path` in their
 * description and `contentHash` in their result value. Events without
 * these fields pass through unchanged (preserving "logs are authoritative"
 * for effects that don't opt in).
 */
export function* useFileContentGuard(): Operation<void> {
  const scope = yield* useScope();

  // Cache: filePath → current SHA, populated during check phase
  const cache = new Map<string, string>();

  scope.around(ReplayGuard, {
    /**
     * Phase 1: Check — hash files mentioned in the effect description.
     *
     * Runs in generator context before replay begins. I/O is allowed.
     * Results are cached for the decide phase.
     */
    *check([event], next): Operation<void> {
      const filePath = event.description.path;
      if (typeof filePath === "string") {
        if (!cache.has(filePath)) {
          try {
            const currentSHA = yield* call(() => computeFileHash(filePath));
            cache.set(filePath, currentSHA);
          } catch {
            // File doesn't exist or is unreadable — will be detected as
            // stale in decide phase since cached SHA will be undefined
          }
        }
      }
      // Always call next — other middleware may need to check this event too
      return yield* next(event);
    },

    /**
     * Phase 2: Decide — compare stored hash to current hash.
     *
     * Must be pure and synchronous — no I/O, no side effects.
     * Reads from the cache populated during check phase.
     *
     * Guards access `event.description.path` for the file path (input)
     * and `event.result.value.contentHash` for the recorded hash (output).
     */
    decide([event], next): ReplayOutcome {
      const filePath = event.description.path;
      if (typeof filePath !== "string") {
        // No file path in description — not a file-backed effect
        return next(event);
      }

      // Read the recorded hash from the result value
      const resultValue =
        event.result.status === "ok" ? event.result.value : undefined;
      const storedHash = (resultValue as Record<string, unknown> | undefined)
        ?.contentHash;
      if (typeof storedHash !== "string") {
        // No content hash in result — not a file-backed effect
        return next(event);
      }

      const currentSHA = cache.get(filePath);

      if (currentSHA === undefined) {
        // File was unreadable during check (probably deleted)
        return {
          outcome: "error",
          error: new StaleInputError(
            `File not found or unreadable: ${filePath}`,
            {
              coroutineId: event.coroutineId,
              description: event.description,
            },
          ),
        };
      }

      if (currentSHA !== storedHash) {
        return {
          outcome: "error",
          error: new StaleInputError(
            `File changed: ${filePath} ` +
              `(recorded: ${String(storedHash).slice(0, 8)}..., ` +
              `current: ${currentSHA.slice(0, 8)}...)`,
            {
              coroutineId: event.coroutineId,
              description: event.description,
            },
          ),
        };
      }

      // No opinion — delegate to next middleware or default
      return next(event);
    },
  });
}
