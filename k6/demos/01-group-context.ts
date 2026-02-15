/**
 * Demo 01: Group Context Preservation
 *
 * This demo shows how @effectionx/k6 solves K6's group context loss problem
 * (issues #2848, #5435) where metrics get attributed to the wrong group
 * after async operations.
 *
 * THE PROBLEM:
 * In standard K6, when you use group() and then do async operations (like HTTP calls),
 * the group context is lost. This causes metrics to be attributed to the wrong group
 * or to no group at all.
 *
 * THE SOLUTION:
 * @effectionx/k6's group() uses Effection's Context.with() for proper scoping.
 * The context is maintained across all async operations within the group.
 *
 * Run with: k6 run dist/demos/01-group-context.js
 */

import { sleep } from "k6";
import {
  main,
  group,
  currentGroupString,
  currentGroupPath,
  http,
} from "../lib/mod.ts";

// K6 options
export const options = {
  vus: 1,
  iterations: 1,
};

/**
 * Standard K6 problem demonstration (commented out for reference):
 *
 * import { group } from 'k6';
 * import http from 'k6/http';
 *
 * export default function() {
 *   group('api-tests', () => {
 *     http.get('https://test.k6.io');
 *     // After the HTTP call, we're still in 'api-tests' group... or are we?
 *     // With async operations, context can be lost!
 *   });
 * }
 */

// The @effectionx/k6 solution
export default main(function* () {
  console.log("=== Demo: Group Context Preservation ===\n");

  // Demonstrate nested groups with context preservation
  yield* group("api-tests", function* () {
    const path1 = yield* currentGroupString();
    console.log(`Inside api-tests group: "${path1}"`);

    // Make an HTTP request - context is preserved!
    const response = yield* http.get("https://test.k6.io");
    console.log(`HTTP response status: ${response.status}`);

    // Check context after async operation
    const path2 = yield* currentGroupString();
    console.log(`After HTTP call, still in: "${path2}"`);

    // Nested group
    yield* group("users", function* () {
      const nestedPath = yield* currentGroupPath();
      console.log(`Nested group path: ${JSON.stringify(nestedPath)}`);

      // Another HTTP call in nested group
      yield* http.get("https://test.k6.io/contacts.php");

      // Context still preserved
      const stillNested = yield* currentGroupString();
      console.log(`After nested HTTP, group is: "${stillNested}"`);
    });

    // Back to parent group automatically
    const backToParent = yield* currentGroupString();
    console.log(`After nested group, back to: "${backToParent}"`);
  });

  // Outside all groups
  const outside = yield* currentGroupString();
  console.log(`Outside groups: "${outside}" (empty string)`);

  console.log("\n=== Demo Complete ===");
  console.log("Group context was preserved across all async boundaries!");
});
