import { createContext, type Operation } from "effection";

export type Labels = Record<string, string | number| boolean>;

export const LabelsContext = createContext<Labels>("@effectionx/inspector.labels", {});

export function useLabels(labels: Labels): Operation<Labels> {
  return LabelsContext.set(labels);
}
