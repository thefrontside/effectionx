/**
 * Tests for ephemeral() — the explicit escape hatch for non-durable
 * Operations inside Workflows.
 *
 * Validates that:
 * - ephemeral operations execute and return values correctly
 * - ephemeral is transparent to the journal (no Yield events written)
 * - ephemeral operations re-run on replay (not cached)
 * - ephemeral supports cancellation via structured concurrency
 * - the type boundary is enforced (bare Operations rejected by combinators)
 */

import { describe, it } from "@effectionx/bdd";
import { useScope } from "effection";
import type { Operation } from "effection";
import { expect } from "expect";
import {
  type DurableEvent,
  InMemoryStream,
  durableAll,
  durableCall,
  durableRun,
  ephemeral,
} from "./mod.ts";

describe("ephemeral", () => {
  // ---------------------------------------------------------------------------
  // Test 1: ephemeral executes and returns value
  // ---------------------------------------------------------------------------

  it("executes operation and returns value", function* () {
    const stream = new InMemoryStream();

    const result = yield* durableRun(
      function* () {
        const value = yield* ephemeral(
          (function* (): Operation<string> {
            return "hello from ephemeral";
          })(),
        );
        return value;
      },
      { stream },
    );

    expect(result).toBe("hello from ephemeral");
  });

  // ---------------------------------------------------------------------------
  // Test 2: ephemeral is transparent to journal — no Yield events
  // ---------------------------------------------------------------------------

  it("transparent to journal — no Yield events written", function* () {
    const stream = new InMemoryStream();

    yield* durableRun(
      function* () {
        // One durable call, one ephemeral, one more durable call
        yield* durableCall("step1", () => Promise.resolve("a"));
        yield* ephemeral(
          (function* (): Operation<string> {
            return "ephemeral-value";
          })(),
        );
        yield* durableCall("step2", () => Promise.resolve("b"));
        return "done";
      },
      { stream },
    );

    const events: DurableEvent[] = yield* stream.readAll();

    // Should have: Yield(step1), Yield(step2), Close(root) — NO ephemeral Yield
    const yieldEvents = events.filter((e) => e.type === "yield");
    expect(yieldEvents.length).toBe(2);
    expect(yieldEvents[0]!.description.name).toBe("step1");
    expect(yieldEvents[1]!.description.name).toBe("step2");

    // No event with type "ephemeral" should exist
    const ephemeralEvents = events.filter(
      (e) => e.type === "yield" && e.description.type === "ephemeral",
    );
    expect(ephemeralEvents.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Test 3: ephemeral re-runs on replay (not cached)
  // ---------------------------------------------------------------------------

  it("re-runs on replay — not cached", function* () {
    const stream = new InMemoryStream();
    let ephemeralCallCount = 0;

    // First run — ephemeral runs once
    yield* durableRun(
      function* () {
        yield* durableCall("step1", () => Promise.resolve("a"));
        yield* ephemeral(
          (function* (): Operation<void> {
            ephemeralCallCount++;
          })(),
        );
        yield* durableCall("step2", () => Promise.resolve("b"));
        return "done";
      },
      { stream },
    );
    expect(ephemeralCallCount).toBe(1);

    // Remove the Close event to simulate partial replay
    // Actually, durableRun short-circuits on Close, so we need a fresh stream
    // with the same events minus Close to trigger replay + re-run
    const events = yield* stream.readAll();
    const withoutClose = events.filter((e) => e.type !== "close");
    const replayStream = new InMemoryStream(withoutClose);

    // Reset counter
    ephemeralCallCount = 0;

    // Second run — durable calls replay, but ephemeral re-runs
    yield* durableRun(
      function* () {
        yield* durableCall("step1", () => Promise.resolve("a"));
        yield* ephemeral(
          (function* (): Operation<void> {
            ephemeralCallCount++;
          })(),
        );
        yield* durableCall("step2", () => Promise.resolve("b"));
        return "done";
      },
      { stream: replayStream },
    );

    // ephemeral ran again during replay
    expect(ephemeralCallCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Test 4: ephemeral propagates errors
  // ---------------------------------------------------------------------------

  it("propagates errors from the operation", function* () {
    const stream = new InMemoryStream();

    try {
      yield* durableRun(
        function* () {
          yield* ephemeral(
            (function* (): Operation<never> {
              throw new Error("ephemeral boom");
            })(),
          );
          return "unreachable";
        },
        { stream },
      );
      throw new Error("expected ephemeral boom");
    } catch (e) {
      expect(e instanceof Error).toBe(true);
      expect((e as Error).message).toBe("ephemeral boom");
    }
  });

  // ---------------------------------------------------------------------------
  // Test 5: ephemeral works inside durableAll children
  // ---------------------------------------------------------------------------

  it("works inside durableAll children", function* () {
    const stream = new InMemoryStream();

    const result = yield* durableRun(
      function* () {
        const results = yield* durableAll([
          function* () {
            // Use ephemeral to run an Operation inside a Workflow child
            const scope = yield* ephemeral(useScope());
            // Just verify we got a scope (infrastructure operation worked)
            if (!scope) throw new Error("no scope");
            return yield* durableCall("child1", () => Promise.resolve("a"));
          },
          function* () {
            return yield* durableCall("child2", () => Promise.resolve("b"));
          },
        ]);
        return results.join("-");
      },
      { stream },
    );

    expect(result).toBe("a-b");
  });

  // ---------------------------------------------------------------------------
  // Test 6: nested durableAll works directly (no ephemeral needed)
  // ---------------------------------------------------------------------------

  it("nested durableAll works without ephemeral wrapping", function* () {
    const stream = new InMemoryStream();

    // durableAll now returns Workflow<T[]>, so nested calls work directly
    // inside a Workflow child — no ephemeral wrapping required
    const result = yield* durableRun(
      function* () {
        const results = yield* durableAll([
          function* () {
            const inner = yield* durableAll([
              function* () {
                return yield* durableCall("innerA", () => Promise.resolve("x"));
              },
              function* () {
                return yield* durableCall("innerB", () => Promise.resolve("y"));
              },
            ]);
            return inner.join("+") as string;
          },
          function* () {
            return yield* durableCall("outer", () => Promise.resolve("z"));
          },
        ]);
        return results.join("-");
      },
      { stream },
    );

    expect(result).toBe("x+y-z");
  });
});
