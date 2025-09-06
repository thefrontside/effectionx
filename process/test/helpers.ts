import { ctrlc } from "ctrlc-windows";
import type { Process } from "../src/exec.ts";
import { type Operation } from "effection";

const isWin32 = globalThis.process.platform === "win32";

export function terminate(process: Process): void {
  if (isWin32) {
    ctrlc(process.pid);
    //Terminate batch process? (Y/N)
    process.stdin.send("Y\n");
  } else {
    globalThis.process.kill(process.pid, "SIGTERM");
  }
}

// cross platform user initiated graceful shutdown request. What would
// be sent to the process by the Operating system when
// a users requests an interrupt via CTRL-C or equivalent.
export function interrupt(process: Process): void {
  if (isWin32) {
    ctrlc(process.pid);
    //Terminate batch process? (Y/N)
    process.stdin.send("Y\n");
  } else {
    globalThis.process.kill(process.pid, "SIGINT");
  }
}

export function* captureError(op: Operation<unknown>): Operation<Error> {
  try {
    yield* op;
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected operation to throw an error, but it did not!");
}
