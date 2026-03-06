/**
 * Divergence API tests — pluggable policy via createApi() middleware.
 *
 * Tests that the Divergence API correctly delegates divergence decisions
 * and that middleware can override default strict behavior. See DEC-031.
 *
 * Since durableRun is now an Operation<T> (DEC-032), middleware is
 * installed by the caller's scope before yield*-ing into durableRun.
 * Tests use a wrapper Operation that calls useScope(), installs
 * middleware via scope.around(), then yield*s into durableRun.
 */

import { describe, it } from "@effectionx/bdd";
import { call, run, useScope } from "effection";
import type { Operation } from "effection";
import { expect } from "expect";
import {
  ContinuePastCloseDivergenceError,
  Divergence,
  type DivergenceDecision,
  DivergenceError,
  type DurableEvent,
  InMemoryStream,
  type Workflow,
  durableCall,
  durableRun,
} from "./mod.ts";

describe("Divergence API", () => {
  // ---------------------------------------------------------------------------
  // Test 1: Default strict — description mismatch → DivergenceError
  // ---------------------------------------------------------------------------

  it("default strict — description mismatch throws DivergenceError", function* () {
    // Journal has call("stepA"), code yields call("stepX")
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "call", name: "stepA" },
        result: { status: "ok", value: "alpha" },
      },
    ];
    const stream = new InMemoryStream(events);

    try {
      yield* durableRun(
        function* (): Workflow<string> {
          return yield* durableCall<string>("stepX", () =>
            Promise.resolve("x"),
          );
        },
        { stream },
      );
      throw new Error("expected divergence error");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).name).toBe("DivergenceError");
      if (e instanceof DivergenceError) {
        expect(e.expected).toEqual({ type: "call", name: "stepA" });
        expect(e.actual).toEqual({ type: "call", name: "stepX" });
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Test 2: Default strict — continue past close → ContinuePastCloseDivergenceError
  // ---------------------------------------------------------------------------

  it("default strict — continue past close throws ContinuePastCloseDivergenceError", function* () {
    const scope = yield* useScope();
    const decision = Divergence.invoke(scope, "decide", [
      { kind: "continue-past-close", coroutineId: "root.0", yieldCount: 2 },
    ]);

    expect(decision.type).toBe("throw");
    if (decision.type === "throw") {
      expect(decision.error).toBeInstanceOf(ContinuePastCloseDivergenceError);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 3: Middleware override — mismatch → run-live → continues with new effect
  // ---------------------------------------------------------------------------

  it("middleware override — mismatch triggers run-live and executes new effect", function* () {
    // Journal has call("stepA") then call("stepB").
    // Code changes stepB to stepX.
    // Middleware overrides divergence to run-live for description mismatches.
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

    const liveCalls: string[] = [];

    // Install divergence middleware on the caller's scope
    const scope = yield* useScope();
    scope.around(Divergence, {
      decide([info], next) {
        if (info.kind === "description-mismatch") {
          return { type: "run-live" } as DivergenceDecision;
        }
        return next(info);
      },
    });

    // Now yield* into durableRun — it inherits the scope with middleware
    const result = yield* durableRun(
      function* (): Workflow<string> {
        // stepA matches journal — replayed
        const a = yield* durableCall<string>("stepA", () => {
          liveCalls.push("stepA");
          return Promise.resolve("alpha-live");
        });

        // stepB was renamed to stepX — divergence detected, middleware returns run-live
        const x = yield* durableCall<string>("stepX", () => {
          liveCalls.push("stepX");
          return Promise.resolve("x-live");
        });

        return `${a}-${x}`;
      },
      { stream },
    );

    // stepA was replayed (got stored value "alpha"), stepX ran live
    expect(result).toBe("alpha-x-live");
    // stepA should NOT have been called live; stepX should have been
    expect(liveCalls).toEqual(["stepX"]);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Middleware is per-scope — two runs, only one with middleware
  // ---------------------------------------------------------------------------

  it("middleware is per-scope — only the configured run tolerates divergence", function* () {
    // Same journal for both runs
    const makeEvents = (): DurableEvent[] => [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "call", name: "stepA" },
        result: { status: "ok", value: "alpha" },
      },
    ];

    // Run 1: WITH middleware — should succeed with run-live
    const stream1 = new InMemoryStream(makeEvents());
    const scope1 = yield* useScope();
    scope1.around(Divergence, {
      decide([info], next) {
        if (info.kind === "description-mismatch") {
          return { type: "run-live" } as DivergenceDecision;
        }
        return next(info);
      },
    });

    const result1 = yield* durableRun(
      function* (): Workflow<string> {
        return yield* durableCall<string>("stepX", () =>
          Promise.resolve("x-live"),
        );
      },
      { stream: stream1 },
    );
    expect(result1).toBe("x-live");

    // Run 2: WITHOUT middleware on a fresh scope — should throw DivergenceError.
    const stream2 = new InMemoryStream(makeEvents());
    try {
      yield* call(() =>
        run(() =>
          durableRun(
            function* (): Workflow<string> {
              return yield* durableCall<string>("stepX", () =>
                Promise.resolve("x-live"),
              );
            },
            { stream: stream2 },
          ),
        ),
      );
      throw new Error("expected strict divergence error without middleware");
    } catch (e) {
      expect(e).toBeInstanceOf(DivergenceError);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 5: No regression — replay feeds stored results when matching
  // ---------------------------------------------------------------------------

  it("no regression — replay still feeds stored results when descriptions match", function* () {
    // Full journal with Close — should replay without any live execution
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
});
