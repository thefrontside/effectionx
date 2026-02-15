import type { ConformanceResult } from "./types.ts";

/**
 * Test 8: AbortController Support
 *
 * Validates AbortController/AbortSignal support, which is used by
 * Effection's useAbortSignal() operation for cancellation integration.
 *
 * This is OPTIONAL - Effection can work without it, but useAbortSignal()
 * won't be available.
 *
 * Tests:
 * - AbortController constructor exists
 * - AbortSignal is accessible via controller.signal
 * - signal.aborted reflects abort state
 * - abort() triggers the signal
 * - AbortSignal event listeners work (if supported)
 */
export function testAbortController(): ConformanceResult {
  const checks: string[] = [];

  try {
    // Test AbortController exists
    if (typeof AbortController !== "function") {
      return {
        pass: false,
        message: "AbortController does not exist",
        details: "useAbortSignal() will not be available, but Effection core will work",
      };
    }
    checks.push("AbortController constructor exists");

    // Test AbortController can be instantiated
    let controller: AbortController;
    try {
      controller = new AbortController();
    } catch (e) {
      return {
        pass: false,
        message: `AbortController instantiation failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    checks.push("AbortController can be instantiated");

    // Test signal property exists
    const signal = controller.signal;
    if (!signal) {
      return {
        pass: false,
        message: "AbortController.signal is not defined",
      };
    }
    checks.push("AbortController.signal exists");

    // Test signal.aborted is initially false
    if (signal.aborted !== false) {
      return {
        pass: false,
        message: "AbortSignal.aborted should initially be false",
        details: `Got: ${signal.aborted}`,
      };
    }
    checks.push("AbortSignal.aborted initially false");

    // Test abort() method exists
    if (typeof controller.abort !== "function") {
      return {
        pass: false,
        message: "AbortController.abort() method does not exist",
      };
    }
    checks.push("AbortController.abort() method exists");

    // Test abort() changes signal.aborted
    controller.abort();
    // Use a fresh read of the property to avoid TypeScript's type narrowing
    const abortedAfter = controller.signal.aborted;
    if (!abortedAfter) {
      return {
        pass: false,
        message: "AbortController.abort() did not set signal.aborted to true",
        details: `Got: ${abortedAfter}`,
      };
    }
    checks.push("abort() sets signal.aborted to true");

    // Test abort reason (ES2022 feature)
    const controller2 = new AbortController();
    const customReason = new Error("custom abort reason");
    controller2.abort(customReason);

    if (controller2.signal.reason === customReason) {
      checks.push("AbortSignal.reason captures abort reason");
    } else {
      checks.push("AbortSignal.reason not supported (ES2022 feature)");
    }

    // Test AbortSignal.aborted static method (if available)
    if (typeof AbortSignal.abort === "function") {
      const abortedSignal = AbortSignal.abort();
      if (abortedSignal.aborted) {
        checks.push("AbortSignal.abort() static method works");
      }
    } else {
      checks.push("AbortSignal.abort() not available");
    }

    // Test AbortSignal.timeout (if available)
    if (typeof AbortSignal.timeout === "function") {
      checks.push("AbortSignal.timeout() available");
    } else {
      checks.push("AbortSignal.timeout() not available");
    }

    return {
      pass: true,
      message: "AbortController support confirmed",
      details: checks.join("; "),
    };
  } catch (error) {
    return {
      pass: false,
      message: `AbortController test threw error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Async AbortController test that tests event listener functionality.
 */
export async function testAbortControllerAsync(): Promise<ConformanceResult> {
  const checks: string[] = [];

  try {
    // Test abort event listener
    const controller = new AbortController();
    let eventFired = false;
    let eventType = "";

    controller.signal.addEventListener("abort", (event) => {
      eventFired = true;
      eventType = event.type;
    });

    controller.abort();

    // Give microtasks a chance to run
    await Promise.resolve();

    if (!eventFired) {
      return {
        pass: false,
        message: "abort event listener did not fire",
        details: "Event-based abort handling may not work",
      };
    }

    if (eventType !== "abort") {
      return {
        pass: false,
        message: "abort event type incorrect",
        details: `Expected "abort", got "${eventType}"`,
      };
    }
    checks.push("abort event listener works");

    // Test onabort handler (alternative to addEventListener)
    const controller2 = new AbortController();
    let onabortFired = false;

    // onabort may not be supported in all environments
    if ("onabort" in controller2.signal) {
      (controller2.signal as unknown as { onabort: (() => void) | null }).onabort = () => {
        onabortFired = true;
      };
      controller2.abort();
      await Promise.resolve();

      if (onabortFired) {
        checks.push("signal.onabort handler works");
      } else {
        checks.push("signal.onabort exists but did not fire");
      }
    } else {
      checks.push("signal.onabort not supported");
    }

    return {
      pass: true,
      message: "AbortController async features confirmed",
      details: checks.join("; "),
    };
  } catch (error) {
    return {
      pass: false,
      message: `Async AbortController test threw error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
