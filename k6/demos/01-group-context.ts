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
 * @effectionx/k6 provides:
 * - group(name): append to the current context for this scope
 * - withGroup(name, op): run op in nested group context without mutating outer scope
 * - useGroups(): read full context path
 *
 * Run with: k6 run dist/demos/01-group-context.js
 */

import { sleep } from "k6";
import {
  main,
  group,
  withGroup,
  useGroups,
  useTags,
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

  // Append to the current scope context
  yield* group("api-tests");
  console.log(
    `After group("api-tests"): ${JSON.stringify(yield* useGroups())}`,
  );

  // Make an HTTP request - context is preserved
  const response = yield* http.get("https://test.k6.io");
  console.log(`HTTP response status: ${response.status}`);
  console.log(`After HTTP call: ${JSON.stringify(yield* useGroups())}`);

  // Scoped nested group
  yield* withGroup("users", function* () {
    console.log(
      `Inside withGroup("users"): ${JSON.stringify(yield* useGroups())}`,
    );
    yield* http.get("https://test.k6.io/contacts.php");
    console.log(`After nested HTTP: ${JSON.stringify(yield* useGroups())}`);
  });

  // Back to outer context after withGroup
  console.log(`After withGroup returns: ${JSON.stringify(yield* useGroups())}`);

  // Repeated group() appends again in same scope
  yield* group("world");
  console.log(`After group("world"): ${JSON.stringify(yield* useGroups())}`);

  // Outside all groups
  const outside = yield* useGroups();
  console.log(`Current groups: ${JSON.stringify(outside)}`);

  // Show full tags context
  const tags = yield* useTags();
  console.log(`Full tags context: ${JSON.stringify(tags)}`);

  console.log("\n=== Demo Complete ===");
  console.log("Group context was preserved across all async boundaries!");
});
