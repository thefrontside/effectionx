import process from "node:process";
import { when } from "@effectionx/converge";
import { withForce } from "@effectionx/forceable";
import { lines } from "@effectionx/stream-helpers";
import { describe, it } from "@effectionx/vitest";
import {
  type Operation,
  type Task,
  spawn,
  suspend,
  withResolvers,
} from "effection";
import { expect } from "expect";

import { type Process, exec } from "../mod.ts";
import { expectMatch } from "./helpers.ts";

/**
 * Traps SIGTERM and never exits, so graceful teardown alone would wait forever.
 * It prints `ready` once its handlers are installed.
 */
const resistant = () => `${process.execPath} ./fixtures/shutdown-resistant.ts`;

/**
 * Resolves once the fixture reports that its signal handlers are installed.
 * Waiting on a clock instead would let SIGTERM arrive first, in which case the
 * child dies of graceful shutdown and the test proves nothing.
 */
function* readyLine(proc: Process): Operation<void> {
  yield* expectMatch(/ready/, lines()(proc.stdout));
}

/** Resolves once the operating system has reaped `pid`. */
function* reaped(pid: number): Operation<void> {
  yield* when(
    function* () {
      try {
        process.kill(pid, 0);
      } catch {
        return; // ESRCH: gone
      }
      throw new Error(`process ${pid} is still alive`);
    },
    { timeout: 10_000 },
  );
}

describe("withForce(exec())", () => {
  it("bounds a process that ignores graceful shutdown", function* () {
    let ready = withResolvers<number>();
    let force = withResolvers<void>();

    let task: Task<void> = yield* spawn(function* () {
      let proc = yield* withForce(
        exec(resistant(), { cwd: import.meta.dirname }),
        function* (force$) {
          // Forcing is driven by the test rather than by a delay.
          yield* force.operation;
          force$("ignored SIGTERM");
        },
      );
      yield* spawn(function* () {
        yield* readyLine(proc);
        ready.resolve(proc.pid);
      });
      yield* suspend();
    });

    // Only once the handlers are installed is SIGTERM something the child can
    // actually ignore.
    let pid = yield* ready.operation;
    force.resolve();

    // Without withForce this halt never returns: the child traps SIGTERM and
    // teardown waits on stdio that never closes.
    yield* task.halt();

    // SIGKILL went to the group, so the process is genuinely gone rather than
    // merely abandoned.
    yield* reaped(pid);
  });

  it("leaves a cooperative process to shut down gracefully", function* () {
    let ready = withResolvers<number>();
    let forced = false;

    let task: Task<void> = yield* spawn(function* () {
      let proc = yield* withForce(
        exec(`${process.execPath} ./fixtures/cooperative.ts`, {
          cwd: import.meta.dirname,
        }),
        function* (force) {
          // Never fires on its own; only a test-owned signal would force.
          yield* suspend();
          forced = true;
          force("should not happen");
        },
      );
      yield* spawn(function* () {
        yield* readyLine(proc);
        ready.resolve(proc.pid);
      });
      yield* suspend();
    });

    let pid = yield* ready.operation;
    yield* task.halt();

    // SIGTERM was enough, so the policy was cancelled where it stood.
    expect(forced).toBe(false);
    yield* reaped(pid);
  });
});
