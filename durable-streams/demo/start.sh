#!/usr/bin/env bash
#
# Durable Dinner — tmux demo launcher
#
# Starts a 3-pane tmux session:
#
#   ┌────────────────────────────────────┐
#   │  Observer (server + journal tail)  │  40%
#   │  (demo:observe)                    │
#   ├───────────────────┬────────────────┤
#   │  Cook (focused)   │  Control       │  60%
#   │  (demo:cook)      │  (kill cmd)    │
#   └───────────────────┴────────────────┘
#
# Usage:
#   ./demo/start.sh [stream-id]   # launch with optional stream ID
#
# The cook pane (bottom-left) is focused with the command pre-typed.
# The control pane (bottom-right) has the kill command pre-typed.
# Press Enter in each when ready.

set -euo pipefail

SESSION="durable-dinner"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
STREAM_ID="${1:-dinner-demo}"
NODE="node --experimental-strip-types"

# Export so all panes inherit it
export DURABLE_STREAM_ID="$STREAM_ID"

# ------------------------------------------------------------------
# Preflight
# ------------------------------------------------------------------

if ! command -v tmux &>/dev/null; then
  echo "Error: tmux is not installed. Install it with: brew install tmux" >&2
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "Error: node is not installed. See https://nodejs.org" >&2
  exit 1
fi

# Kill any leftover session (idempotent)
tmux kill-session -t "$SESSION" 2>/dev/null || true

# ------------------------------------------------------------------
# Build the layout
# ------------------------------------------------------------------

# Pane 0 (top): Observer (server + journal tailer)
tmux new-session -d -s "$SESSION" -c "$DIR" -x 200 -y 50

# Set stream ID as a tmux environment variable
tmux set-environment -t "$SESSION" DURABLE_STREAM_ID "$STREAM_ID"

# Split horizontally — bottom gets 60% (cook + control), top gets 40% (observer)
tmux split-window -v -t "$SESSION" -c "$DIR" -p 60

# Split the bottom pane vertically — right side becomes control
tmux split-window -h -t "${SESSION}:0.1" -c "$DIR" -p 40

# After all splits, pane indices are:
#   0 = top          (Observer)
#   1 = bottom-left  (Cook)
#   2 = bottom-right (Control)

# ------------------------------------------------------------------
# Start processes
# ------------------------------------------------------------------

# Pane 0: Start the observer (server + tailer)
tmux send-keys -t "${SESSION}:0.0" "$NODE demo/observe.ts" Enter

# Give the server a moment to bind its port
sleep 2

# Pane 1: Pre-type the cook command (presenter hits Enter when ready)
tmux send-keys -t "${SESSION}:0.1" "$NODE demo/cook.ts"

# Pane 2: Pre-type a pane-scoped kill command for the cook pane process group
tmux send-keys -t "${SESSION}:0.2" "bash -lc 'PGID=\$(ps -o pgid= -p \$(tmux display-message -p -t \"${SESSION}:0.1\" \"#{pane_pid}\") | tr -d \" \" ); kill -9 -\$PGID'"

# ------------------------------------------------------------------
# Focus & attach
# ------------------------------------------------------------------

# Focus the cook pane (bottom-left)
tmux select-pane -t "${SESSION}:0.1"

# Attach (or switch if already inside tmux)
if [ -n "${TMUX:-}" ]; then
  tmux switch-client -t "$SESSION"
else
  tmux attach-session -t "$SESSION"
fi
