import { call, each } from "effection";
import { createThunks, mdw, put, select } from "starfx";
import { schema, ScopeEvent } from "./schema";
import { createSSEClient } from "../client";
import { protocol } from "../../mod";

const { methods } = createSSEClient(protocol);

const thunk = createThunks();
// catch errors from task and logs them with extra info
thunk.use(mdw.err);
// where all the thunks get called in the middleware stack
thunk.use(thunk.routes());

// the deep nesting of some of our types requires special handling
let patchEvent = thunk.create<{ data: ScopeEvent; tick: number }>(
  "patchEvent",
  function* (ctx, next) {
    let existing = {} as ScopeEvent;
    try {
      existing = yield* select((state) =>
        schema.events.selectById(state, { id: ctx.payload.data.id.toString() }),
      );
    } catch (error) {
      // no existing event found
    }

    let patch = {
      [ctx.payload.data.id.toString()]: {
        ...existing,
        id: ctx.payload.data?.id,
        ...(ctx?.payload?.data?.parentId
          ? { parentId: ctx.payload.data.parentId }
          : {}),
        state: {
          ...existing?.state,
          [ctx.payload.data.type]: {
            tick: ctx.payload.tick,
            result: ctx.payload.data.result,
          },
        },
      },
    };
    yield* schema.update(schema.events.add(patch));
    yield* next();
  },
);

thunk.manage("watchScopes", call(function* () {
  for (let data of yield* each(methods.watchScopes)) {
    yield* put(patchEvent({ data, tick: tick++ }));
    yield* each.next();
  }
}));
export { thunk };
