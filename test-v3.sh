#!/bin/bash

# Allow Ctrl+C to stop the script
trap 'echo ""; echo "Interrupted by user"; exit 130' INT

failures=0
total=${1:-100}
timestamp=$(date +%Y%m%d_%H%M%S)
summary_file="test-summary-v3_${timestamp}.log"

echo "V3 Test Run - Started at $(date)" > "$summary_file"
echo "==========================================" >> "$summary_file"
echo "" >> "$summary_file"

for i in $(seq 1 $total); do
  echo "====================================="
  echo "Run $i/$total..."
  echo "====================================="

  start_time=$(date +%s)

  set -o pipefail
  NO_COLOR=1 timeout 120 deno task test 2>&1 | tee /tmp/test-output-$i.log
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
    cat /tmp/test-output-$i.log | sed -n '/ ERRORS/,/^FAILED/p' >> "$summary_file"
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
