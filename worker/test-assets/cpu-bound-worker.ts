import { workerMain } from "../worker-main.ts";

await workerMain<never, never, never, SharedArrayBuffer>(function* ({ data }) {
  let state = new Int32Array(data);
  Atomics.store(state, 0, 1);
  Atomics.notify(state, 0);

  while (true) {
    Atomics.load(state, 0);
  }
});
