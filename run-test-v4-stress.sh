#!/bin/bash
set -e

# Accept rounds parameter, default to 100
ROUNDS=${1:-100}

# Start stress-ng in background
stress-ng --all 2 >/dev/null 2>&1 &
STRESS_PID=$!

# Give it time to start
sleep 2

# Run tests with rounds parameter
# First arg is test pattern (empty = all tests), second arg is iterations
bash test-v4-node.sh '' "$ROUNDS"

# Kill stress-ng when done
kill $STRESS_PID 2>/dev/null || true
