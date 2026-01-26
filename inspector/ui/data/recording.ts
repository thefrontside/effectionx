import {
  type Stream,
  type Operation,
  resource,
  createSignal,
  spawn,
} from "effection";
import type { NodeMap } from "./types";
import { createSubject } from "@effectionx/stream-helpers";
import { pipe } from "remeda";

export interface Recording {
  length: number;
  replayStream(): Stream<NodeMap, never>;
  setOffset(offset: number): void;
}

// 0---1--------2----34------5--------X--------------------6------------------0

// export interface Range {
//   length: number;
// }

export interface Cassette {
  length: number;
  loadOffset(offset: number): Operation<Tick>;
}

export interface Tick {
  nodemap: NodeMap;
}

export function* useRecording(
  load: () => Operation<Cassette>,
): Operation<Recording> {
  let { length, loadOffset } = yield* load();
  let stream = createSignal<number, never>();

  const offsets = pipe(stream, createSubject<number>(0));

  return {
    length,
    setOffset: stream.send,
    *replayStream() {
      let subscription = yield* offsets;

      return {
        *next() {
          let next = yield* subscription.next();
          let tick = yield* loadOffset(next.value);
          return {
            done: false,
            value: tick.nodemap,
          };
        },
      };
    },
  };
}

export function arrayLoader(array: NodeMap[]): () => Operation<Cassette> {
  return function* () {
    return {
      length: array.length,
      *loadOffset(offset) {
        return {
          nodemap: array[offset],
        };
      },
    };
  };
}
