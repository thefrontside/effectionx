# Effection Compatibility Improvements Plan

This plan adds TAP reporter parsing for compatibility runs only, so failed tests and stack traces can be summarized without changing normal `pnpm test` output.

## Why This Change

- Compat runs don't currently make it clear which tests actually ran or which ones failed, so results are hard to trust.
- The TAP reporter provides structured output with YAML metadata blocks that let us list exactly which tests executed and which failed.
- Keeping the TAP reporter scoped to compat runs preserves the standard developer experience for `pnpm test`.
- The version-group workflow already serializes installs, so capturing TAP output per group does not add meaningful overhead.

## Goals

- Use TAP reporter **only** during compat runs.
- Parse all failures per version group in real-time.
- Include full error message + stack traces in the summary.
- Keep the existing version-group workflow and override-based swapping.

## Implementation (Completed)

### 1) TAP Parser Module (`.internal/tap-parser.ts`)

Created a streaming TAP parser that:
- Processes TAP output line-by-line as a stream
- Detects test status lines (`ok N - name` / `not ok N - name`)
- Extracts YAML metadata blocks between `---` and `...` markers
- Parses YAML using the `yaml` package to extract error details, stack traces
- Emits `TapTestResult` objects with structured metadata

### 2) Lines Helper Moved to stream-helpers

- Moved `lines()` helper from `@effectionx/process` to `@effectionx/stream-helpers`
- Fixed FIFO ordering bug (was using `pop()` instead of `shift()`)
- Properly exported for use by other packages

### 3) Updated Compat Runner (`.internal/effection-compat.ts`)

- Uses `--test-reporter=tap` in NODE_OPTIONS for test execution
- Uses `--log-order=grouped` with Turbo to keep per-package output together
- Streams stdout through `lines()` -> `parseTapResults()` for real-time parsing
- Prints failures in real-time (only failures, not passes)
- Collects results per version group
- Prints summary table after all groups complete
- Prints detailed failure information with location, error, and stack traces
- Sets `process.exitCode = 1` if any failures

### 4) Summary Output Format

```
======================================================================
Compatibility Test Summary
======================================================================

Version        Packages  Passed    Failed    Status
-------------------------------------------------------
3.0.0          15        42        0         PASS
4.0.0-beta     15        40        2         FAIL

======================================================================
Failures (2)
======================================================================

[Effection 4.0.0-beta] process > exec > should handle signals
  Location: process/test/exec.test.ts:45:3
  Error: Expected signal to be received
  Stack:
    TestContext.<anonymous> (file:///...)
    ...
```

## Notes

- Node.js does NOT have a built-in `json` reporter - TAP was chosen as the best alternative
- TAP YAML metadata blocks contain all the structured data needed (error, stack, location, etc.)
- The `yaml` package is used to parse YAML blocks within TAP output
- Real-time failure output shows failures as they happen during test execution
