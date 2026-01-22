import { createContext, useScope, type Operation } from "effection";

export type Labels = Record<string, string | number| boolean | Array<string | number | boolean>>;

export const LabelsContext = createContext<Labels>("@effectionx/inspector.labels", {});

export function* useLabels(labels: Labels): Operation<Labels> {
  let scope = yield* useScope();

  if (!scope.hasOwn(LabelsContext)) {
    return yield* LabelsContext.set(labels)
  } else {
    let current = yield* LabelsContext.expect();
    return yield* LabelsContext.set({ ...current, ...labels });
  }
}
