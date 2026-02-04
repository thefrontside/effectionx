import type { Context } from "@b9g/crank";
import { createScope, sleep, type Operation } from "effection";
import type { Recording } from "../data/recording.ts";

export async function* PlaybackControls(
  this: Context,
  {
    recording,
    offset = 0,
    setOffset,
    refresh,
    tickIntervalMs = 250,
  }: {
    recording?: Recording | null;
    offset?: number;
    setOffset: (n: number) => void;
    refresh: (fn?: () => void) => void;
    tickIntervalMs?: number;
  },
) {
  let [scope, destroy] = createScope();
  let playTask: any = null;
  let playing = false;
  let inputEl: HTMLInputElement | null = null;

  try {
    for ({} of this) {
      if (inputEl) {
        (inputEl as HTMLInputElement).value = String(offset);
      }

      yield (
        <div class="controls">
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

          <label>
            Offset:{" "}
            <input
              ref={(el: HTMLInputElement | null) => (inputEl = el)}
              type="range"
              min={0}
              max={recording ? (recording as Recording).length - 1 : 0}
              value={offset}
              onInput={(e: Event) => {
                const v = Number((e.currentTarget as HTMLInputElement).value);
                setTimeout(() => {
                  refresh(() => {
                    setOffset(v);
                    recording?.setOffset(v);
                  });
                  setTimeout(() => {
                    if (inputEl)
                      (inputEl as HTMLInputElement).value = String(v);
                  });
                }, 0);
              }}
            />
          </label>
        </div>
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
