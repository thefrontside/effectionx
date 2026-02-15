/**
 * @effectionx/k6 - Effection integration for K6 load testing
 *
 * This package provides structured concurrency primitives for K6 scripts,
 * solving common async/concurrency pain points in K6:
 *
 * - group() losing context across async boundaries (K6 issues #2848, #5435)
 * - WebSocket handlers losing async results (K6 issue #5524)
 * - Unhandled promise rejections not failing tests (K6 issue #5249)
 * - Lack of structured cleanup/teardown
 *
 * @example
 * ```typescript
 * import { vuIteration, group, http } from '@effectionx/k6';
 *
 * export default vuIteration(function*() {
 *   yield* group("api-tests", function*() {
 *     // Context is preserved across async boundaries
 *     const response = yield* http.get("https://api.example.com");
 *     console.log(yield* currentGroupString()); // "api-tests"
 *   });
 * });
 * ```
 *
 * @packageDocumentation
 */

// Re-export all library exports
export * from "./lib/mod.ts";

// Re-export conformance test utilities for runtime validation
export {
  runSyncTests,
  runAsyncTests,
  runAllTests,
  printResults,
  allCriticalTestsPassed,
  type ConformanceResult,
  type ConformanceResults,
} from "./conformance/mod.ts";
