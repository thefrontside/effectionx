import { createSchema, slice } from "starfx";

import type { ScopeNode } from "../../scope/protocol.ts";
export { ScopeNode };

export const [schema, initialState] = createSchema({
  snapshot: slice.table<ScopeNode>(),
  cache: slice.table(),
  loaders: slice.loaders(),
});
export type AppState = typeof initialState;
