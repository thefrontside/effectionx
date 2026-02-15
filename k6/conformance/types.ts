/**
 * Result of a conformance test
 */
export interface ConformanceResult {
  /** Whether the test passed */
  pass: boolean;
  /** Human-readable description of the result */
  message: string;
  /** Optional details for debugging */
  details?: string;
}

/**
 * A conformance test function
 */
export type ConformanceTest = () => ConformanceResult;

/**
 * Collection of conformance test results keyed by test name
 */
export type ConformanceResults = Record<string, ConformanceResult>;
