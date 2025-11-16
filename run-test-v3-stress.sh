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
bash test-v3.sh "$ROUNDS"

# Kill stress-ng when done
kill $STRESS_PID 2>/dev/null || true
