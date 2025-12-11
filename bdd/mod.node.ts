import { after, describe as $describe, it as $it } from "node:test";
import { getAssertionState } from "@std/internal/assertion-state";
import { createBDD } from "./bdd.ts";

/**
 * Checks and resets the assertion state after each test.
 * This ensures expect.assertions() works correctly with Node's test runner.
 */
function checkAndResetAssertions(): void {
  const state = getAssertionState();

  // Check if expect.hasAssertions() was used but no assertion was triggered
  if (state.checkAssertionErrorState()) {
    state.resetAssertionState();
    throw new Error(
      "Expected at least one assertion to be called but received none",
    );
  }

  // Check if expect.assertions(n) count was not satisfied
  if (state.checkAssertionCountSatisfied()) {
    const expected = state.assertionCount;
    const actual = state.assertionTriggeredCount;
    state.resetAssertionState();
    throw new Error(
      `Expected ${expected} assertions to be called but received ${actual}`,
    );
  }

  // Reset for next test
  state.resetAssertionState();
}

const bdd = createBDD({
  describe: $describe,
  it: $it,
  afterAll: after,
  afterEachTest: checkAndResetAssertions,
});

export const { describe, it, beforeAll, beforeEach } = bdd;
