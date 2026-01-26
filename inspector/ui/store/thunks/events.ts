import { each, type Operation, put, call, select, spawn, until } from "starfx";
import { thunks } from "./foundation.ts";
import { schema, ScopeEvent } from "../schema.ts";
import { createSSEClient } from "../../client.ts";
import { protocol } from "../../../scope/protocol.ts";

// const { methods } = createSSEClient(protocol);

thunks.manage(
  "watchScopes",
  call<void>(function* () {
    try {
      let tick = 0;
      console.log("Starting watchScopes SSE connection");

      // for (let data of yield* each(methods.watchScopes())) {
      //   console.log({ data });
      //   // yield* put(patchEvent({ data, tick: tick++ }));
      //   yield* each.next();
      // }
    } catch (error) {
      console.error("Error in watchScopes thunk:", error);
    } finally {
      console.log("Closing watchScopes SSE connection");
    }
  }),
);

// the deep nesting of some of our types requires special handling
// let patchEvent = thunks.create<{ data: ScopeEvent; tick: number }>(
//   "patchEvent",
//   function* (ctx, next) {
//     let existing = {} as ScopeEvent;
//     try {
//       existing = yield* select((state) =>
//         schema.events.selectById(state, { id: ctx.payload.data.id.toString() }),
//       );
//     } catch (error) {
//       // no existing event found
//     }

//     let patch = {
//       [ctx.payload.data.id.toString()]: {
//         ...existing,
//         id: ctx.payload.data?.id,
//         ...(ctx?.payload?.data?.parentId
//           ? { parentId: ctx.payload.data.parentId }
//           : {}),
//         state: {
//           ...existing?.state,
//           [ctx.payload.data.type]: {
//             tick: ctx.payload.tick,
//             result: ctx.payload.data.result,
//           },
//         },
//       },
//     };
//     yield* schema.update(schema.events.add(patch));
//     yield* next();
//   },
// );

export let playEvents = thunks.create<void>(
  "playEvents",
  function* (ctx, next) {
    console.log("Toggling event playback", ctx);
    const response = yield* until(
      fetch("/play", { method: "POST", body: JSON.stringify([]) }),
    );
    console.log("Toggle events response:", response);
    yield* next();
  },
);
