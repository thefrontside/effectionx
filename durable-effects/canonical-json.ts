/**
 * Canonical JSON serialization with stable key ordering.
 *
 * Produces the same string regardless of property insertion order,
 * preventing spurious StaleInputError from hash mismatches when
 * the same object is constructed with keys in a different order.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val).sort()) {
        sorted[k] = val[k];
      }
      return sorted;
    }
    return val;
  });
}
