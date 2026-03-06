/**
 * Type-level tests for Workflow<T> and DurableEffect.
 *
 * These tests verify that TypeScript correctly enforces the constraint
 * that only DurableEffect values can be yielded inside a Workflow generator.
 *
 * Tests are runtime no-ops — they only validate at compile time.
 */

import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import type { Operation } from "effection";
import type { DurableEffect, EffectionResult, Resolve, Workflow } from "./types.ts";

// ---------------------------------------------------------------------------
// Helper: create a minimal DurableEffect for testing
// ---------------------------------------------------------------------------

function testDurableEffect<T>(value: T): DurableEffect<T> {
  return {
    description: "test",
    effectDescription: { type: "test", name: "test" },
    enter(resolve: Resolve<EffectionResult<T>>) {
      resolve({ ok: true, value });
      return (exit: Resolve<EffectionResult<void>>) => {
        exit({ ok: true, value: undefined });
      };
    },
  };
}

// A Workflow-compatible operation that yields a DurableEffect
function durableOp(): Workflow<number> {
  return (function* () {
    return (yield testDurableEffect(42)) as number;
  })();
}

// Another Workflow-compatible operation
function anotherDurableOp(): Workflow<string> {
  return (function* () {
    return (yield testDurableEffect("hello")) as string;
  })();
}

describe("Workflow types", () => {
  // ---------------------------------------------------------------------------
  // POSITIVE: These should compile
  // ---------------------------------------------------------------------------

  it("Workflow can yield DurableEffect values", function* () {
    // This function compiles — DurableEffect is accepted as yield type
    function* _myWorkflow(): Workflow<number> {
      const x = (yield testDurableEffect(42)) as number;
      return x;
    }
    expect(true).toBe(true); // runtime no-op
  });

  it("Workflow can yield* to another Workflow", function* () {
    // yield* delegation between Workflows should work
    function* _myWorkflow(): Workflow<string> {
      const n: number = yield* durableOp();
      const s: string = yield* anotherDurableOp();
      return `${n}-${s}`;
    }
    expect(true).toBe(true);
  });

  it("Workflow<T> is assignable to Operation<T>", function* () {
    // DurableEffect extends Effect structurally, so Workflow generators
    // produce iterators compatible with Operation's expected iterator type.
    function* _myWorkflow(): Workflow<number> {
      return (yield testDurableEffect(42)) as number;
    }

    // This assignment should compile: Workflow → Operation
    const _op: Operation<number> = {
      [Symbol.iterator]: _myWorkflow,
    };
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NEGATIVE: These SHOULD NOT compile (commented out with expected errors)
// ---------------------------------------------------------------------------

// Uncomment any of these to verify they produce type errors:

// import { sleep, useScope } from "effection";
//
// function* _badWorkflow1(): Workflow<void> {
//   yield* sleep(1000);
//   // ^ Type error: Iterator<Effect<unknown>, void, unknown> is not
//   //   assignable to Iterator<DurableEffect<unknown>, ...>
// }
//
// function* _badWorkflow2(): Workflow<void> {
//   yield* useScope();
//   // ^ Type error: same reason — useScope returns Operation<Scope>,
//   //   which yields Effect<unknown>, not DurableEffect<unknown>
// }
