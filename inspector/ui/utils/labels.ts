export function valueToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch (_err) {
      return String(v);
    }
  }
  return String(v);
}

export function flattenNodeData(
  data: Record<string, unknown> | undefined,
): Array<{ k: string; v: string }> {
  const top = data ?? {};
  const topLevelKeys = Object.keys(top);

  return Object.entries(top).flatMap(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const entries = Object.entries(v as Record<string, unknown>);
      if (topLevelKeys.length === 1) {
        return entries.map(([subk, subv]) => ({
          k: subk,
          v: valueToString(subv),
        }));
      }
        return entries.map(([subk, subv]) => ({
          k: `${k}.${subk}`,
          v: valueToString(subv),
        }));
    }
    return [{ k, v: valueToString(v) }];
  });
}
