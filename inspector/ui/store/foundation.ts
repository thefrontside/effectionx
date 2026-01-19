import { createThunks, mdw } from "starfx";

const thunk = createThunks();
// catch errors from task and logs them with extra info
thunk.use(mdw.err);
// where all the thunks get called in the middleware stack
thunk.use(thunk.routes());

export { thunk };
