# @effectionx/k6

Effection integration for [K6](https://k6.io/) load testing - bringing structured concurrency to K6 scripts.

## Why?

K6 has several well-documented async/concurrency pain points:

| Problem | K6 Issue | How Effection Solves It |
|---------|----------|------------------------|
| `group()` loses context across async boundaries | [#2848](https://github.com/grafana/k6/issues/2848), [#5435](https://github.com/grafana/k6/issues/5435) | `createContext()` + scope-local propagation |
| WebSocket handlers lose async results | [#5524](https://github.com/grafana/k6/issues/5524) | `each()` + operation-based event handling |
| Unhandled promise rejections don't fail tests | [#5249](https://github.com/grafana/k6/issues/5249) | Error propagation through `yield*` chain |
| No structured cleanup/teardown | - | Effection's scope-based cleanup with LIFO ordering |

## Installation

```bash
pnpm add @effectionx/k6
```

## Runtime Conformance

Before using Effection in K6, you should validate that K6's Sobek runtime supports all required JavaScript features. This package includes a conformance test suite.

### Run Conformance Tests

Using Docker (recommended):

```bash
cd k6
docker compose run --rm k6-conformance
```

Or locally (requires K6 installed):

```bash
pnpm run build:bundle
k6 run dist/conformance-bundle.js
```

### What's Tested

The conformance suite validates:

1. **Symbol Support** - `Symbol.iterator`, `Symbol.toStringTag`
2. **Generator Functions** - `function*`, `yield`, `return()`, `throw()`
3. **yield* Delegation** - Custom iterables, return value propagation
4. **yield* throw() Forwarding** - Error propagation through delegation
5. **yield* return() Forwarding** - Cancellation semantics, finally blocks
6. **Promise Support** - Promise constructor, async/await, Promise.all/race
7. **Timer Support** - setTimeout, clearTimeout (required for `sleep()`)
8. **AbortController** - Optional, for `useAbortSignal()` integration

### Critical vs Optional Tests

- **Critical** (tests 1-5): Effection cannot work without these
- **Important** (tests 6-7): Core functionality needs these
- **Optional** (test 8): Some features won't be available

## Usage

```typescript
import { main, group, currentGroupString, http } from '@effectionx/k6';

export default main(function*() {
  // Async-aware group that preserves context
  yield* group("api-tests", function*() {
    const response = yield* http.get("https://api.example.com/users");
    
    // Context is preserved across async boundaries!
    console.log(`Current group: ${yield* currentGroupString()}`); // "api-tests"
    
    yield* group("nested", function*() {
      console.log(`Current group: ${yield* currentGroupString()}`); // "api-tests/nested"
    });
  });
});
```

## Demos

This package includes demo scripts showing how Effection solves each K6 problem:

| Demo | Problem Solved | Run |
|------|----------------|-----|
| 01-group-context | Group context loss (K6 #2848, #5435) | `k6 run dist/demos/01-group-context.js` |
| 02-websocket | Fire-and-forget handlers (K6 #5524) | `k6 run dist/demos/02-websocket.js` |
| 03-error-propagation | Swallowed promise rejections (K6 #5249) | `k6 run dist/demos/03-error-propagation.js` |
| 04-cleanup | No structured cleanup | `k6 run dist/demos/04-cleanup.js` |

### Running Demos

First, build the library:

```bash
cd k6
pnpm install
node build.js
```

Then run with the custom K6 binary (with Sobek fix):

```bash
# Use the custom K6 binary with yield-in-finally fix
/tmp/k6-custom/k6-effection run dist/demos/01-group-context.js
```

Or via Docker (which includes the fix):

```bash
docker compose run --rm dev k6 run /scripts/dist/demos/01-group-context.js
```

## API Reference

### Core

- **`main(op)`** - Wrap an Effection operation as a K6 VU iteration function
- **`group(name, op)`** - Execute operation within a named group with proper context scoping
- **`currentGroupPath()`** - Get current group path as array (e.g., `["api", "users"]`)
- **`currentGroupString()`** - Get current group path as string (e.g., `"api/users"`)

### HTTP

- **`http.get(url, params?)`** - HTTP GET as an Effection operation
- **`http.post(url, body?, params?)`** - HTTP POST as an Effection operation
- **`http.put/patch/del/head/options`** - Other HTTP methods

All HTTP operations automatically tag requests with the current group for proper metrics attribution.

### WebSocket

- **`useWebSocket(url, protocols?)`** - Create a WebSocket resource with structured cleanup
- **`collectMessages(ws, count)`** - Collect N messages from a WebSocket
- **`waitForMessage(ws, predicate)`** - Wait for a message matching a predicate

```typescript
const ws = yield* useWebSocket('wss://api.example.com/ws');
ws.send('hello');

// Process messages as a stream
for (const msg of yield* each(ws.messages)) {
  console.log(msg);
  yield* each.next();
}
// WebSocket automatically closed when scope ends
```

## Development

### Building

```bash
pnpm install
pnpm run build:bundle
```

### Testing in Docker

```bash
docker compose run --rm k6-conformance
```

### Project Structure

```
k6/
├── conformance/           # Runtime conformance tests
│   ├── 01-symbols.ts      # Symbol support
│   ├── 02-generators.ts   # Basic generator support
│   ├── 03-yield-delegation.ts  # yield* with custom iterables
│   ├── 04-yield-throw.ts  # Error propagation
│   ├── 05-yield-return.ts # Cancellation semantics (critical!)
│   ├── 06-promises.ts     # Promise support
│   ├── 07-timers.ts       # setTimeout/clearTimeout
│   ├── 08-abort-controller.ts # AbortController (optional)
│   ├── k6-runner.ts       # K6 test script
│   └── mod.ts             # Test runner module
├── lib/                   # Core library
│   ├── run.ts             # VU iteration wrapper
│   ├── group.ts           # Async-aware group context
│   ├── http.ts            # HTTP wrappers
│   ├── websocket.ts       # WebSocket resource
│   └── mod.ts             # Library exports
├── demos/                 # Demo scripts
│   ├── 01-group-context.ts
│   ├── 02-websocket.ts
│   ├── 03-error-propagation.ts
│   └── 04-cleanup.ts
├── dist/                  # Built bundles
│   ├── lib.js             # Library bundle (includes Effection)
│   ├── conformance-bundle.js
│   └── demos/             # Built demo scripts
├── build.js               # esbuild configuration
├── docker-compose.yml     # Docker test setup
├── Dockerfile             # K6 test image (with Sobek fix)
├── mod.ts                 # Package entry point
├── package.json
└── tsconfig.json
```

## Current Status

### Runtime Blocker: Sobek yield-in-finally Bug

The conformance tests revealed a **critical bug** in K6's Sobek JavaScript runtime that prevents Effection from working properly:

**Issue**: [grafana/sobek#114](https://github.com/grafana/sobek/issues/114)  
**Fix PR**: [grafana/sobek#115](https://github.com/grafana/sobek/pull/115)

When `generator.return()` is called (which Effection uses for task cancellation/cleanup), Sobek skips any `yield` statements inside `finally` blocks. This violates ECMAScript specification and breaks Effection's cleanup semantics.

```javascript
// This works in V8/Node.js but fails in Sobek
function* withCleanup() {
  try {
    yield 'working';
  } finally {
    yield 'cleanup';  // Sobek skips this!
  }
}

const gen = withCleanup();
gen.next();        // {value: 'working', done: false}
gen.return('X');   // Should be {value: 'cleanup', done: false}
                   // Sobek returns {value: 'X', done: true} - WRONG
```

**Impact**: Effection tasks cannot perform async cleanup operations. Any `yield*` in a `finally` block (like `yield* sleep(5)` for graceful shutdown) will be skipped.

**Status**: A fix has been submitted to Sobek. Once merged and released in a new K6 version, Effection will work correctly in K6.

### Conformance Test Results

**With stock K6 v0.55.0:**

| Test | Status | Notes |
|------|--------|-------|
| 01-symbols | ✅ PASS | |
| 02-generators | ✅ PASS | |
| 03-yield-delegation | ✅ PASS | |
| 04-yield-throw | ✅ PASS | |
| 05-yield-return | ❌ FAIL | **Blocker** - yield in finally skipped |
| 06-promises | ✅ PASS | |
| 07-timers | ✅ PASS | |
| 08-abort-controller | ❌ FAIL | Expected - AbortController not available |

**With custom K6 (Sobek fix applied):**

| Test | Status | Notes |
|------|--------|-------|
| 01-symbols | ✅ PASS | |
| 02-generators | ✅ PASS | |
| 03-yield-delegation | ✅ PASS | |
| 04-yield-throw | ✅ PASS | |
| 05-yield-return | ✅ PASS | **Fixed!** |
| 06-promises | ✅ PASS | |
| 07-timers | ✅ PASS | |
| 08-abort-controller | ❌ FAIL | Expected - AbortController not available |

A custom K6 binary with the Sobek fix is available at `/tmp/k6-custom/k6-effection` (built from the PR branch).

## Background

This package was developed to demonstrate how Effection's structured concurrency model can solve K6's async/concurrency challenges. The approach was validated through:

1. Research of K6's GitHub issues and source code
2. Consultation with Effection and TypeScript specialists  
3. Runtime conformance testing against K6's Sobek JavaScript engine
4. Root cause analysis and fix contribution to Sobek

## License

MIT
