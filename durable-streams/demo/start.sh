#!/usr/bin/env bash
#
# Durable Dinner — tmux demo launcher
#
# Starts a 3-pane tmux session:
#
#   ┌─────────────────────┬──────────────────┐
#   │  Observer            │                  │
#   │  (server + journal)  │  Cook (focused)  │  80%
#   ├─────────────────────┤                  │
#   │  Control (kill cmd)  │                  │  20%
#   └─────────────────────┴──────────────────┘
#
# Usage:
#   ./demo/start.sh [stream-id]   # launch with optional stream ID
#
# The cook pane (right) is focused with the command pre-typed.
# The control pane (bottom-left) has the kill command pre-typed.
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

# Pane 0 (left): Observer (server + journal tailer)
tmux new-session -d -s "$SESSION" -c "$DIR" -x 200 -y 50

# Set stream ID as a tmux environment variable
tmux set-environment -t "$SESSION" DURABLE_STREAM_ID "$STREAM_ID"

# Split vertically — right side gets 50% width (cook, full height)
tmux split-window -h -t "$SESSION" -c "$DIR" -p 50

# Split the left pane horizontally — bottom 20% becomes control
tmux split-window -v -t "${SESSION}:0.0" -c "$DIR" -p 20

# After all splits, pane indices are:
#   0 = top-left     (Observer)
#   1 = bottom-left  (Control)
#   2 = right        (Cook)

# ------------------------------------------------------------------
# Start processes
# ------------------------------------------------------------------

# Pane 0: Start the observer (server + tailer)
tmux send-keys -t "${SESSION}:0.0" "$NODE demo/observe.ts" Enter

# Give the server a moment to bind its port
sleep 2

# Pane 2: Pre-type the cook command (presenter hits Enter when ready)
tmux send-keys -t "${SESSION}:0.2" "$NODE demo/cook.ts"

# Pane 1: Pre-type a pane-scoped kill command for the cook pane process group
tmux send-keys -t "${SESSION}:0.1" "bash -lc 'PGID=\$(ps -o pgid= -p \$(tmux display-message -p -t \"${SESSION}:0.2\" \"#{pane_pid}\") | tr -d \" \" ); kill -9 -\$PGID'"

# ------------------------------------------------------------------
# Focus & attach
# ------------------------------------------------------------------

# Focus the cook pane (right)
tmux select-pane -t "${SESSION}:0.2"

# Attach (or switch if already inside tmux)
if [ -n "${TMUX:-}" ]; then
  tmux switch-client -t "$SESSION"
else
  tmux attach-session -t "$SESSION"
fi
