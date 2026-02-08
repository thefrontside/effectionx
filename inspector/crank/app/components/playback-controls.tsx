import type { Context } from "@b9g/crank";
import {
  createScope,
  Ok,
  sleep,
  withResolvers,
  type Operation,
} from "effection";
import type { Recording } from "../data/recording.ts";
import playbackStyles from "./playback-controls.module.css";

export async function* PlaybackControls(
  {
    recording,
    tickIntervalMs = 600,
  }: {
    recording: Recording;
    tickIntervalMs?: number;
  },
  ctx: Context,
) {
  let [scope, destroy] = createScope();
  let offset = 0;
  let playing = false;
  let refresh = ctx.refresh.bind(ctx);

  let playLoop = withResolvers();
  scope.run(function* (): Operation<void> {
    while (true) {
      playLoop = withResolvers();
      while (playing) {
        console.log("looping", { playing, offset });
        if (playing) {
          const nextOffset = offset + 1 > recording.length - 1 ? 0 : offset + 1;
          console.log(nextOffset, recording.length);
          recording.setOffset(nextOffset);

          refresh(() => (offset = nextOffset));
          yield* sleep(tickIntervalMs);
        }
      }
      yield* playLoop.operation;
    }
  });

  ctx.addEventListener("sl-input", (event) => {
    const v = Number(
      event?.target && "value" in event?.target ? event.target.value : 0,
    );
    recording.setOffset(v);
    refresh(() => (offset = v));
  });

  try {
    for ({} of ctx) {
      yield (
        <>
          <div class={playbackStyles.wrapper}>
            <div class={playbackStyles.controls}>
              <sl-button
                type="button"
                variant="default"
                onclick={() => {
                  console.log("play/pause clicked");
                  refresh(() => {
                    playing = !playing;
                    playLoop.resolve(Ok());
                  });
                }}
              >
                {playing ? "Pause" : "Play"}
              </sl-button>

              <div id="offset-label">Offset:</div>
              <sl-range
                min={0}
                max={recording ? (recording as Recording).length - 1 : 0}
                step={1}
                value={offset}
                aria-labelledby="offset-label"
              />

              <div class={playbackStyles.valueDisplay}>
                {offset} / {recording ? (recording as Recording).length - 1 : 0}
              </div>
            </div>
          </div>

          <sl-divider class={playbackStyles.divider} />
        </>
      );
    }
  } finally {
    await destroy();
  }
}
