# Publish Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Push to main                            │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │     verify-posix (tests)     │
        └──────────────┬───────────────┘
                       │
        ┌──────────────────────────────┐
        │    verify-windows (tests)    │
        └──────────────┬───────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────────────────┐
        │         generate-matrix                          │
        │                                                  │
        │  For each package without a git tag:            │
        │    • Check if exists on JSR registry            │
        │    • Check if exists on NPM registry            │
        │                                                  │
        │  Outputs:                                        │
        │    • jsr_exists (true/false)                    │
        │    • jsr_matrix [{pkg1, pkg2, ...}]             │
        │    • npm_exists (true/false)                    │
        │    • npm_matrix [{pkg1, pkg3, ...}]             │
        └─────────────┬────────────────────────────────────┘
                      │
          ┌───────────┴───────────┬─────────────────┐
          │                       │                 │
          ▼                       ▼                 ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  jsr (inline)    │    │  npm (inline)    │    │  gather-tags     │
│                  │    │                  │    │                  │
│ if jsr_exists    │    │ if npm_exists    │    │ Combines unique  │
│                  │    │                  │    │ tags from both   │
│ Publishes to JSR │    │ Publishes to NPM │    │ JSR and NPM      │
│ (OIDC enabled)   │    │ (OIDC enabled)   │    │ matrices         │
│                  │    │                  │    │                  │
│ Matrix:          │    │ Matrix:          │    │ Outputs:         │
│ • pkg1 → JSR     │    │ • pkg1 → NPM     │    │ • tags_matrix    │
│ • pkg2 → JSR     │    │ • pkg3 → NPM     │    │                  │
│                  │    │                  │    │                  │
│ ✓ RERUNNABLE     │    │ ✓ RERUNNABLE     │    │                  │
└────────┬─────────┘    └────────┬─────────┘    └─────┬────────────┘
         │                       │                    │
         │                       │                    │
         └───────────┬───────────┘                    │
                     │                                │
                     ▼                                │
         ┌──────────────────────┐                     │
         │   tag (waits for     │◄────────────────────┘
         │   jsr, npm, and      │
         │   gather-tags)       │
         │                      │
         │  if tags_exist       │
         │                      │
         │  Creates git tags:   │
         │  • pkg1-v1.0.0       │
         │  • pkg2-v2.0.0       │
         │  • pkg3-v1.5.0       │
         │                      │
         │  ✓ RERUNNABLE        │
         └──────────┬───────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  publish-complete    │
         │  (always runs)       │
         │                      │
         │  Checks results:     │
         │  • jsr: success ✓    │
         │  • npm: success ✓    │
         │  • tag: success ✓    │
         │                      │
         │  Exit 0 if all OK    │
         │  Exit 1 if any fail  │
         └──────────────────────┘
```

## Key Improvements

### Before (Inefficient)

- Published ALL packages to both JSR and NPM, even if already published
- Single matrix for both registries
- Wasted CI time and resources
- Could not rerun individual registry publishes

### After (Efficient)

- **Separate registry checks**: Only publish what's actually needed
- **Both inline**: JSR and NPM are both inline jobs for consistency
- **Individual job reruns**: Can retry failed JSR or NPM jobs independently
- **OIDC-friendly**: Easy to rerun when OIDC config is missing or incorrect
- **Smart tagging**: Only tag packages that were actually published
- **Result aggregation**: Single success/fail status for entire publish process

## Example Scenarios

### Scenario 1: Package published to JSR but not NPM

```
generate-matrix outputs:
  jsr_exists: false (already on JSR)
  npm_exists: true  (needs NPM publish)

Result:
  ✗ jsr job: SKIPPED
  ✓ npm job: RUNS
  ✓ tag job: RUNS (creates tag)
```

### Scenario 2: Package published to NPM but not JSR

```
generate-matrix outputs:
  jsr_exists: true  (needs JSR publish)
  npm_exists: false (already on NPM)

Result:
  ✓ jsr job: RUNS
  ✗ npm job: SKIPPED
  ✓ tag job: RUNS (creates tag)
```

### Scenario 3: Package published to both

```
generate-matrix outputs:
  jsr_exists: false (already on JSR)
  npm_exists: false (already on NPM)

Result:
  ✗ jsr job: SKIPPED
  ✗ npm job: SKIPPED
  ✗ tag job: SKIPPED (tag already exists)
```

### Scenario 4: New package needs both

```
generate-matrix outputs:
  jsr_exists: true  (needs JSR publish)
  npm_exists: true  (needs NPM publish)

Result:
  ✓ jsr job: RUNS (parallel)
  ✓ npm job: RUNS (parallel)
  ✓ tag job: RUNS (after both complete)
```

### Scenario 5: OIDC configuration issue (rerun scenario)

```
Initial run:
  ✓ jsr job: SUCCESS (3 packages published)
  ✗ npm job: PARTIAL FAILURE (pkg1 & pkg2 succeed, pkg3 fails - OIDC not configured)
  ✗ tag job: SKIPPED (depends on both succeeding)

After configuring OIDC for pkg3:
  Click "Re-run failed jobs" in GitHub UI

Rerun:
  ✗ jsr job: SKIPPED (all packages already on JSR)
  ✓ npm job: RUNS (only pkg3 in matrix, pkg1 & pkg2 already succeeded)
  ✓ tag job: RUNS (creates tags for all 3 packages)
  ✓ publish-complete: SUCCESS
```
