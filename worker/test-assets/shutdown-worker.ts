import { writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
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
    yield* until(writeFile(startFile, "started", "utf-8"));
    yield* suspend();
  } finally {
    // Use sync write to ensure the file is written before the worker exits.
    // Async writes in finally blocks may not complete during task halt,
    // especially on Windows where worker termination behaves differently.
    writeFileSync(endFile, endText, "utf-8");
  }
});
