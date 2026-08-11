import { describe, it } from "@effectionx/vitest";
import {
  type Operation,
  ensure,
  resource,
  scoped,
  spawn,
  suspend,
  withResolvers,
} from "effection";
import { expect } from "expect";

import { type Forceable, force, withForce } from "./forceable.ts";

/**
 * A resource that will not finish its graceful teardown unless something tells
 * it to. `onTeardown` runs when teardown begins and receives the trigger, so a
 * test decides whether the graceful path lands rather than having to time it.
 */
function useStubborn(
  log: string[],
  onTeardown: (closeGracefully: () => void) => void = () => {},
): Operation<Forceable> {
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
      onTeardown(() => finish("closed gracefully"));
      yield* settled.operation;
    });

    yield* provide({
      [force]: (reason?: string) => finish(`forced: ${reason}`),
    });
  });
}

/** Closes as soon as teardown begins, so the graceful path always wins. */
const cooperative = (closeGracefully: () => void) => closeGracefully();

describe("withForce", () => {
  it("lets graceful teardown finish when the resource cooperates", function* () {
    let log: string[] = [];

    yield* scoped(function* () {
      yield* withForce(useStubborn(log, cooperative), function* (force) {
        yield* suspend();
        force("should never happen");
      });
    });

    expect(log).toEqual(["closed gracefully"]);
  });

  it("cuts graceful teardown short when the policy forces", function* () {
    let log: string[] = [];

    yield* scoped(function* () {
      // No onTeardown, so this resource never closes on its own.
      yield* withForce(useStubborn(log), function* (force) {
        force("deadline expired");
      });
    });

    expect(log).toEqual(["forced: deadline expired"]);
  });

  it("cancels the policy so it cannot force after a graceful teardown", function* () {
    let log: string[] = [];
    let policyResumed = false;

    yield* scoped(function* () {
      yield* withForce(useStubborn(log, cooperative), function* (force) {
        yield* suspend();
        policyResumed = true;
        force("should never happen");
      });
    });

    expect(log).toEqual(["closed gracefully"]);
    expect(policyResumed).toEqual(false);
  });

  it("stays quiet, so forcing does not disturb the halt", function* () {
    let log: string[] = [];
    let acquired = withResolvers<void>();
    let forced = false;
    let halted: Error | undefined;

    let task = yield* spawn(function* () {
      yield* withForce(useStubborn(log), function* (force) {
        forced = true;
        force("deadline expired");
      });
      acquired.resolve();
      yield* suspend();
    });

    yield* acquired.operation;

    try {
      yield* task.halt();
    } catch (error) {
      halted = error as Error;
    }

    // Forcing happened, and the halt still completed without an error.
    expect(forced).toEqual(true);
    expect(log).toEqual(["forced: deadline expired"]);
    expect(halted).toBeUndefined();
  });

  // Raising from inside a policy is NOT a reliable way to make forcing loud:
  // whether the throw lands is a race against how many turns the resource's own
  // teardown needs after being forced. If forcing should be loud, that belongs
  // in withForce, where it can be deterministic.
});
