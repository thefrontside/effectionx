#!/bin/bash

# Allow Ctrl+C to stop the script
trap 'echo ""; echo "Interrupted by user"; exit 130' INT

# Usage: ./test-v3-node.sh [test-pattern] [iterations]
# Examples:
#   ./test-v3-node.sh                          # Run all tests once
#   ./test-v3-node.sh 'watch/**/*.test.ts'     # Run watch tests once
#   ./test-v3-node.sh 'watch/**/*.test.ts' 10  # Run watch tests 10 times
#   ./test-v3-node.sh '' 50                    # Run all tests 50 times

test_pattern=${1:-./**/*.test.ts}
total=${2:-1}
failures=0
timestamp=$(date +%Y%m%d_%H%M%S)
summary_file="test-summary-v3_${timestamp}.log"

echo "V3 Node Test Run - Started at $(date)" > "$summary_file"
echo "Test pattern: $test_pattern" >> "$summary_file"
echo "Iterations: $total" >> "$summary_file"
echo "==========================================" >> "$summary_file"
echo "" >> "$summary_file"

# Ensure we're on v3
echo "Setting up effection v3..."
cp package.v3.json package.json
rm -rf node_modules
deno install
echo ""

echo "Running: $test_pattern ($total iterations)"
echo ""

for i in $(seq 1 $total); do
  echo "====================================="
  echo "Run $i/$total..."
  echo "====================================="

  start_time=$(date +%s)

  set -o pipefail
  FORCE_COLOR=1 timeout 120 node --experimental-strip-types --test "$test_pattern" 2>&1 | tee /tmp/test-output-$i.log
  exit_code=$?
  set +o pipefail

  end_time=$(date +%s)
  duration=$((end_time - start_time))

  echo "DEBUG: Exit code = $exit_code, Duration = ${duration}s"

  if [ $exit_code -eq 0 ]; then
    echo "✓ PASSED (${duration}s)"
    echo "Run $i: PASSED (${duration}s)" >> "$summary_file"
  else
    ((failures++))
    echo "✗ FAILED (${duration}s)"
    echo "Run $i: FAILED (${duration}s)" >> "$summary_file"
    cat /tmp/test-output-$i.log >> "$summary_file"
    echo "" >> "$summary_file"
  fi
  rm -f /tmp/test-output-$i.log
done

echo "==========================================" >> "$summary_file"
echo "V3 Tests - Total failures: $failures/$total" >> "$summary_file"
echo "Completed at $(date)" >> "$summary_file"

cat "$summary_file"
echo ""
echo "Summary saved to: $summary_file"

# Exit 0 so Dagger exports the results even when tests fail
exit 0
