import { each, main, sleep, spawn } from "effection";
import data from "./recording.json" with { type: "json" };
import { arrayLoader, useRecording } from "./ui/data/recording.ts";
import { stratify } from "./ui/data/stratify.ts";
import { pipe } from "remeda";

await main(function*() {
  let recording = yield* useRecording(arrayLoader(data));

  let hierarchies = pipe(
    recording.replayStream(),
    stratify(),
  )

  yield* spawn(function*() {
    for (let i = 0; i < recording.length; i++) {
      recording.setOffset(i);
      yield* sleep(250);
    }
  })
  
  for (let item of yield* each(hierarchies)) {
    console.dir(item, { depth: 20 });
    yield* each.next();
  }
});
