import { timebox } from "@effectionx/timebox";
import type { Operation } from "effection";
import { sleep } from "effection";

/**
 * Options for convergence operations.
 */
export interface ConvergeOptions {
  /**
   * Maximum time to wait for convergence in milliseconds.
   * Default: 2000ms for `when`, 200ms for `always`
   */
  timeout?: number;

  /**
   * Interval between assertion retries in milliseconds.
   * Default: 10ms
   */
  interval?: number;
}

/**
 * Statistics about a convergence operation.
 */
export interface ConvergeStats<T> {
  /** Timestamp when convergence started */
  start: number;

  /** Timestamp when convergence ended */
  end: number;

  /** Milliseconds the convergence took */
  elapsed: number;

  /** Number of times the assertion was executed */
  runs: number;

  /** The timeout that was configured */
  timeout: number;

  /** The interval that was configured */
  interval: number;

  /** The return value from the assertion */
  value: T;
}

/**
 * Converges on an assertion by resolving when the given assertion
 * passes within the timeout period. The assertion will run repeatedly
 * at the specified interval and is considered to be passing when it
 * does not throw or return `false`.
 *
 * If the assertion never passes within the timeout period, then the
 * operation will throw with the last error received.
 *
 * @example Basic usage
 * ```ts
 * // Wait for a value to become true
 * yield* when(function*() {
 *   if (total !== 100) throw new Error(`expected 100, got ${total}`);
 *   return total;
 * });
 * ```
 *
 * @example With custom timeout
 * ```ts
 * // Wait up to 5 seconds for file to exist
 * yield* when(function*() {
 *   let exists = yield* until(access(filePath).then(() => true, () => false));
 *   if (!exists) throw new Error("file not found");
 *   return true;
 * }, { timeout: 5000 });
 * ```
 *
 * @example Using the stats
 * ```ts
 * let stats = yield* when(function*() {
 *   return yield* until(readFile(path, "utf-8"));
 * }, { timeout: 1000 });
 *
 * console.log(`Converged in ${stats.elapsed}ms after ${stats.runs} attempts`);
 * console.log(stats.value); // file content
 * ```
 *
 * @param assertion - The assertion to converge on. Can be a generator function.
 * @param options - Configuration options
 * @returns Statistics about the convergence including the final value
 */
export function when<T>(
  assertion: () => Operation<T>,
  options: ConvergeOptions = {},
): Operation<ConvergeStats<T>> {
  return convergeOn(assertion, options, false);
}

/**
 * Converges on an assertion by resolving when the given assertion
 * passes consistently throughout the timeout period. The assertion
 * will run repeatedly at the specified interval and is considered
 * to be passing when it does not throw or return `false`.
 *
 * If the assertion fails at any point during the timeout period,
 * the operation will throw immediately with that error.
 *
 * @example Basic usage
 * ```ts
 * // Ensure a value stays below 100 for 200ms
 * yield* always(function*() {
 *   if (counter >= 100) throw new Error("counter exceeded limit");
 * });
 * ```
 *
 * @example With custom timeout
 * ```ts
 * // Verify connection stays alive for 5 seconds
 * yield* always(function*() {
 *   if (!isConnected) throw new Error("connection lost");
 * }, { timeout: 5000 });
 * ```
 *
 * @param assertion - The assertion to converge on. Can be a generator function.
 * @param options - Configuration options
 * @returns Statistics about the convergence including the final value
 */
export function always<T>(
  assertion: () => Operation<T>,
  options: ConvergeOptions = {},
): Operation<ConvergeStats<T>> {
  return convergeOn(assertion, options, true);
}

/**
 * Internal convergence implementation.
 *
 * @param assertion - The assertion to run
 * @param options - Configuration options
 * @param alwaysMode - If true, assertion must pass throughout timeout (always behavior).
 *                     If false, assertion must pass at least once (when behavior).
 */
function* convergeOn<T>(
  assertion: () => Operation<T>,
  options: ConvergeOptions,
  alwaysMode: boolean,
): Operation<ConvergeStats<T>> {
  let timeout = options.timeout ?? (alwaysMode ? 200 : 2000);
  let interval = options.interval ?? 10;
  let start = Date.now();
  let runs = 0;
  let lastError: Error = new Error("convergent assertion never ran");
  let lastValue: T | undefined;

  let result = yield* timebox(timeout, function* () {
    while (true) {
      runs++;
      try {
        let value = yield* assertion();

        if (value === false) {
          let error = new Error("convergent assertion returned `false`");
          if (alwaysMode) {
            throw error;
          }
          lastError = error;
        } else {
          lastValue = value;

          if (!alwaysMode) {
            // For `when`, success on first pass
            return value;
          }
        }
      } catch (error) {
        if (alwaysMode) {
          // For `always`, fail immediately on error
          throw error;
        }
        lastError = error as Error;
      }

      yield* sleep(interval);
    }
  });

  let end = Date.now();

  if (result.timeout) {
    if (alwaysMode) {
      // For `always`, reaching timeout without error means success
      return {
        start,
        end,
        elapsed: end - start,
        runs,
        timeout,
        interval,
        value: lastValue as T,
      };
    }
    // For `when`, timeout means failure - throw the last error
    throw lastError;
  }

  // Timebox completed without timeout (only happens for `when` on success)
  return {
    start,
    end,
    elapsed: end - start,
    runs,
    timeout,
    interval,
    value: result.value,
  };
}
