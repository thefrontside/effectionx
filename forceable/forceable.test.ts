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

import {
  ForcedTerminationError,
  type Forceable,
  force,
  withForce,
} from "./forceable.ts";

interface Stubborn extends Forceable {
  /** the error the resource settled with, readable after the scope is gone */
  outcome(): Error | undefined;
}

/**
 * A resource that will not finish its graceful teardown unless something tells
 * it to. `onTeardown` runs when teardown begins and receives the trigger, so a
 * test decides whether the graceful path lands rather than having to time it.
 */
function useStubborn(
  log: string[],
  onTeardown: (
    closeGracefully: () => void,
  ) => Operation<void> = function* () {},
): Operation<Stubborn> {
  let settled = withResolvers<void>();
  let done = false;
  let failure: Error | undefined;

  return resource(function* (provide) {
    const finish = (how: string, error?: Error) => {
      if (!done) {
        done = true;
        failure = error;
        log.push(how);
        settled.resolve();
      }
    };

    yield* ensure(function* () {
      yield* onTeardown(() => finish("closed gracefully"));
      yield* settled.operation;
    });

    yield* provide({
      [force]: (reason?: string) =>
        finish(`forced: ${reason}`, new ForcedTerminationError(reason)),
      outcome: () => failure,
    });
  });
}

/** Closes as soon as teardown begins, so the graceful path always wins. */
function* cooperative(closeGracefully: () => void): Operation<void> {
  closeGracefully();
}

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
    let stubborn: Stubborn | undefined;

    yield* scoped(function* () {
      // No onTeardown, so this resource never closes on its own.
      stubborn = yield* withForce(useStubborn(log), function* (force) {
        force("deadline expired");
      });
    });

    expect(log).toEqual(["forced: deadline expired"]);
    // The resource settled as a failure rather than a clean finish.
    expect(stubborn?.outcome()).toBeInstanceOf(ForcedTerminationError);
    expect(stubborn?.outcome()?.message).toEqual("deadline expired");
  });

  it("cancels the policy so it cannot force after a graceful teardown", function* () {
    let log: string[] = [];
    let policyResumed = false;
    let policyReady = withResolvers<void>();

    yield* scoped(function* () {
      yield* withForce(
        // Hold the graceful close until the policy is actually suspended.
        // Closing sooner would let this pass without cancelling anything.
        useStubborn(log, function* (closeGracefully) {
          yield* policyReady.operation;
          closeGracefully();
        }),
        function* (force) {
          policyReady.resolve();
          yield* suspend();
          policyResumed = true;
          force("should never happen");
        },
      );
    });

    expect(log).toEqual(["closed gracefully"]);
    expect(policyResumed).toEqual(false);
  });

  it("stays quiet, so forcing does not disturb the halt", function* () {
    let log: string[] = [];
    let acquired = withResolvers<void>();
    let forced = false;
    let halted: Error | undefined;
    let stubborn: Stubborn | undefined;

    let task = yield* spawn(function* () {
      stubborn = yield* withForce(useStubborn(log), function* (force) {
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

    // The resource failed, and the halt that caused it still completed cleanly.
    expect(forced).toEqual(true);
    expect(stubborn?.outcome()).toBeInstanceOf(ForcedTerminationError);
    expect(halted).toBeUndefined();
  });

  // Raising from inside a policy is NOT a reliable way to make forcing loud:
  // whether the throw lands is a race against how many turns the resource's own
  // teardown needs after being forced. If forcing should be loud, that belongs
  // in withForce, where it can be deterministic.
});
