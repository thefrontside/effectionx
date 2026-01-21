import { createSchema, slice } from "starfx";
import type { ScopeEvent } from "../../mod.ts";

export type { ScopeEvent } from "../../mod.ts";

export const [schema, initialState] = createSchema({
  events: slice.table<ScopeEvent>(),
  cache: slice.table(),
  loaders: slice.loaders(),
});
export type AppState = typeof initialState;
