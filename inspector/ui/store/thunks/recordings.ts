import { each } from "effection";
import { type Operation, put, call, select, spawn, until } from "starfx";
import { thunks } from "./foundation.ts";
import { schema } from "../schema.ts";
import { pipe } from "remeda";
import { arrayLoader, useRecording } from "../../data/recording.ts";
import { stratify } from "../../data/stratify.ts";

export let handleFileRecording = thunks.create<File>(
  "handleFileRecording",
  function* (ctx, next) {
    const text = yield* until(ctx.payload.text());
    const json = JSON.parse(text);

    const recording = yield* useRecording(arrayLoader(json));
    const pipeline = pipe(recording.replayStream(), stratify());

    yield* schema.update(schema.snapshot.reset());

    let tick = 0
    for (let record of yield* each(pipeline)) {
      yield* schema.update(schema.snapshot.add({[]}));
    }

    console.log({ json });
    yield* next();
  },
);
