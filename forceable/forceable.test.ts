import { describe, it } from "@effectionx/vitest";
import {
  type Operation,
  ensure,
  resource,
  scoped,
  sleep,
  spawn,
  suspend,
  withResolvers,
} from "effection";
import { expect } from "expect";

import {
  ForcedTerminationError,
  type Forceable,
  force,
  withForce,
} from "./forceable.ts";

interface Stubborn extends Forceable {
  /** how the teardown ended, readable after the scope is gone */
  report(): string;
}

/**
 * A resource whose graceful teardown takes `closeAfter` milliseconds and which
 * can be cut short. Stands in for anything holding an operating system handle.
 */
function useStubborn(closeAfter: number, log: string[]): Operation<Stubborn> {
  return resource(function* (provide) {
    let settled = withResolvers<void>();
    let done = false;

    const finish = (how: string) => {
      if (!done) {
        done = true;
        log.push(how);
        settled.resolve();
      }
    };

    yield* ensure(function* () {
      yield* spawn(function* () {
        yield* sleep(closeAfter);
        finish("closed gracefully");
      });
      yield* settled.operation;
    });

    yield* provide({
      [force]: (reason?: string) => finish(`forced: ${reason}`),
      report: () => log.join(),
    });
  });
}

describe("withForce", () => {
  it("lets graceful teardown finish when it lands inside the deadline", function* () {
    let log: string[] = [];

    yield* scoped(function* () {
      yield* withForce(useStubborn(10, log), function* (force) {
        yield* sleep(200);
        force("deadline expired");
      });
    });

    expect(log).toEqual(["closed gracefully"]);
  });

  it("cuts graceful teardown short when the deadline expires first", function* () {
    let log: string[] = [];

    yield* scoped(function* () {
      yield* withForce(useStubborn(10_000, log), function* (force) {
        yield* sleep(10);
        force("deadline expired");
      });
    });

    expect(log).toEqual(["forced: deadline expired"]);
  });

  it("cancels the policy so it cannot force after a graceful teardown", function* () {
    let log: string[] = [];
    let policyFinished = false;

    yield* scoped(function* () {
      yield* withForce(useStubborn(10, log), function* (force) {
        yield* suspend();
        policyFinished = true;
        force("should never happen");
      });
    });

    expect(log).toEqual(["closed gracefully"]);
    expect(policyFinished).toEqual(false);
  });

  it("stays quiet, so forcing does not disturb the halt", function* () {
    let log: string[] = [];
    let halted: Error | undefined;

    let task = yield* spawn(function* () {
      yield* withForce(useStubborn(10_000, log), function* (force) {
        force("deadline expired");
      });
      yield* suspend();
    });

    yield* sleep(50);
    try {
      yield* task.halt();
    } catch (error) {
      halted = error as Error;
    }

    expect(halted).toBeUndefined();
  });

  // Raising from inside a policy is NOT a reliable way to make forcing loud:
  // whether the throw lands is a race against how many turns the resource's own
  // teardown needs after being forced. If forcing should be loud, that belongs
  // in withForce, where it can be deterministic.
});
