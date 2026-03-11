/**
 * Tier 1 tests — core replay correctness.
 *
 * Tests 1-7 from the protocol specification. These validate that
 * durableRun correctly executes workflows live, replays them from
 * stored events, and handles crash recovery scenarios.
 */

import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import {
  type DurableEvent,
  InMemoryStream,
  type Json,
  type Workflow,
  durableCall,
  durableRun,
} from "./mod.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

describe("durableRun", () => {
  // ---------------------------------------------------------------------------
  // Test 1: Golden run — execute workflow end-to-end
  // ---------------------------------------------------------------------------

  it("golden run: executes all effects live and records events", function* () {
    const stream = new InMemoryStream();
    const tracker = createCallTracker();

    function* workflow(): Workflow<string> {
      const a = yield* durableCall("stepA", tracker.fn("stepA", "alpha"));
      const b = yield* durableCall("stepB", tracker.fn("stepB", "beta"));
      return `${a}-${b}`;
    }

    const result = yield* durableRun(workflow, { stream });

    // Verify result
    expect(result).toBe("alpha-beta");

    // Verify all effects were called
    expect(tracker.calls).toEqual(["stepA", "stepB"]);

    // Verify stream has 2 Yield events + 1 Close event
    const events = stream.snapshot();
    expect(events.length).toBe(3);

    expect(events[0]!.type).toBe("yield");
    expect(events[0]!.coroutineId).toBe("root");
    if (events[0]!.type === "yield") {
      expect(events[0]!.description).toEqual({ type: "call", name: "stepA" });
      expect(events[0]!.result).toEqual({ status: "ok", value: "alpha" });
    }

    expect(events[1]!.type).toBe("yield");
    if (events[1]!.type === "yield") {
      expect(events[1]!.description).toEqual({ type: "call", name: "stepB" });
      expect(events[1]!.result).toEqual({ status: "ok", value: "beta" });
    }

    expect(events[2]!.type).toBe("close");
    expect(events[2]!.coroutineId).toBe("root");
    if (events[2]!.type === "close") {
      expect(events[2]!.result).toEqual({ status: "ok", value: "alpha-beta" });
    }
  });

  // ---------------------------------------------------------------------------
  // Test 2: Full replay — replay entire stream
  // ---------------------------------------------------------------------------

  it("full replay: returns stored result without re-executing effects", function* () {
    // Pre-populate stream with a complete run
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "call", name: "stepA" },
        result: { status: "ok", value: "alpha" },
      },
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "call", name: "stepB" },
        result: { status: "ok", value: "beta" },
      },
      {
        type: "close",
        coroutineId: "root",
        result: { status: "ok", value: "alpha-beta" },
      },
    ];
    const stream = new InMemoryStream(events);
    const tracker = createCallTracker();

    function* workflow(): Workflow<string> {
      const a = yield* durableCall("stepA", tracker.fn("stepA", "alpha"));
      const b = yield* durableCall("stepB", tracker.fn("stepB", "beta"));
      return `${a}-${b}`;
    }

    const result = yield* durableRun(workflow, { stream });

    // Result comes from the stored Close event
    expect(result).toBe("alpha-beta");

    // No effects were actually called — fully replayed from stored Close
    expect(tracker.calls).toEqual([]);

    // Stream was not modified (no new events appended)
    expect(stream.appendCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Test 3: Crash before first effect — empty stream
  // ---------------------------------------------------------------------------

  it("crash before first effect: empty stream, all live", function* () {
    const stream = new InMemoryStream();
    const tracker = createCallTracker();

    function* workflow(): Workflow<string> {
      const a = yield* durableCall("stepA", tracker.fn("stepA", "alpha"));
      return a;
    }

    const result = yield* durableRun(workflow, { stream });

    expect(result).toBe("alpha");
    expect(tracker.calls).toEqual(["stepA"]);

    const events = stream.snapshot();
    expect(events.length).toBe(2); // 1 Yield + 1 Close
  });

  // ---------------------------------------------------------------------------
  // Test 4: Crash at position N — partial replay
  // ---------------------------------------------------------------------------

  it("crash at position N: first N replayed, rest live", function* () {
    // Stream has only the first Yield event (simulates crash after stepA)
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "call", name: "stepA" },
        result: { status: "ok", value: "alpha" },
      },
    ];
    const stream = new InMemoryStream(events);
    const tracker = createCallTracker();

    function* workflow(): Workflow<string> {
      const a = yield* durableCall("stepA", tracker.fn("stepA", "WRONG"));
      const b = yield* durableCall("stepB", tracker.fn("stepB", "beta"));
      return `${a}-${b}`;
    }

    const result = yield* durableRun(workflow, { stream });

    // stepA was replayed (returns stored "alpha", not "WRONG")
    // stepB was executed live
    expect(result).toBe("alpha-beta");

    // Only stepB was actually called
    expect(tracker.calls).toEqual(["stepB"]);

    // Stream now has: original Yield(stepA) + new Yield(stepB) + Close
    const finalEvents = stream.snapshot();
    expect(finalEvents.length).toBe(3);
    expect(finalEvents[0]!.type).toBe("yield");
    expect(finalEvents[1]!.type).toBe("yield");
    expect(finalEvents[2]!.type).toBe("close");

    // Only 2 appends: Yield(stepB) + Close
    expect(stream.appendCount).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Test 5: Crash after last effect — all Yields but no Close
  // ---------------------------------------------------------------------------

  it("crash after last effect: all Yields replayed, Close appended", function* () {
    // Stream has both Yield events but no Close
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "call", name: "stepA" },
        result: { status: "ok", value: "alpha" },
      },
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "call", name: "stepB" },
        result: { status: "ok", value: "beta" },
      },
    ];
    const stream = new InMemoryStream(events);
    const tracker = createCallTracker();

    function* workflow(): Workflow<string> {
      const a = yield* durableCall("stepA", tracker.fn("stepA", "WRONG"));
      const b = yield* durableCall("stepB", tracker.fn("stepB", "WRONG"));
      return `${a}-${b}`;
    }

    const result = yield* durableRun(workflow, { stream });

    // Both effects replayed from journal
    expect(result).toBe("alpha-beta");
    expect(tracker.calls).toEqual([]);

    // Only Close event was appended
    expect(stream.appendCount).toBe(1);
    const finalEvents = stream.snapshot();
    expect(finalEvents.length).toBe(3);
    expect(finalEvents[2]!.type).toBe("close");
  });

  // ---------------------------------------------------------------------------
  // Test 6: Persist-before-resume — write completes before generator advances
  // ---------------------------------------------------------------------------

  it("persist-before-resume: generator does not advance until write completes", function* () {
    const stream = new InMemoryStream();
    const order: string[] = [];

    // Hook into append to track ordering
    stream.onAppend = (event) => {
      if (event.type === "yield") {
        order.push(`persist:${event.type}`);
      }
    };

    function* workflow(): Workflow<string> {
      yield* durableCall("step1", () => {
        order.push("execute:step1");
        return Promise.resolve("one" as const);
      });
      order.push("resumed:after-step1");

      yield* durableCall("step2", () => {
        order.push("execute:step2");
        return Promise.resolve("two" as const);
      });
      order.push("resumed:after-step2");

      return "done";
    }

    yield* durableRun(workflow, { stream });

    // Verify ordering: execute → persist → resume for each step
    expect(order).toEqual([
      "execute:step1",
      "persist:yield",
      "resumed:after-step1",
      "execute:step2",
      "persist:yield",
      "resumed:after-step2",
    ]);
  });

  // ---------------------------------------------------------------------------
  // Test 7: Actor handoff — Process A writes N events, Process B resumes
  // ---------------------------------------------------------------------------

  it("actor handoff: Process B resumes from Process A's events", function* () {
    // Process A: execute first 2 steps then "crash" (we just take the events)
    const streamA = new InMemoryStream();
    const trackerA = createCallTracker();

    function* workflow(): Workflow<string> {
      const a = yield* durableCall("stepA", trackerA.fn("stepA", "alpha"));
      const b = yield* durableCall("stepB", trackerA.fn("stepB", "beta"));
      const c = yield* durableCall("stepC", trackerA.fn("stepC", "gamma"));
      return `${a}-${b}-${c}`;
    }

    yield* durableRun(workflow, { stream: streamA });

    // Process A executed all steps
    expect(trackerA.calls).toEqual(["stepA", "stepB", "stepC"]);

    // Simulate handoff: take only the first 2 Yield events (no Close, no stepC)
    const allEvents = streamA.snapshot();
    const partialEvents = allEvents.slice(0, 2);

    // Process B: resume with partial events
    const streamB = new InMemoryStream(partialEvents);
    const trackerB = createCallTracker();

    function* workflowB(): Workflow<string> {
      const a = yield* durableCall("stepA", trackerB.fn("stepA", "WRONG"));
      const b = yield* durableCall("stepB", trackerB.fn("stepB", "WRONG"));
      const c = yield* durableCall("stepC", trackerB.fn("stepC", "gamma"));
      return `${a}-${b}-${c}`;
    }

    const result = yield* durableRun(workflowB, { stream: streamB });

    // stepA and stepB replayed, stepC executed live
    expect(result).toBe("alpha-beta-gamma");
    expect(trackerB.calls).toEqual(["stepC"]);

    // Stream B: 2 original + 1 new Yield + 1 Close
    const finalEvents = streamB.snapshot();
    expect(finalEvents.length).toBe(4);
  });

  // ---------------------------------------------------------------------------
  // Additional: error propagation
  // ---------------------------------------------------------------------------

  it("golden run with error: records Close(err) event", function* () {
    const stream = new InMemoryStream();

    function* workflow(): Workflow<string> {
      yield* durableCall("failingStep", () =>
        Promise.reject(new Error("boom")),
      );
      return "unreachable";
    }

    try {
      yield* durableRun(workflow, { stream });
      throw new Error("expected error from durableRun");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toContain("boom");
    }

    // Stream has Yield(err) + Close(err)
    const events = stream.snapshot();
    expect(events.length).toBe(2);

    if (events[0]!.type === "yield") {
      expect(events[0]!.result.status).toBe("err");
    }
    expect(events[1]!.type).toBe("close");
    if (events[1]!.type === "close") {
      expect(events[1]!.result.status).toBe("err");
    }
  });
});
