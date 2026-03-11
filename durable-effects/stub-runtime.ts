/**
 * stubRuntime — test stub for DurableRuntime.
 *
 * All I/O methods throw "not stubbed" by default. Override per-test
 * to inject specific behavior. This proves that during replay, no
 * live execution occurs — if a test passes with stubRuntime(), the
 * effect was replayed from the journal.
 */

import type { DurableRuntime } from "./runtime.ts";

/**
 * Create a test stub runtime.
 *
 * Every I/O method throws by default. Pass partial overrides to
 * inject specific behavior for the test under consideration.
 *
 * ```typescript
 * const runtime = stubRuntime({
 *   *readTextFile(path) {
 *     return "file content";
 *   },
 * });
 * ```
 */
export function stubRuntime(
  overrides?: Partial<DurableRuntime>,
): DurableRuntime {
  return {
    *exec() {
      throw new Error("exec not stubbed");
    },
    *readTextFile() {
      throw new Error("readTextFile not stubbed");
    },
    *stat() {
      throw new Error("stat not stubbed");
    },
    *glob() {
      throw new Error("glob not stubbed");
    },
    *fetch() {
      throw new Error("fetch not stubbed");
    },
    env: () => undefined,
    platform: () => ({ os: "test", arch: "test" }),
    ...overrides,
  };
}
