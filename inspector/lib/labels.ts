import {
  createContext,
  type Scope,
  useScope,
  type Operation,
  type Attributes,
} from "effection";

export const AttributesContext = createContext<Attributes>(
  "@effection/attributes",
  {
    name: "anonymous",
  },
);

export function getLabels(scope: Scope) {
  if (scope.hasOwn(AttributesContext)) {
    return scope.expect(AttributesContext);
  }
  return AttributesContext.defaultValue!;
}
