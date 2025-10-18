import { suspend, until } from "effection";
import { workerMain } from "../worker-main.ts";
import { writeFile } from "node:fs/promises";

export interface ShutdownWorkerParams {
  startFile: string;
  endFile: string;
  endText: string;
}

await workerMain(function* ({ data }) {
  let params = data as ShutdownWorkerParams;
  let { startFile, endFile, endText } = params;
  try {
    yield* until(writeFile(startFile, "started", 'utf-8'));
    yield* suspend();
  } finally {
    yield* until(writeFile(endFile, endText, 'utf-8'));
  }
});
