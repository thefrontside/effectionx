import process from "node:process";
import { withForce } from "@effectionx/forceable";
import { describe, it } from "@effectionx/vitest";
import { type Task, sleep, spawn, suspend } from "effection";
import { expect } from "expect";

import { exec } from "../mod.ts";

/**
 * Traps SIGTERM and never exits, so graceful teardown alone would wait forever.
 */
const resistant = () => `${process.execPath} ./fixtures/shutdown-resistant.ts`;

describe("withForce(exec())", () => {
  it("bounds a process that ignores graceful shutdown", function* () {
    let pid: number | undefined;

    let task: Task<void> = yield* spawn(function* () {
      let proc = yield* withForce(
        exec(resistant(), { cwd: import.meta.dirname }),
        function* (force) {
          yield* sleep(100);
          force("ignored SIGTERM");
        },
      );
      pid = proc.pid;
      yield* suspend();
    });

    // Give the child time to install its signal handlers.
    yield* sleep(500);
    expect(pid).toBeDefined();

    // Without withForce this halt never returns: the child traps SIGTERM and
    // teardown waits on stdio that never closes.
    yield* task.halt();

    // SIGKILL went to the group, so the process is actually gone rather than
    // merely abandoned. kill(pid, 0) throws ESRCH once it has been reaped.
    yield* sleep(100);
    let alive = true;
    try {
      process.kill(pid as number, 0);
    } catch {
      alive = false;
    }
    expect(alive).toBe(false);
  });

  it("leaves a cooperative process to shut down gracefully", function* () {
    let forced = false;

    let task: Task<void> = yield* spawn(function* () {
      yield* withForce(
        exec(`${process.execPath} -e "setInterval(() => {}, 1000)"`, {
          cwd: import.meta.dirname,
        }),
        function* (force) {
          yield* sleep(10_000);
          forced = true;
          force("should not happen");
        },
      );
      yield* suspend();
    });

    yield* sleep(300);
    yield* task.halt();

    // SIGTERM was enough, so the policy was cancelled where it stood.
    expect(forced).toBe(false);
  });
});
