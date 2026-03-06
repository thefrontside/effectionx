/**
 * Replay Guard tests — pluggable validation for replay staleness detection.
 *
 * Tests the ReplayGuard API middleware system for detecting stale inputs
 * during replay. See replay-guard-spec.md §9.
 *
 * Guards access `event.description.*` for input fields (e.g., file path)
 * and `event.result.value.*` for output fields (e.g., content hash).
 * There is no separate `meta` field — inputs belong in the effect
 * description, outputs belong in the result.
 */

import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { useScope, run } from "effection";
import {
  durableCall,
  durableRun,
  InMemoryStream,
  ReplayGuard,
  StaleInputError,
  type DurableEvent,
  type ReplayOutcome,
  type Workflow,
  type Yield,
} from "./mod.ts";

describe("replay guard", () => {
  // ---------------------------------------------------------------------------
  // Test 1: No guards installed → normal replay
  // ---------------------------------------------------------------------------

  it("no guards installed — normal replay proceeds", function* () {
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
    const liveCalls: string[] = [];

    const result = yield* durableRun(
      function* (): Workflow<string> {
        const a = yield* durableCall<string>("stepA", () => {
          liveCalls.push("stepA");
          return Promise.resolve("should-not-be-called");
        });
        const b = yield* durableCall<string>("stepB", () => {
          liveCalls.push("stepB");
          return Promise.resolve("should-not-be-called");
        });
        return `${a}-${b}`;
      },
      { stream },
    );

    // Full replay returns stored Close result, no live calls
    expect(result).toBe("alpha-beta");
    expect(liveCalls).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Guard installed, event has no applicable fields → replay proceeds
  // ---------------------------------------------------------------------------

  it("event without validation fields — replay proceeds", function* () {
    // Event has no path in description — guard should pass it through
    // Note: NO Close event, so workflow actually runs and replays
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "call", name: "stepA" },
        result: { status: "ok", value: "alpha" },
        // no extra fields in description, no contentHash in result
      },
      // No close event - workflow runs and replays the yield, then executes live close
    ];
    const stream = new InMemoryStream(events);
    const checkEvents: Yield[] = [];
    const decideEvents: Yield[] = [];

    const scope = yield* useScope();

    // Install a guard that tracks which events it sees
    scope.around(ReplayGuard, {
      *check([event], next) {
        checkEvents.push(event);
        return yield* next(event);
      },
      decide([event], next) {
        decideEvents.push(event);
        // No opinion — pass through
        return next(event);
      },
    });

    const result = yield* durableRun(
      function* (): Workflow<string> {
        return yield* durableCall<string>("stepA", () =>
          Promise.resolve("should-not-be-called")
        );
      },
      { stream },
    );

    // Replay should proceed normally (returns stored value, not live value)
    expect(result).toBe("alpha");

    // Guard should have seen the event in both phases
    expect(checkEvents.length).toBe(1);
    expect(decideEvents.length).toBe(1);
    // No extra fields in description
    expect(checkEvents[0]!.description.path).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Test 3: Description path and result hash match → replay proceeds
  // ---------------------------------------------------------------------------

  it("description/result fields match — replay proceeds", function* () {
    // Simulate a file hash that hasn't changed
    // path is in description, contentHash is in result.value
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "call", name: "readFile", path: "./test.txt" },
        result: { status: "ok", value: { content: "file contents", contentHash: "abc123" } },
      },
      {
        type: "close",
        coroutineId: "root",
        result: { status: "ok", value: { content: "file contents", contentHash: "abc123" } },
      },
    ];
    const stream = new InMemoryStream(events);

    // Cache simulates current file having the same hash
    const cache = new Map<string, string>([["./test.txt", "abc123"]]);

    const scope = yield* useScope();

    scope.around(ReplayGuard, {
      *check([event], next) {
        // In real usage, would compute hash here. For test, cache is pre-populated.
        return yield* next(event);
      },
      decide([event], next) {
        const filePath = event.description.path;
        const resultValue = event.result.status === "ok" ? event.result.value : undefined;
        const recordedHash = (resultValue as Record<string, unknown> | undefined)?.contentHash;
        if (typeof filePath === "string" && typeof recordedHash === "string") {
          const currentSHA = cache.get(filePath);
          if (currentSHA && currentSHA !== recordedHash) {
            return {
              outcome: "error",
              error: new StaleInputError(`File changed: ${filePath}`),
            };
          }
        }
        return next(event);
      },
    });

    const result = yield* durableRun(
      function* (): Workflow<Record<string, string>> {
        return yield* durableCall<Record<string, string>>("readFile", () =>
          Promise.resolve({ content: "should-not-be-called", contentHash: "abc123" })
        );
      },
      { stream },
    );

    // Replay should proceed since hashes match
    expect(result.content).toBe("file contents");
  });

  // ---------------------------------------------------------------------------
  // Test 4: Description path present but result hash differs → replay errors
  // ---------------------------------------------------------------------------

  it("result hash mismatch — replay errors with StaleInputError", function* () {
    // File hash in journal result differs from current hash
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "call", name: "readFile", path: "./test.txt" },
        result: { status: "ok", value: { content: "old contents", contentHash: "abc123" } },
      },
    ];
    const stream = new InMemoryStream(events);

    // Cache simulates current file having a DIFFERENT hash
    const cache = new Map<string, string>([["./test.txt", "def456"]]);

    const scope = yield* useScope();

    scope.around(ReplayGuard, {
      *check([event], next) {
        return yield* next(event);
      },
      decide([event], next) {
        const filePath = event.description.path;
        const resultValue = event.result.status === "ok" ? event.result.value : undefined;
        const recordedHash = (resultValue as Record<string, unknown> | undefined)?.contentHash;
        if (typeof filePath === "string" && typeof recordedHash === "string") {
          const currentSHA = cache.get(filePath);
          if (currentSHA && currentSHA !== recordedHash) {
            return {
              outcome: "error",
              error: new StaleInputError(
                `File changed: ${filePath} (recorded: ${recordedHash}, current: ${currentSHA})`
              ),
            };
          }
        }
        return next(event);
      },
    });

    try {
      yield* durableRun(
        function* (): Workflow<Record<string, string>> {
          return yield* durableCall<Record<string, string>>("readFile", () =>
            Promise.resolve({ content: "should-not-be-called", contentHash: "abc123" })
          );
        },
        { stream },
      );
      throw new Error("expected StaleInputError");
    } catch (e) {
      expect(e).toBeInstanceOf(StaleInputError);
      expect((e as Error).message).toContain("File changed");
      expect((e as Error).message).toContain("./test.txt");
    }
  });

  // ---------------------------------------------------------------------------
  // Test 5: Multiple guards, one errors → replay halts
  // ---------------------------------------------------------------------------

  it("multiple guards — error from any guard halts replay", function* () {
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "call", name: "step", checkA: "pass", checkB: "fail" },
        result: { status: "ok", value: "result" },
      },
    ];
    const stream = new InMemoryStream(events);

    const scope = yield* useScope();

    // Guard A: passes
    scope.around(ReplayGuard, {
      *check([event], next) {
        return yield* next(event);
      },
      decide([event], next) {
        // No opinion — let it through
        return next(event);
      },
    });

    // Guard B: errors
    scope.around(ReplayGuard, {
      *check([event], next) {
        return yield* next(event);
      },
      decide([event], next) {
        if (event.description.checkB === "fail") {
          return {
            outcome: "error",
            error: new StaleInputError("Guard B failed"),
          };
        }
        return next(event);
      },
    });

    try {
      yield* durableRun(
        function* (): Workflow<string> {
          return yield* durableCall<string>("step", () =>
            Promise.resolve("should-not-be-called")
          );
        },
        { stream },
      );
      throw new Error("expected StaleInputError");
    } catch (e) {
      expect(e).toBeInstanceOf(StaleInputError);
      expect((e as Error).message).toBe("Guard B failed");
    }
  });

  // ---------------------------------------------------------------------------
  // Test 6: Check runs before replay, not during
  // ---------------------------------------------------------------------------

  it("check phase runs before workflow starts", function* () {
    // Note: NO Close event, so workflow actually runs and replays
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "call", name: "step", someKey: "someValue" },
        result: { status: "ok", value: "result" },
      },
      // No close event - workflow runs and replays the yield
    ];
    const stream = new InMemoryStream(events);

    const timeline: string[] = [];

    const scope = yield* useScope();

    scope.around(ReplayGuard, {
      *check([_event], next) {
        timeline.push("check");
        return yield* next(_event);
      },
      decide([event], next) {
        timeline.push("decide");
        return next(event);
      },
    });

    timeline.push("before-durableRun");

    const result = yield* durableRun(
      function* (): Workflow<string> {
        timeline.push("workflow-start");
        const r = yield* durableCall<string>("step", () => {
          timeline.push("live-call");
          return Promise.resolve("should-not-be-called");
        });
        timeline.push("workflow-end");
        return r;
      },
      { stream },
    );

    timeline.push("after-durableRun");

    // Check should run before workflow, decide during workflow
    // Replay means no live-call (effect is replayed from journal)
    expect(timeline).toEqual([
      "before-durableRun",
      "check",             // check phase runs over all Yield events first
      "workflow-start",
      "decide",            // decide runs during replay
      "workflow-end",
      "after-durableRun",
    ]);

    expect(result).toBe("result");
  });

  // ---------------------------------------------------------------------------
  // Test 7: Decide is pure — same inputs, same output
  // ---------------------------------------------------------------------------

  it("decide is pure — consistent results for same input", function* () {
    // Note: NO Close event, so workflow actually runs and replays
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "call", name: "step", key: "value" },
        result: { status: "ok", value: "result" },
      },
      // No close event - workflow runs and replays the yield
    ];

    const decideResults: ReplayOutcome[] = [];

    // Run twice with fresh scopes (via run()) so middleware doesn't stack.
    // Each run() creates an independent scope — matching the original
    // Deno test which also used explicit run() calls.
    for (let i = 0; i < 2; i++) {
      const stream = new InMemoryStream([...events]);
      yield* run(function* () {
        const scope = yield* useScope();

        scope.around(ReplayGuard, {
          *check([event], next) {
            return yield* next(event);
          },
          decide([event], next) {
            const outcome = next(event);
            decideResults.push(outcome);
            return outcome;
          },
        });

        yield* durableRun(
          function* (): Workflow<string> {
            return yield* durableCall<string>("step", () =>
              Promise.resolve("should-not-be-called")
            );
          },
          { stream },
        );
      });
    }

    // Both runs should have the same decide outcome
    expect(decideResults.length).toBe(2);
    expect(decideResults[0]).toEqual(decideResults[1]);
    expect(decideResults[0]!.outcome).toBe("replay");
  });

  // ---------------------------------------------------------------------------
  // Test 8: Decide not called if identity check fails
  // ---------------------------------------------------------------------------

  it("decide not called if identity check fails", function* () {
    // Journal has call("stepA"), code yields call("stepX")
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "call", name: "stepA", key: "value" },
        result: { status: "ok", value: "alpha" },
      },
    ];
    const stream = new InMemoryStream(events);

    const checkCalls: number[] = [];
    const decideCalls: number[] = [];

    const scope = yield* useScope();

    scope.around(ReplayGuard, {
      *check([event], next) {
        checkCalls.push(1);
        return yield* next(event);
      },
      decide([event], next) {
        decideCalls.push(1);
        return next(event);
      },
    });

    try {
      yield* durableRun(
        function* (): Workflow<string> {
          // Yields stepX but journal has stepA — identity mismatch
          return yield* durableCall<string>("stepX", () =>
            Promise.resolve("should-not-be-called")
          );
        },
        { stream },
      );
      throw new Error("expected DivergenceError");
    } catch (_e) {
      // DivergenceError expected
    }

    // Check runs before workflow (always)
    expect(checkCalls.length).toBe(1);

    // Decide should NOT be called because identity check failed first
    expect(decideCalls.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Test 9: Check deduplicates file hashes via cache
  // ---------------------------------------------------------------------------

  it("check deduplicates via cache", function* () {
    // 5 events all referencing the same file via description.path
    // Note: NO Close event, so workflow actually runs and replays
    const events: DurableEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push({
        type: "yield",
        coroutineId: "root",
        description: { type: "call", name: `step${i}`, path: "./shared.txt" },
        result: { status: "ok", value: { content: `result${i}`, contentHash: "abc123" } },
      });
    }
    // No close event - workflow runs and replays all yields

    const stream = new InMemoryStream(events);

    let hashComputations = 0;
    const cache = new Map<string, string>();

    const scope = yield* useScope();

    scope.around(ReplayGuard, {
      *check([event], next) {
        const filePath = event.description.path;
        if (typeof filePath === "string") {
          if (!cache.has(filePath)) {
            hashComputations++;
            cache.set(filePath, "abc123"); // Simulated hash
          }
        }
        return yield* next(event);
      },
      decide([event], next) {
        return next(event);
      },
    });

    yield* durableRun(
      function* (): Workflow<string> {
        for (let i = 0; i < 5; i++) {
          yield* durableCall<Record<string, string>>(`step${i}`, () =>
            Promise.resolve({ content: "should-not-be-called", contentHash: "abc123" })
          );
        }
        return "done";
      },
      { stream },
    );

    // Hash should be computed only once despite 5 events
    expect(hashComputations).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Test 10: Guard inherited by child scopes (via durableAll)
  // ---------------------------------------------------------------------------

  // Note: This test would require durableAll but we'll test the simpler case
  // that the guard middleware installed on the parent scope is visible to
  // effects inside durableRun.

  it("guard visible from durableRun scope", function* () {
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "call", name: "step", marker: "stale" },
        result: { status: "ok", value: "result" },
      },
    ];
    const stream = new InMemoryStream(events);

    const scope = yield* useScope();

    // Install guard on parent scope
    scope.around(ReplayGuard, {
      *check([event], next) {
        return yield* next(event);
      },
      decide([event], next) {
        // Always error on events with marker: "stale" in description
        if (event.description.marker === "stale") {
          return {
            outcome: "error",
            error: new StaleInputError("Stale marker detected"),
          };
        }
        return next(event);
      },
    });

    try {
      // The guard should be visible inside durableRun's scope
      yield* durableRun(
        function* (): Workflow<string> {
          return yield* durableCall<string>("step", () =>
            Promise.resolve("should-not-be-called")
          );
        },
        { stream },
      );
      throw new Error("expected StaleInputError");
    } catch (e) {
      expect(e).toBeInstanceOf(StaleInputError);
      expect((e as Error).message).toBe("Stale marker detected");
    }
  });

  // ---------------------------------------------------------------------------
  // Test 11: Default behavior is pass-through (logs are authoritative)
  // ---------------------------------------------------------------------------

  it("default behavior is pass-through (logs are authoritative)", function* () {
    // Event has extra description fields that WOULD be stale if a guard
    // checked them, but no guard is installed — should replay normally.
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "call", name: "step", path: "./file.txt" },
        result: { status: "ok", value: { content: "result", contentHash: "old-hash-that-no-one-checks" } },
      },
      {
        type: "close",
        coroutineId: "root",
        result: { status: "ok", value: { content: "result", contentHash: "old-hash-that-no-one-checks" } },
      },
    ];
    const stream = new InMemoryStream(events);

    // No guard installed — default behavior
    const result = yield* durableRun(
      function* (): Workflow<Record<string, string>> {
        return yield* durableCall<Record<string, string>>("step", () =>
          Promise.resolve({ content: "should-not-be-called", contentHash: "abc123" })
        );
      },
      { stream },
    );

    // Replay proceeds normally — extra fields are ignored without guards
    expect(result.content).toBe("result");
  });

  // ---------------------------------------------------------------------------
  // Test 12: Rich result with contentHash is written during live execution
  // ---------------------------------------------------------------------------

  it("rich result with contentHash is written during live execution", function* () {
    const stream = new InMemoryStream([]);

    yield* durableRun(
      function* (): Workflow<Record<string, string>> {
        return yield* durableCall<Record<string, string>>(
          "readFile",
          () => Promise.resolve({
            content: "file contents",
            contentHash: "hash-of-file-contents",
          }),
        );
      },
      { stream },
    );

    // Check that the Yield event has the rich result
    const events = stream.snapshot();
    expect(events.length).toBe(2); // yield + close

    const yieldEvent = events[0]!;
    expect(yieldEvent.type).toBe("yield");
    if (yieldEvent.type === "yield") {
      expect(yieldEvent.result).toEqual({
        status: "ok",
        value: {
          content: "file contents",
          contentHash: "hash-of-file-contents",
        },
      });
    }
  });
});
