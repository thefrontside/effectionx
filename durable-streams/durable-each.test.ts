/**
 * Tier 4 tests — durable iteration (durableEach).
 *
 * Validates that durableEach correctly journals each fetch,
 * replays from the journal, detects advance guard violations,
 * handles break/cancellation, and integrates with durableCall.
 */

import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import type { Operation } from "effection";
import {
  durableCall,
  durableEach,
  durableRun,
  InMemoryStream,
  type DurableEvent,
  type DurableSource,
  type Json,
} from "./mod.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a DurableSource from an array of items. */
function arraySource<T extends Json>(items: T[]): DurableSource<T> & { closed: boolean } {
  let index = 0;
  const src = {
    closed: false,
    *next(): Operation<{ value: T } | { done: true }> {
      if (index < items.length) {
        return { value: items[index++]! };
      }
      return { done: true as const };
    },
    close() {
      src.closed = true;
    },
  };
  return src;
}

/** Track which functions were actually called during live execution. */
function createCallTracker() {
  const calls: string[] = [];
  return {
    calls,
    fn<T extends Json>(name: string, value: T): () => Promise<T> {
      return () => {
        calls.push(name);
        return Promise.resolve(value);
      };
    },
  };
}

describe("durableEach", () => {
  // ---------------------------------------------------------------------------
  // Test 1: Golden run — 3 items
  // ---------------------------------------------------------------------------

  it("golden run — 3 items processed, correct journal", function* () {
    const stream = new InMemoryStream();
    const source = arraySource(["a", "b", "c"]);
    const processed: string[] = [];

    const result = yield* durableRun(
      function* () {
        for (const msg of yield* durableEach("queue", source)) {
          processed.push(msg);
          yield* durableEach.next();
        }
        return "done";
      },
      { stream },
    );

    expect(result).toBe("done");
    expect(processed).toEqual(["a", "b", "c"]);

    // Verify journal: 4 each events (a, b, c, done) + 1 root Close
    const events = stream.snapshot();
    const yieldEvents = events.filter((e) => e.type === "yield");
    expect(yieldEvents.length).toBe(4); // 3 items + 1 done sentinel

    // Check each event description
    for (const y of yieldEvents) {
      if (y.type === "yield") {
        expect(y.description).toEqual({ type: "each", name: "queue" });
      }
    }

    // Check result values
    if (yieldEvents[0]!.type === "yield") {
      expect(yieldEvents[0]!.result).toEqual({ status: "ok", value: { value: "a" } });
    }
    if (yieldEvents[1]!.type === "yield") {
      expect(yieldEvents[1]!.result).toEqual({ status: "ok", value: { value: "b" } });
    }
    if (yieldEvents[2]!.type === "yield") {
      expect(yieldEvents[2]!.result).toEqual({ status: "ok", value: { value: "c" } });
    }
    if (yieldEvents[3]!.type === "yield") {
      expect(yieldEvents[3]!.result).toEqual({ status: "ok", value: { done: true } });
    }

    // Root Close event
    const closeEvents = events.filter((e) => e.type === "close");
    expect(closeEvents.length).toBe(1);
    expect(closeEvents[0]!.coroutineId).toBe("root");
  });

  // ---------------------------------------------------------------------------
  // Test 2: Empty source — loop body never executes
  // ---------------------------------------------------------------------------

  it("empty source — loop body never executes", function* () {
    const stream = new InMemoryStream();
    const source = arraySource<string>([]);
    const processed: string[] = [];

    const result = yield* durableRun(
      function* () {
        for (const msg of yield* durableEach("empty", source)) {
          processed.push(msg);
          yield* durableEach.next();
        }
        return "done";
      },
      { stream },
    );

    expect(result).toBe("done");
    expect(processed).toEqual([]);

    // Journal: 1 each event (done) + 1 root Close
    const events = stream.snapshot();
    const yieldEvents = events.filter((e) => e.type === "yield");
    expect(yieldEvents.length).toBe(1);
    if (yieldEvents[0]!.type === "yield") {
      expect(yieldEvents[0]!.result).toEqual({ status: "ok", value: { done: true } });
    }
  });

  // ---------------------------------------------------------------------------
  // Test 3: Full replay — no source calls, items replayed from journal
  // ---------------------------------------------------------------------------

  it("full replay — items replayed from journal without calling source", function* () {
    // Pre-populate stream with all yield events but NO root Close.
    // durableRun will re-run the generator, but all DurableEffects resolve
    // from the replay index — source.next() is never called.
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "each", name: "queue" },
        result: { status: "ok", value: { value: "x" } },
      },
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "each", name: "queue" },
        result: { status: "ok", value: { value: "y" } },
      },
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "each", name: "queue" },
        result: { status: "ok", value: { done: true } },
      },
    ];
    const stream = new InMemoryStream(events);

    // Source should never be called during replay
    let sourceCalled = false;
    const source: DurableSource<string> = {
      *next(): Operation<{ value: string } | { done: true }> {
        sourceCalled = true;
        return { done: true as const };
      },
    };
    const processed: string[] = [];

    const result = yield* durableRun(
      function* () {
        for (const msg of yield* durableEach("queue", source)) {
          processed.push(msg);
          yield* durableEach.next();
        }
        return "done";
      },
      { stream },
    );

    // Generator ran but all effects were replayed from journal
    expect(result).toBe("done");
    expect(processed).toEqual(["x", "y"]);
    expect(sourceCalled).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Crash recovery (partial replay)
  // ---------------------------------------------------------------------------

  it("crash recovery — partial replay then live", function* () {
    // Journal has 2 items replayed, 3rd will be live
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "each", name: "queue" },
        result: { status: "ok", value: { value: "a" } },
      },
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "each", name: "queue" },
        result: { status: "ok", value: { value: "b" } },
      },
    ];
    const stream = new InMemoryStream(events);

    // Source should only be called for the 3rd item onward
    const sourceItems = ["a", "b", "c"]; // source has all items but replay covers a, b
    let sourceCallCount = 0;
    let sourceIndex = 2; // start from where replay left off
    const source: DurableSource<string> = {
      *next(): Operation<{ value: string } | { done: true }> {
        sourceCallCount++;
        if (sourceIndex < sourceItems.length) {
          return { value: sourceItems[sourceIndex++]! };
        }
        return { done: true as const };
      },
    };
    const processed: string[] = [];

    const result = yield* durableRun(
      function* () {
        for (const msg of yield* durableEach("queue", source)) {
          processed.push(msg);
          yield* durableEach.next();
        }
        return "done";
      },
      { stream },
    );

    expect(result).toBe("done");
    expect(processed).toEqual(["a", "b", "c"]);
    // Source called twice: once for "c", once for the done sentinel
    expect(sourceCallCount).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Test 5: With durableCall in loop body — interleaved events
  // ---------------------------------------------------------------------------

  it("with durableCall in loop — interleaved journal events", function* () {
    const stream = new InMemoryStream();
    const source = arraySource(["msg1", "msg2"]);
    const tracker = createCallTracker();

    yield* durableRun(
      function* () {
        for (const msg of yield* durableEach("queue", source)) {
          yield* durableCall(`process-${msg}`, tracker.fn(`process-${msg}`, null));
          yield* durableEach.next();
        }
      },
      { stream },
    );

    expect(tracker.calls).toEqual(["process-msg1", "process-msg2"]);

    // Verify interleaved journal structure
    const events = stream.snapshot();
    const nonClose = events.filter((e) => e.type === "yield");

    // each(msg1), call(process-msg1), each(msg2), call(process-msg2), each(done)
    expect(nonClose.length).toBe(5);
    if (nonClose[0]!.type === "yield") {
      expect(nonClose[0]!.description).toEqual({ type: "each", name: "queue" });
    }
    if (nonClose[1]!.type === "yield") {
      expect(nonClose[1]!.description).toEqual({ type: "call", name: "process-msg1" });
    }
    if (nonClose[2]!.type === "yield") {
      expect(nonClose[2]!.description).toEqual({ type: "each", name: "queue" });
    }
    if (nonClose[3]!.type === "yield") {
      expect(nonClose[3]!.description).toEqual({ type: "call", name: "process-msg2" });
    }
    if (nonClose[4]!.type === "yield") {
      expect(nonClose[4]!.description).toEqual({ type: "each", name: "queue" });
      expect(nonClose[4]!.result).toEqual({ status: "ok", value: { done: true } });
    }
  });

  // ---------------------------------------------------------------------------
  // Test 6: Divergence detection — source name mismatch
  // ---------------------------------------------------------------------------

  it("divergence — mismatched source name", function* () {
    // Journal was recorded with name "queue" but workflow uses "other"
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "each", name: "queue" },
        result: { status: "ok", value: { value: "a" } },
      },
    ];
    const stream = new InMemoryStream(events);
    const source = arraySource(["a"]);

    try {
      yield* durableRun(
        function* () {
          for (const _msg of yield* durableEach("other", source)) {
            yield* durableEach.next();
          }
        },
        { stream },
      );
      throw new Error("expected Divergence error");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toContain("Divergence");
    }
  });

  // ---------------------------------------------------------------------------
  // Test 7: Source error — propagated through Effection
  // ---------------------------------------------------------------------------

  it("source error — propagated to workflow", function* () {
    const stream = new InMemoryStream();
    const source: DurableSource<string> = {
      *next(): Operation<{ value: string } | { done: true }> {
        throw new Error("connection lost");
      },
    };

    try {
      yield* durableRun(
        function* () {
          for (const _msg of yield* durableEach("queue", source)) {
            yield* durableEach.next();
          }
        },
        { stream },
      );
      throw new Error("expected connection lost error");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toContain("connection lost");
    }
  });

  // ---------------------------------------------------------------------------
  // Test 8: Advance guard — missing durableEach.next()
  // ---------------------------------------------------------------------------

  it("advance guard — throws when durableEach.next() is missing", function* () {
    const stream = new InMemoryStream();
    const source = arraySource(["a", "b"]);

    try {
      yield* durableRun(
        function* () {
          for (const _msg of yield* durableEach("queue", source)) {
            // Missing: yield* durableEach.next();
            // The second iteration should trigger the advance guard
          }
        },
        { stream },
      );
      throw new Error("expected advance guard error");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toContain("yield* durableEach.next() must be called");
    }
  });

  // ---------------------------------------------------------------------------
  // Test 9: Break exits cleanly, source closed
  // ---------------------------------------------------------------------------

  it("break exits cleanly and closes source", function* () {
    const stream = new InMemoryStream();
    const source = arraySource(["a", "b", "c"]);
    const processed: string[] = [];

    const result = yield* durableRun(
      function* () {
        for (const msg of yield* durableEach("queue", source)) {
          processed.push(msg);
          if (msg === "b") break;
          yield* durableEach.next();
        }
        return "stopped";
      },
      { stream },
    );

    expect(result).toBe("stopped");
    expect(processed).toEqual(["a", "b"]);
    // Source should be closed via ensure() cleanup
    expect(source.closed).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 10: Null values in source — not confused with done signal
  // ---------------------------------------------------------------------------

  it("null values are valid items, not done signals", function* () {
    const stream = new InMemoryStream();
    const source = arraySource<Json>([null, "after-null", null]);
    const processed: Json[] = [];

    const result = yield* durableRun(
      function* () {
        for (const msg of yield* durableEach("queue", source)) {
          processed.push(msg);
          yield* durableEach.next();
        }
        return "done";
      },
      { stream },
    );

    expect(result).toBe("done");
    expect(processed).toEqual([null, "after-null", null]);

    // Verify journal stores { value: null } not { done: true }
    const events = stream.snapshot();
    const yieldEvents = events.filter((e) => e.type === "yield");
    if (yieldEvents[0]!.type === "yield") {
      expect(yieldEvents[0]!.result).toEqual({ status: "ok", value: { value: null } });
    }
  });
});
