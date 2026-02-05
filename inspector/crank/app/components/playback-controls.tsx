import type { Context } from "@b9g/crank";
import { createScope, sleep, type Operation } from "effection";
import type { Recording } from "../data/recording.ts";
import playbackStyles from "./playback-controls.module.css";

export async function* PlaybackControls(
  this: Context,
  {
    recording,
    offset = 0,
    setOffset,
    tickIntervalMs = 250,
  }: {
    recording?: Recording | null;
    offset?: number;
    setOffset: (n: number) => void;
    tickIntervalMs?: number;
  },
) {
  let [scope, destroy] = createScope();
  let playTask: any = null;
  let playing = false;
  let inputEl: HTMLElement | null = null;
  let refresh = this.refresh.bind(this);

  try {
    for ({} of this) {
      if (inputEl) {
        (inputEl as HTMLInputElement).value = String(offset);
      }

      yield (
        <>
          <div class={playbackStyles.wrapper}>
            <div class={playbackStyles.controls}>
              <sl-button
                type="button"
                variant="default"
                onclick={() => {
                  playing = !playing;

                  if (playing) {
                    if (!playTask) {
                      playTask = scope.run(function* (): Operation<void> {
                        try {
                          while (playing && recording) {
                            yield* sleep(tickIntervalMs);

                            const newOffset = Math.min(
                              offset + 1,
                              (recording as Recording).length - 1,
                            );

                            setTimeout(() => {
                              refresh(() => {
                                setOffset(newOffset);
                                recording?.setOffset(newOffset);
                              });
                              setTimeout(() => {
                                if (inputEl)
                                  (inputEl as HTMLInputElement).value =
                                    String(newOffset);
                              });
                            }, 0);

                            if (
                              recording &&
                              newOffset >= (recording as Recording).length - 1
                            ) {
                              playing = false;
                              refresh();
                              break;
                            }
                          }
                        } finally {
                          playTask = null;
                        }
                      });
                    }
                  } else {
                    if (playTask && playTask.halt) {
                      playTask.halt().catch(() => {});
                      playTask = null;
                    }
                  }

                  this.refresh();
                }}
              >
                {playing ? "Pause" : "Play"}
              </sl-button>

              <div id="offset-label">Offset:</div>
              <sl-range
                ref={(el: HTMLElement | null) => {
                  inputEl = el;
                }}
                min={0}
                max={recording ? (recording as Recording).length - 1 : 0}
                step={1}
                value={offset}
                aria-labelledby="offset-label"
                onsl-input={(e: Event) => {
                  const ce = e as CustomEvent;
                  const v = Number(ce?.detail?.value ?? 0);
                  setTimeout(() => {
                    refresh(() => {
                      setOffset(v);
                      recording?.setOffset(v);
                    });
                    setTimeout(() => {
                      if (inputEl) (inputEl as any).value = String(v);
                    });
                  }, 0);
                }}
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
    if (playTask && playTask.halt) {
      try {
        await playTask.halt();
      } catch (err) {
        // ignore
      }
    }
    await destroy();
  }
}
