import { call, each, stream, until, useAbortSignal } from "effection";
import { createThunks, mdw, put, select, sleep } from "starfx";
import { SSEMessage, SseStreamTransform } from "sse-stream-transform";
import { schema, ScopeEvent } from "./schema";

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

thunk.manage(
  "watchScopes",
  call(function* () {
    try {
      let signal = yield* useAbortSignal();
      let response = yield* until(
        fetch("/events", {
          signal,
          headers: {
            Accept: "text/event-stream",
          },
        }),
      );

      if (!response.body) {
        return;
      }

      // TODO: why is the vite app not recognizing ReadableStream as AsyncIterable??
      let events = stream(
        response.body.pipeThrough(
          new SseStreamTransform(),
        ) as unknown as AsyncIterable<SSEMessage>,
      );

      let tick = 1;
      for (let item of yield* each(events)) {
        let data = JSON.parse(item.data) as ScopeEvent;
        yield* put(patchEvent({ data, tick: tick++ }));
        yield* each.next();
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }),
);
export { thunk };
