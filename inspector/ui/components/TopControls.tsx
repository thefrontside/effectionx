import { ActionButton, ActionButtonGroup, Slider } from "@react-spectrum/s2";
import {
  PauseIcon,
  RefreshIcon,
  PlayIcon,
  StepBackIcon,
  StepForwardIcon,
} from "./icons";

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
    <div className="controlsBar">
      <div className="controlsLeft">
        <div className="controlsGroup">
          <ActionButtonGroup aria-label="Playback controls" density="regular">
            <div className="stepAction back">
              <ActionButton
                aria-label="Step backward"
                onPress={() => setOffset((n) => Math.max(0, n - 1))}
              >
                <span className="toolbarIcon">
                  <StepBackIcon />
                </span>
              </ActionButton>
            </div>

            <div className="primaryAction">
              <ActionButton
                aria-label={playing ? "Pause" : "Play"}
                onPress={() => setPlaying((p: boolean) => !p)}
              >
                <span className="toolbarIcon">
                  {playing ? <PauseIcon /> : <PlayIcon />}
                </span>
              </ActionButton>
            </div>

            <div className="stepAction forward">
              <ActionButton
                aria-label="Step forward"
                onPress={() => setOffset((n) => Math.min(maxValue, n + 1))}
              >
                <span className="toolbarIcon">
                  <StepForwardIcon />
                </span>
              </ActionButton>
            </div>

            <div className="refreshAction">
              <ActionButton aria-label="Refresh" onPress={onRefresh}>
                <span className="toolbarIcon">
                  <RefreshIcon />
                </span>
              </ActionButton>
            </div>
          </ActionButtonGroup>
        </div>
      </div>

      <div className="controlsRight">
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
