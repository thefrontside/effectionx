# V3 Test Results (with stress-ng --all 2)

## Summary
- **27/100 runs failed** (73% success rate)
- **1 resource leak detected** (Run 71)
- **26 timing failures** (expected under CPU stress)

## Failures

| Test | Count | Type | Issue |
|------|-------|------|-------|
| watch | 17 | Timing | Process startup timeout |
| parallel() | 4 | Timing | Race condition in async order |
| batch | 2 | Timing | Exceeded 50% threshold (78.9ms vs 50ms) |
| **watch** | **1** | **LEAK** | **Chokidar resources not cleaned up** |

## Resource Leak (Run 71) ⚠️

**Location**: `watch/watch.ts:156` - `yield* until(watcher.close())`

**Leaked resources**:
1. Timer from `FSWatcher._throttle` (chokidar)
2. Async directory read from `ReaddirpStream._exploreDir` (readdirp)

**Root cause**: Chokidar cleanup doesn't complete before test exits under CPU stress

## Next Steps

1. Fix chokidar cleanup race condition in `watch/watch.ts`
2. Explicitly clear timers before `watcher.close()`
3. Run watch tests in isolation under stress to reproduce consistently
