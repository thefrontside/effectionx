import { type Api, createApi } from "@effectionx/context-api";
import type { Operation } from "effection";
import { resource } from "effection";

import type { Daemon } from "./src/daemon.ts";
import type { ExecOptions, Process } from "./src/exec/types.ts";
import { DaemonExitError } from "./src/exec/error.ts";
import { createPosixProcess } from "./src/exec/posix.ts";
import { createWin32Process, isWin32 } from "./src/exec/win32.ts";

export interface ProcessHandler {
  exec(command: string, options: ExecOptions): Operation<Process>;
  daemon(command: string, options: ExecOptions): Operation<Daemon>;
}

export const ProcessApi: Api<ProcessHandler> = createApi(
  "@effectionx/process",
  {
    *exec(command: string, options: ExecOptions): Operation<Process> {
      if (isWin32()) {
        return yield* createWin32Process(command, options);
      }
      return yield* createPosixProcess(command, options);
    },

    *daemon(command: string, options: ExecOptions): Operation<Daemon> {
      return yield* resource(function* (provide) {
        let process = yield* ProcessApi.operations.exec(command, options);

        yield* provide({
          *[Symbol.iterator]() {
            let status = yield* process.join();
            throw new DaemonExitError(status, command, options);
          },
          ...process,
        });
      });
    },
  },
);
