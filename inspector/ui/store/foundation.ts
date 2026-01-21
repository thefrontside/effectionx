import { call, each, stream, until, useAbortSignal } from "effection";
import { createThunks, mdw } from "starfx";
import { SSEMessage, SseStreamTransform } from "sse-stream-transform";
import { schema, ScopeEvent } from "./schema";

const thunk = createThunks();
// catch errors from task and logs them with extra info
thunk.use(mdw.err);
// where all the thunks get called in the middleware stack
thunk.use(thunk.routes());

thunk.manage("watchScopes", call(function*() {
  try {    
    let signal = yield* useAbortSignal();
    let response = yield* until(fetch("/events", {    
      signal,
      headers: {
	"Accept": "text/event-stream",
      }
    }));
  
    if (!response.body) {
      return;
    }

    // TODO: why is the vite app not recognizing ReadableStream as AsyncIterable??
    let events = stream(response.body.pipeThrough(new SseStreamTransform()) as unknown as AsyncIterable<SSEMessage>);
  
    for (let item of yield* each(events)) {    
      let data = JSON.parse(item.data) as ScopeEvent;
      console.log(data);
      yield* schema.update(schema.events.patch({
	[data.id]: data,      
      }))
      yield* each.next();
    }  
  } catch (error) {
    console.error(error);
    throw error;
  }
}))
export { thunk };
