import { suspend, until } from "effection";
import { workerMain } from "../worker-main.ts";

export interface ShutdownWorkerParams {
  startFile: string;
  endFile: string;
  endText: string;
}

await workerMain(function* ({ data }) {
  let params = data as ShutdownWorkerParams;
  let { startFile, endFile, endText } = params;
  try {
    yield* until(Deno.writeTextFile(startFile, "started"));
    yield* suspend();
  } finally {
    yield* until(Deno.writeTextFile(endFile, endText));
  }
});
