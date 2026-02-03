export function resolveClass(
  c: string | ((props?: Record<string, any>) => string) | undefined,
  props?: Record<string, any>,
): string | undefined {
  if (!c) return undefined;
  return typeof c === "function" ? c(props) : c;
}
