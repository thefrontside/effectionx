/**
 * Shared hashing utility for durable effects and replay guards.
 *
 * Uses the Web Crypto API (`crypto.subtle`), available in Node 22+,
 * Deno, and browsers. Returns an Operation<string> so it integrates
 * naturally with Effection's structured concurrency.
 */

import { call } from "effection";
import type { Operation } from "effection";

/**
 * Compute a SHA-256 hash of a string.
 *
 * Returns `"sha256:<hex>"` format for easy identification and comparison
 * in replay guard logic.
 */
export function* computeSHA256(content: string): Operation<string> {
  const hashBuffer = yield* call(() =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)),
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return `sha256:${hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
