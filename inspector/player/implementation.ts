import {
  createChannel,
  createContext,
  lift,
  resource,
  type Subscription,
  withResolvers,
  type Operation,
} from "effection";
import { createImplementation } from "../lib/implementation.ts";
import { protocol } from "./protocol.ts";
import { op } from "../lib/impl.ts";

export type PlayerStatus = "playing" | "paused";

export type PlayerContext =
  | {
      status: "playing";
    }
  | {
      status: "paused";
      resume: () => Operation<void>;
    };

const PlayerContext = createContext<{ ref: PlayerContext }>(
  "@effectionx/inspector.player",
);

const state = createChannel<PlayerStatus, never>();

export const player = createImplementation(protocol, function* () {
  yield* initContext();
  return {
    play: op(function* () {
      let cxt = yield* getContext();
      if (cxt && cxt.status === "paused") {
        yield* setContext({ status: "playing" });
        yield* cxt.resume();
      }
    }),

    watchPlayerState: () =>
      resource(function* (provide) {
        let context = yield* getContext();
        let current: IteratorYieldResult<PlayerStatus> = {
          done: false,
          value: context ? context.status : "playing",
        };
        let states = yield* state;
        let subscription: Subscription<PlayerStatus, never> = {
          *next() {
            subscription.next = states.next;
            return current;
          },
        };
        yield* provide(subscription);
      }),
  };
});

export function* pause() {
  let resumed = withResolvers<void>();
  yield* setContext({
    status: "paused",
    resume: lift(resumed.resolve),
  });

  yield* resumed.operation;
}

function* initContext(): Operation<void> {
  yield* PlayerContext.set({ ref: { status: "playing" } });
}

function* setContext(value: PlayerContext): Operation<void> {
  let context = yield* PlayerContext.expect();

  context.ref = value;

  yield* state.send(value.status);
}

function* getContext(): Operation<PlayerContext | undefined> {
  let context = yield* PlayerContext.expect();
  return context.ref;
}
