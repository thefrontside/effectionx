import { ActionButton, ActionButtonGroup, Slider } from "@react-spectrum/s2";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import {
  PauseIcon,
  RefreshIcon,
  PlayIcon,
  StepBackIcon,
  StepForwardIcon,
} from "./icons";

const toolbarIconStyle = style({
  display: "inline-flex",
  alignItems: "center",
});

interface Props {
  playing: boolean;
  setPlaying: (v: boolean | ((p: boolean) => boolean)) => void;
  offset: number;
  setOffset: (v: number | ((n: number) => number)) => void;
  maxValue: number;
  onRefresh: () => void;
}

export default function TopControls({
  playing,
  setPlaying,
  offset,
  setOffset,
  maxValue,
  onRefresh,
}: Props) {
  return (
    <div
      className={style({
        display: "flex",
        gap: 16,
        alignItems: "center",
        paddingBlock: 8,
        paddingInline: 12,
        borderBottom: "1px solid var(--spectrum-global-color-gray-100)",
        background:
          "linear-gradient(180deg, rgba(0, 0, 0, 0.01), rgba(0, 0, 0, 0))",
      })}
    >
      <div
        className={style({ display: "flex", gap: 12, alignItems: "center" })}
      >
        <div className="controlsGroup">
          <ActionButtonGroup aria-label="Playback controls" density="regular">
            <div className="stepAction back">
              <ActionButton
                aria-label="Step backward"
                onPress={() => setOffset((n) => Math.max(0, n - 1))}
              >
                <span className={toolbarIconStyle}>
                  <StepBackIcon />
                </span>
              </ActionButton>
            </div>

            <div className="primaryAction">
              <ActionButton
                aria-label={playing ? "Pause" : "Play"}
                onPress={() => setPlaying((p: boolean) => !p)}
              >
                <span className={toolbarIconStyle}>
                  {playing ? <PauseIcon /> : <PlayIcon />}
                </span>
              </ActionButton>
            </div>

            <div className="stepAction forward">
              <ActionButton
                aria-label="Step forward"
                onPress={() => setOffset((n) => Math.min(maxValue, n + 1))}
              >
                <span className={toolbarIconStyle}>
                  <StepForwardIcon />
                </span>
              </ActionButton>
            </div>

            <div className="refreshAction">
              <ActionButton aria-label="Refresh" onPress={onRefresh}>
                <span className={toolbarIconStyle}>
                  <RefreshIcon />
                </span>
              </ActionButton>
            </div>
          </ActionButtonGroup>
        </div>
      </div>

      <div
        className={style({
          flex: 1,
          display: "flex",
          justifyContent: "start",
          alignItems: "center",
        })}
      >
        <div className="sliderWrap">
          <Slider
            label="Event Tick"
            minValue={0}
            value={offset}
            maxValue={maxValue}
            onChange={(v) => setOffset(v)}
            formatOptions={{ maximumFractionDigits: 0 }}
          />
        </div>
      </div>
    </div>
  );
}
