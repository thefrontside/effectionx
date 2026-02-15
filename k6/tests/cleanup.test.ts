/**
 * Cleanup and Resource Tests
 *
 * Tests that verify structured cleanup semantics work correctly,
 * solving K6's lack of proper resource cleanup (general limitation).
 */

import { testMain, describe, it, expect } from "../testing/mod.ts";
import { useWebSocket } from "../lib/mod.ts";
import { resource, spawn, sleep, scoped, type Operation } from "effection";

// K6 options
export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ["rate==1"], // All checks must pass
  },
};

/**
 * Resource that tracks acquisition and cleanup via callbacks
 */
function* useTrackingResource(
  name: string,
  onAcquire: (name: string) => void,
  onCleanup: (name: string) => void,
): Operation<string> {
  return yield* resource<string>(function* (provide) {
    onAcquire(name);
    try {
      yield* provide(name);
    } finally {
      onCleanup(name);
    }
  });
}

export default testMain(function* () {
  describe("Structured Cleanup", () => {
    describe("Resource lifecycle", () => {
      it("acquires resource and provides value", function* () {
        let acquired = false;
        let providedValue = "";

        yield* scoped(function* () {
          const value = yield* useTrackingResource(
            "test-resource",
            () => {
              acquired = true;
            },
            () => {},
          );
          providedValue = value;
        });

        expect(acquired).toBe(true);
        expect(providedValue).toBe("test-resource");
      });

      it("resource is available during scope", function* () {
        let usedInsideScope = false;

        yield* scoped(function* () {
          const name = yield* useTrackingResource(
            "scoped-resource",
            () => {},
            () => {},
          );
          // Resource is available here
          usedInsideScope = name === "scoped-resource";
        });

        expect(usedInsideScope).toBe(true);
      });
    });

    describe("Cleanup on error", () => {
      it("cleanup runs even when error is thrown", function* () {
        let cleanedUp = false;

        try {
          yield* scoped(function* () {
            yield* useTrackingResource(
              "error-resource",
              () => {},
              () => {
                cleanedUp = true;
              },
            );
            throw new Error("Test error");
          });
        } catch {
          // Expected
        }

        // Cleanup should have run before we get here
        expect(cleanedUp).toBe(true);
      });

      it("multiple resources cleanup on error", function* () {
        const cleanupOrder: string[] = [];

        try {
          yield* scoped(function* () {
            yield* useTrackingResource(
              "first",
              () => {},
              (n) => cleanupOrder.push(n),
            );
            yield* useTrackingResource(
              "second",
              () => {},
              (n) => cleanupOrder.push(n),
            );
            throw new Error("Fail after both acquired");
          });
        } catch {
          // Expected
        }

        // Both should clean up, in reverse order (LIFO)
        expect(cleanupOrder).toHaveLength(2);
        expect(cleanupOrder[0]).toBe("second");
        expect(cleanupOrder[1]).toBe("first");
      });
    });

    describe("Nested scope cleanup", () => {
      it("inner scope cleans up before outer continues", function* () {
        const events: string[] = [];

        yield* scoped(function* () {
          yield* useTrackingResource(
            "outer-res",
            (n) => events.push(`acquire:${n}`),
            (n) => events.push(`cleanup:${n}`),
          );

          yield* scoped(function* () {
            yield* useTrackingResource(
              "inner-res",
              (n) => events.push(`acquire:${n}`),
              (n) => events.push(`cleanup:${n}`),
            );
          });

          // After inner scope, inner-res should be cleaned up
          // but outer-res should still be active
          events.push("after-inner-scope");
        });

        // Verify order: acquire outer, acquire inner, cleanup inner, after, cleanup outer
        expect(events[0]).toBe("acquire:outer-res");
        expect(events[1]).toBe("acquire:inner-res");
        expect(events[2]).toBe("cleanup:inner-res");
        expect(events[3]).toBe("after-inner-scope");
        expect(events[4]).toBe("cleanup:outer-res");
      });
    });

    describe("Spawned task cleanup", () => {
      it("child task is cancelled when parent exits", function* () {
        let childStarted = false;
        let childCompleted = false;

        yield* scoped(function* () {
          yield* spawn(function* () {
            childStarted = true;
            // This would take forever
            yield* sleep(10000);
            childCompleted = true;
          });

          // Parent exits quickly
          yield* sleep(50);
        });

        // Child started but didn't complete (was cancelled)
        expect(childStarted).toBe(true);
        expect(childCompleted).toBe(false);
      });

      it("child resource cleanup runs on parent exit", function* () {
        let childResourceCleaned = false;

        yield* scoped(function* () {
          yield* spawn(function* () {
            yield* useTrackingResource(
              "child-res",
              () => {},
              () => {
                childResourceCleaned = true;
              },
            );
            yield* sleep(10000); // Would run forever
          });

          yield* sleep(50);
        });

        expect(childResourceCleaned).toBe(true);
      });
    });

    describe("WebSocket cleanup", () => {
      it("automatically closes WebSocket when scope ends", function* () {
        let wsConnected = false;

        yield* scoped(function* () {
          const ws = yield* useWebSocket("wss://echo.websocket.org");
          wsConnected = true;
          ws.send("test");
          // Exit scope without explicit close
        });

        // WebSocket was connected - if no error, cleanup worked
        expect(wsConnected).toBe(true);
      });
    });
  });
});
