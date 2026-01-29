import { createContext, type Scope, useScope, type Operation } from "effection";

export type Labels = Record<string, string | number | boolean>;

export const LabelsContext = createContext<Labels>(
  "@effectionx/inspector.labels",
  { name: "anonymous" },
);

export function* useLabels(labels: Labels): Operation<Labels> {
  let scope = yield* useScope();

  if (!scope.hasOwn(LabelsContext)) {
    return yield* LabelsContext.set({
      ...LabelsContext.defaultValue,
      ...labels,
    });
  } else {
    let current = yield* LabelsContext.expect();
    return yield* LabelsContext.set({ ...current, ...labels });
  }
}

export function getLabels(scope: Scope) {
  if (scope.hasOwn(LabelsContext)) {
    return scope.expect(LabelsContext);
  } else {
    return LabelsContext.defaultValue as Labels;
  }
}
