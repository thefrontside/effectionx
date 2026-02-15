import type { ConformanceResult } from "./types.ts";

/**
 * Test 7: Timer Support
 *
 * Validates setTimeout/setInterval support, which is required for
 * Effection's sleep() operation.
 *
 * Tests:
 * - setTimeout exists and is callable
 * - clearTimeout exists and is callable
 * - setInterval exists (optional for Effection)
 * - clearInterval exists (optional for Effection)
 */
export function testTimers(): ConformanceResult {
  const checks: string[] = [];

  try {
    // Test setTimeout exists
    if (typeof setTimeout !== "function") {
      return {
        pass: false,
        message: "setTimeout does not exist",
        details: "setTimeout is required for Effection's sleep() operation",
      };
    }
    checks.push("setTimeout exists");

    // Test clearTimeout exists
    if (typeof clearTimeout !== "function") {
      return {
        pass: false,
        message: "clearTimeout does not exist",
        details: "clearTimeout is required for cancelling sleep operations",
      };
    }
    checks.push("clearTimeout exists");

    // Test setTimeout returns something (timer ID)
    const timerId = setTimeout(() => {}, 1000);
    if (timerId === undefined || timerId === null) {
      return {
        pass: false,
        message: "setTimeout did not return a timer ID",
      };
    }
    // Clean up
    clearTimeout(timerId);
    checks.push("setTimeout returns timer ID");

    // Test clearTimeout can cancel (doesn't throw)
    try {
      const id = setTimeout(() => {
        throw new Error("This should not run");
      }, 10);
      clearTimeout(id);
      checks.push("clearTimeout can cancel timers");
    } catch (e) {
      return {
        pass: false,
        message: `clearTimeout threw error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // Test setInterval exists (nice to have for interval() operation)
    if (typeof setInterval !== "function") {
      checks.push("setInterval not available (not critical)");
    } else {
      checks.push("setInterval exists");

      // Test clearInterval exists
      if (typeof clearInterval !== "function") {
        checks.push("clearInterval not available (not critical)");
      } else {
        const intervalId = setInterval(() => {}, 1000);
        clearInterval(intervalId);
        checks.push("clearInterval exists and works");
      }
    }

    return {
      pass: true,
      message: "Timer support confirmed",
      details: checks.join("; "),
    };
  } catch (error) {
    return {
      pass: false,
      message: `Timer test threw error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Async timer test that actually waits for timers to fire.
 * This validates that the event loop processes timer callbacks correctly.
 */
export async function testTimersAsync(): Promise<ConformanceResult> {
  const checks: string[] = [];

  try {
    // Test setTimeout actually fires
    const startTime = Date.now();
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 50);
    });
    const elapsed = Date.now() - startTime;

    if (elapsed < 40) {
      return {
        pass: false,
        message: "setTimeout fired too quickly",
        details: `Expected ~50ms delay, got ${elapsed}ms`,
      };
    }
    checks.push(`setTimeout fires correctly (${elapsed}ms for 50ms timeout)`);

    // Test multiple sequential timeouts
    const sequence: number[] = [];
    await new Promise<void>((resolve) => {
      setTimeout(() => sequence.push(1), 10);
      setTimeout(() => sequence.push(2), 20);
      setTimeout(() => {
        sequence.push(3);
        resolve();
      }, 30);
    });

    if (sequence.length !== 3 || sequence[0] !== 1 || sequence[1] !== 2 || sequence[2] !== 3) {
      return {
        pass: false,
        message: "setTimeout sequence order incorrect",
        details: `Expected [1,2,3], got ${JSON.stringify(sequence)}`,
      };
    }
    checks.push("setTimeout ordering works correctly");

    // Test clearTimeout actually prevents callback
    let shouldNotRun = false;
    const cancelId = setTimeout(() => {
      shouldNotRun = true;
    }, 20);
    clearTimeout(cancelId);

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    if (shouldNotRun) {
      return {
        pass: false,
        message: "clearTimeout did not prevent callback execution",
      };
    }
    checks.push("clearTimeout prevents callback execution");

    return {
      pass: true,
      message: "Full timer support confirmed",
      details: checks.join("; "),
    };
  } catch (error) {
    return {
      pass: false,
      message: `Async timer test threw error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
