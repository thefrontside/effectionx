import { createSchema, slice } from "starfx";
import { logs } from "./empty.ts";

// TODO get this from the protocol
export interface Inspector {
  type: string;
  id: string;
  parentId?: string;
  result?: {
    exists: boolean;
    value?: { ok: boolean; value?: string };
  };
}

const initialInspector = logs.reduce(
  (state: Record<string, Inspector>, value: Inspector) => {
    state[value.id] = value;
    return state;
  },
  {} as Record<string, Inspector>,
);

export const [schema, initialState] = createSchema({
  inspect: slice.table<Inspector>({ initialState: initialInspector }),
  cache: slice.table(),
  loaders: slice.loaders(),
});
export type AppState = typeof initialState;
