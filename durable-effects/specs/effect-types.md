# Effect Type Implementation Specifications

**Status:** Ready for implementation
**Audience:** Implementing agent
**Inputs:** `@effectionx/durable-streams` (protocol-specification, effection-integration, DECISIONS), `operations.ts`, `runtime.ts`, `hash.ts`, `guards.ts`

---

## 0. Preamble

Read these files before implementing:

1. `@effectionx/durable-streams` types.ts — `DurableEffect<T>`, `Workflow<T>`, `EffectDescription`, `Result`, `Json`
2. `@effectionx/durable-streams` effect.ts — `createDurableEffect()` and `createDurableOperation()` factories
3. `operations.ts` — existing effects: `durableCall`, `durableSleep`, `durableAction`, `versionCheck`
4. `mod.ts` — public API barrel
5. `@effectionx/durable-streams` durable-run.test.ts — test patterns

### Factory: all new effects use `createDurableOperation`

All six new effects use the Operation-based factory. Inside `createDurableOperation`, the operation runs in `scope.run()` which inherits Effection context — `useScope()` and `scope.expect()` work naturally for reading the `DurableRuntime`.

```typescript
function* durableXxx(name: string, ...params): Workflow<XxxResult> {
  return (yield createDurableOperation<XxxResult>(
    { type: "xxx", name, /* extra description fields */ },
    function* () {
      const scope = yield* useScope();
      const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);
      // ... yield* runtime methods (they return Operation<T>) ...
      return result;
    },
  )) as XxxResult;
}
```

### Key constraints

- `T extends Json` — all return values must be JSON-serializable (DEC-018).
- The operation runs **only during live execution**. During replay, the stored result is returned directly.
- Extra fields on `EffectDescription` beyond `type` and `name` are stored verbatim but **never compared** during divergence detection.
- Results should include validation metadata (e.g., content hashes) for replay guard use.

---

## 0.1 Runtime abstraction: `DurableRuntime`

Effects must not depend on Deno-specific or Node-specific APIs. A `DurableRuntime` interface provides all platform operations. **Every method returns `Operation<T>`, not `Promise<T>`.** Cancellation flows through Effection's structured concurrency — when a scope tears down, the operation is cancelled. No `AbortSignal` in the interface.

```typescript
// runtime.ts (re-exported from @effectionx/durable-streams)

interface DurableRuntime {
  /** Execute a subprocess. Cancellation kills the process. */
  exec(options: {
    command: string[];
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  }): Operation<{ exitCode: number; stdout: string; stderr: string }>;

  /** Read a text file. */
  readTextFile(path: string): Operation<string>;

  /** Expand glob patterns. Returns relative paths with isFile flag. */
  glob(options: {
    patterns: string[];
    root: string;
    exclude?: string[];
  }): Operation<Array<{ path: string; isFile: boolean }>>;

  /** Make an HTTP request. Cancellation aborts the request. */
  fetch(input: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  }): Operation<{
    status: number;
    headers: Headers;
    text(): Operation<string>;
  }>;

  /** Read an environment variable. Returns undefined if not set. */
  env(name: string): string | undefined;

  /** Return platform information. */
  platform(): { os: string; arch: string };
}

const DurableRuntimeCtx = createContext<DurableRuntime>("@durable/runtime");
```

**Design notes on the interface:**

- `exec()` returns `Operation`. The implementation handles timeouts and process cleanup internally. When the operation is cancelled (scope torn down), the implementation kills the subprocess. No `AbortSignal` crosses the interface boundary.
- `fetch()` returns an Operation-native response object. `response.text()` is also `Operation<string>`, not `Promise<string>`. The implementation wraps `globalThis.fetch` with `action()` or `call()` and handles abort internally.
- `env()` and `platform()` are synchronous — no Operation wrapper needed since they don't do I/O.
- `readTextFile()` and `glob()` return Operations. Cancellation during a long glob scan terminates the iteration.

**Installation** — set via `durableRun` options:

```typescript
interface DurableRunOptions {
  stream: DurableStream;
  coroutineId?: string;
  runtime?: DurableRuntime;  // defaults to nodeRuntime()
}
```

**Node.js implementation** (`node-runtime.ts`) — the only file that imports Node-specific APIs. Uses `@effectionx/tinyexec` for subprocess execution, `node:fs/promises` for file I/O, and `node:os` for platform info. See `node-runtime.ts` for the full implementation.

> **Note:** The original project used a Deno-specific `denoRuntime()` implementation.
> In effectionx, `nodeRuntime()` serves the same role using Node.js APIs.

**Test stub** — rejects on any I/O call, override per-test:

```typescript
// stub-runtime.ts
function stubRuntime(overrides?: Partial<DurableRuntime>): DurableRuntime {
  return {
    *exec() { throw new Error("exec not stubbed"); },
    *readTextFile() { throw new Error("readTextFile not stubbed"); },
    *glob() { throw new Error("glob not stubbed"); },
    *fetch() { throw new Error("fetch not stubbed"); },
    env: () => undefined,
    platform: () => ({ os: "test", arch: "test" }),
    ...overrides,
  };
}
```

---

## 0.2 Shared utility: `computeSHA256`

```typescript
// hash.ts — returns Operation<string>, not Promise
import { call } from "effection";

export function* computeSHA256(content: string): Operation<string> {
  const hashBuffer = yield* call(() =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(content))
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return `sha256:${hashArray.map(b => b.toString(16).padStart(2, "0")).join("")}`;
}
```

Uses the Web Crypto API (`crypto.subtle`), available in Node 22+, Deno, and browsers.

---

## 0.3 Test patterns

Every effect needs:

1. **Golden run** — execute live, verify result and journal shape
2. **Full replay** — all events + Close in stream, verify no live execution
3. **Partial replay** — Yield events only (no Close), verify replay then live
4. **Divergence** — wrong description in journal, verify `DivergenceError`
5. **Error propagation** — operation throws, verify `Close(err)` in journal

Use the Node.js test runner (`node --test`). Use `stubRuntime()` to prove non-execution during replay. Inject runtime via `DurableRunOptions.runtime`.

## 0.4 File locations

- `runtime.ts` — re-exports `DurableRuntime` interface and `DurableRuntimeCtx` from `@effectionx/durable-streams`
- `node-runtime.ts` — `nodeRuntime()` (Node.js-specific implementation)
- `stub-runtime.ts` — `stubRuntime()` test helper
- `hash.ts` — `computeSHA256()`
- `operations.ts` — all effect implementations
- `guards.ts` — all replay guard implementations
- `canonical-json.ts` — deterministic JSON serialization utility
- `*.test.ts` — test files at package root (e.g., `operations.test.ts`, `guards.test.ts`, `hash.test.ts`, `node-runtime.test.ts`)
- `mod.ts` — public API barrel exports

---

## Effect 1: `durableExec` — subprocess execution

### Use case

Execute a shell command. Never re-executed on replay — logs are authoritative.

### Signature

```typescript
interface ExecOptions {
  command: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;       // ms, default 300_000
  throwOnError?: boolean; // default true
}

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function* durableExec(name: string, options: ExecOptions): Workflow<ExecResult>
```

### Description / Result shapes

```json
{ "type": "exec", "name": "compile", "command": ["tsc", "--noEmit"],
  "cwd": "/workspace", "env": { "NODE_ENV": "production" }, "timeout": 300000 }

{ "status": "ok", "value": { "exitCode": 0, "stdout": "...", "stderr": "" } }
```

### Implementation

```typescript
function* durableExec(name: string, options: ExecOptions): Workflow<ExecResult> {
  const { command, cwd, env, timeout = 300_000, throwOnError = true } = options;

  return (yield createDurableOperation<ExecResult>(
    {
      type: "exec", name,
      command: command as Json,
      ...(cwd ? { cwd } : {}),
      ...(env ? { env: env as Json } : {}),
      timeout,
    },
    function* () {
      const scope = yield* useScope();
      const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);

      const output = yield* runtime.exec({ command, cwd, env, timeout });

      if (throwOnError && output.exitCode !== 0) {
        throw new Error(
          `Command failed with exit code ${output.exitCode}: ${command.join(" ")}\n${output.stderr}`
        );
      }
      return output as ExecResult;
    },
  )) as ExecResult;
}
```

Timeout and process cleanup are the runtime's responsibility. When `createDurableOperation`'s scope tears down (cancellation), `runtime.exec()` is cancelled, which triggers the runtime's `finally` block to kill the process.

### Tests

1. **Golden run** — verify exitCode/stdout/stderr in result and journal.
2. **Full replay** — verify `runtime.exec` not called.
3. **Partial replay** — replayed exec, subsequent effect live.
4. **Non-zero exit with throwOnError** — verify error in journal.
5. **Non-zero exit without throwOnError** — `status: "ok"` with non-zero exitCode.
6. **Env and cwd in description** — verify metadata in journal.
7. **Timeout** — runtime exceeds timeout, verify error.
8. **Cancellation** — cancel scope, verify exec operation cancelled.
9. **Divergence** — mismatched type/name.

---

## Effect 2: `durableReadFile` — file read with content hash

### Use case

Read a file. Path in description, content + SHA-256 hash in result. Designed for replay guard integration.

### Signature

```typescript
interface ReadFileResult {
  content: string;
  contentHash: string;
}

function* durableReadFile(
  name: string, path: string, options?: { encoding?: string }
): Workflow<ReadFileResult>
```

### Description / Result shapes

```json
{ "type": "read_file", "name": "load-config", "path": "./config.yaml", "encoding": "utf-8" }

{ "status": "ok", "value": { "content": "...", "contentHash": "sha256:abc..." } }
```

### Implementation

```typescript
function* durableReadFile(
  name: string, path: string, options?: { encoding?: string }
): Workflow<ReadFileResult> {
  const encoding = options?.encoding ?? "utf-8";

  return (yield createDurableOperation<ReadFileResult>(
    { type: "read_file", name, path, encoding },
    function* () {
      const scope = yield* useScope();
      const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);

      const content = yield* runtime.readTextFile(path);
      const contentHash = yield* computeSHA256(content);
      return { content, contentHash } as ReadFileResult;
    },
  )) as ReadFileResult;
}
```

### Tests

1. **Golden run** — verify content and contentHash.
2. **Full replay** — verify `runtime.readTextFile` not called.
3. **Partial replay** — replayed read, subsequent effect live.
4. **Path and encoding in description** — verify in journal.
5. **ContentHash in result** — verify deterministic.
6. **File not found** — verify error propagation.
7. **Empty file** — `content === ""` with valid hash.
8. **Replay guard integration** — mutate file, verify `StaleInputError`.
9. **Divergence** — mismatched type/name.

---

## Effect 3: `durableGlob` — directory glob with scan hash

### Use case

Discover files matching patterns. Sorted matches with per-file hashes. Composite `scanHash` for replay guard staleness detection.

### Signature

```typescript
interface GlobOptions {
  baseDir: string;
  include: string[];
  exclude?: string[];
}
interface GlobMatch { path: string; contentHash: string; }
interface GlobResult {
  matches: GlobMatch[];
  scanHash: string;
}

function* durableGlob(name: string, options: GlobOptions): Workflow<GlobResult>
```

### Description / Result shapes

```json
{ "type": "glob", "name": "sources", "baseDir": "src/",
  "include": ["**/*.ts"], "exclude": ["**/*_test.ts"] }

{ "status": "ok", "value": {
    "matches": [{ "path": "main.ts", "contentHash": "sha256:..." }],
    "scanHash": "sha256:..." } }
```

### Implementation

```typescript
function* durableGlob(name: string, options: GlobOptions): Workflow<GlobResult> {
  const { baseDir, include, exclude = [] } = options;

  return (yield createDurableOperation<GlobResult>(
    { type: "glob", name, baseDir, include: include as Json, exclude: exclude as Json },
    function* () {
      const scope = yield* useScope();
      const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);

      const entries = yield* runtime.glob({ patterns: include, root: baseDir, exclude });

      const matches: GlobMatch[] = [];
      for (const entry of entries) {
        if (!entry.isFile) continue;
        const content = yield* runtime.readTextFile(`${baseDir}/${entry.path}`);
        const contentHash = yield* computeSHA256(content);
        matches.push({ path: entry.path, contentHash });
      }

      matches.sort((a, b) => a.path.localeCompare(b.path));
      const seen = new Set<string>();
      const deduped = matches.filter(m => {
        if (seen.has(m.path)) return false;
        seen.add(m.path); return true;
      });

      const scanHash = yield* computeSHA256(JSON.stringify(deduped));
      return { matches: deduped, scanHash } as GlobResult;
    },
  )) as GlobResult;
}
```

### Tests

1. **Golden run** — verify sorted matches and scanHash.
2. **Full replay** — verify no filesystem access.
3. **Deterministic ordering** — sorted regardless of enumeration order.
4. **Exclude patterns** — excluded files absent.
5. **Empty result** — no matches, valid scanHash.
6. **Deduplication** — overlapping patterns, each path once.
7. **Per-file hashes correct** — independently computed hashes match.
8. **ScanHash changes** — add/remove file, scanHash differs.
9. **Replay guard integration** — mutate tree, verify `StaleInputError`.
10. **Divergence** — mismatched type/name.

---

## Effect 4: `durableFetch` — HTTP request

### Use case

HTTP request. URL, method, headers in description. Status, filtered headers, body, bodyHash in result. HTTP error status codes (404, 500) are successful effect results — only network failures are effect errors.

### Signature

```typescript
interface FetchOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}
interface FetchResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  bodyHash: string;
}

function* durableFetch(name: string, options: FetchOptions): Workflow<FetchResult>
```

### Description / Result shapes

```json
{ "type": "fetch", "name": "call-llm", "url": "https://api.example.com",
  "method": "POST", "headers": { "content-type": "application/json" } }

{ "status": "ok", "value": { "status": 200, "headers": { "content-type": "..." },
    "body": "...", "bodyHash": "sha256:..." } }
```

Request body is **not** in the description.

### Implementation

```typescript
function* durableFetch(name: string, options: FetchOptions): Workflow<FetchResult> {
  const { url, method = "GET", headers = {}, body, timeout = 30_000 } = options;

  return (yield createDurableOperation<FetchResult>(
    { type: "fetch", name, url, method, headers: headers as Json },
    function* () {
      const scope = yield* useScope();
      const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);

      const response = yield* runtime.fetch(url, { method, headers, body, timeout });
      const responseBody = yield* response.text();
      const bodyHash = yield* computeSHA256(responseBody);

      const responseHeaders: Record<string, string> = {};
      for (const key of ["content-type", "etag", "last-modified", "cache-control"]) {
        const val = response.headers.get(key);
        if (val) responseHeaders[key] = val;
      }

      return {
        status: response.status, headers: responseHeaders,
        body: responseBody, bodyHash,
      } as FetchResult;
    },
  )) as FetchResult;
}
```

Timeout and abort are the runtime's responsibility. The effect code is just orchestration.

### Tests

1. **Golden run** — verify status/body/headers/bodyHash.
2. **Full replay** — verify `runtime.fetch` not called.
3. **Partial replay** — replayed fetch, subsequent effect live.
4. **Non-200 as successful result** — 404 recorded as `status: "ok"`.
5. **Network failure** — `runtime.fetch` throws, verify `Close(err)`.
6. **Timeout** — slow response, verify error from runtime.
7. **Filtered headers** — selected captured, ephemeral omitted.
8. **Body hash in result** — verify correct.
9. **Request body not in description** — POST with body, no `body` field in description.
10. **Divergence** — mismatched type/name.

---

## Effect 5: `durableEval` — in-process code evaluation

### Use case

Evaluate code via a caller-provided evaluator. Source hash and bindings hash in the result for replay guard freshness detection.

### Signature

```typescript
interface EvalOptions {
  source: string;
  language?: string;
  bindings?: Record<string, Json>;
}
interface EvalResult {
  value: Json;
  sourceHash: string;
  bindingsHash: string;
}

function* durableEval(
  name: string,
  evaluator: (source: string, bindings: Record<string, Json>) => Operation<Json>,
  options: EvalOptions,
): Workflow<EvalResult>
```

The evaluator returns `Operation<Json>`, not `Promise<Json>`. This keeps everything in Effection land. Callers wrapping a Promise-based evaluator use `call()` at the call site.

### Description / Result shapes

```json
{ "type": "eval", "name": "analysis-cell", "language": "javascript" }

{ "status": "ok", "value": { "value": { "count": 42 },
    "sourceHash": "sha256:...", "bindingsHash": "sha256:..." } }
```

### Implementation

```typescript
function* durableEval(
  name: string,
  evaluator: (source: string, bindings: Record<string, Json>) => Operation<Json>,
  options: EvalOptions,
): Workflow<EvalResult> {
  const { source, language, bindings = {} } = options;

  return (yield createDurableOperation<EvalResult>(
    { type: "eval", name, ...(language ? { language } : {}) },
    function* () {
      const sourceHash = yield* computeSHA256(source);
      const bindingsHash = yield* computeSHA256(JSON.stringify(bindings));
      const value = yield* evaluator(source, bindings);
      return { value, sourceHash, bindingsHash } as EvalResult;
    },
  )) as EvalResult;
}
```

No runtime access needed — the evaluator is caller-provided.

### Tests

1. **Golden run** — verify value/sourceHash/bindingsHash.
2. **Full replay** — verify evaluator not called.
3. **Bindings passed through** — evaluator receives bindings.
4. **Language in description** — present when provided, absent when omitted.
5. **Evaluator error** — verify error propagation.
6. **Source hash correct** — independently computed.
7. **Bindings hash correct** — independently computed.
8. **Replay guard: source changed** — verify `StaleInputError`.
9. **Replay guard: bindings changed** — verify `StaleInputError`.
10. **Divergence** — mismatched type/name.

---

## Effect 6: `durableResolve` — non-deterministic value capture

### Use case

Capture a non-deterministic value once. On replay, return the stored value.

### Signature

```typescript
type ResolveKind =
  | { kind: "current_time" }
  | { kind: "random_float"; min?: number; max?: number }
  | { kind: "random_int"; min: number; max: number }
  | { kind: "uuid" }
  | { kind: "env_var"; name: string }
  | { kind: "platform" };

function* durableResolve<T extends Json>(
  name: string, resolver: ResolveKind | (() => Operation<T>)
): Workflow<T>
```

Custom resolver returns `Operation<T>`, not `Promise<T>`.

### Description / Result shapes

```json
{ "type": "resolve", "name": "now", "kind": "current_time" }
{ "type": "resolve", "name": "env:DB_URL", "kind": "env_var", "varName": "DB_URL" }

{ "status": "ok", "value": "2026-03-04T15:30:00.000Z" }
```

### Implementation

```typescript
function* durableResolve<T extends Json>(
  name: string, resolver: ResolveKind | (() => Operation<T>)
): Workflow<T> {
  const isKind = typeof resolver === "object" && "kind" in resolver;
  const descExtras: Record<string, Json> = {};
  if (isKind) {
    descExtras.kind = resolver.kind;
    if (resolver.kind === "env_var") descExtras.varName = resolver.name;
  }

  return (yield createDurableOperation<T>(
    { type: "resolve", name, ...descExtras },
    function* () {
      if (typeof resolver === "function") {
        return yield* resolver();
      }

      const scope = yield* useScope();
      const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);

      switch (resolver.kind) {
        case "current_time": return new Date().toISOString() as T;
        case "random_float": {
          const min = resolver.min ?? 0, max = resolver.max ?? 1;
          return (Math.random() * (max - min) + min) as T;
        }
        case "random_int": {
          const range = resolver.max - resolver.min + 1;
          return (Math.floor(Math.random() * range) + resolver.min) as T;
        }
        case "uuid": return crypto.randomUUID() as T;
        case "env_var": return (runtime.env(resolver.name) ?? null) as T;
        case "platform": return runtime.platform() as T;
      }
    },
  )) as T;
}
```

### Convenience wrappers

```typescript
function* durableNow(name?: string): Workflow<string> {
  return yield* durableResolve(name ?? "now", { kind: "current_time" });
}
function* durableUUID(name?: string): Workflow<string> {
  return yield* durableResolve(name ?? "uuid", { kind: "uuid" });
}
function* durableEnv(varName: string, name?: string): Workflow<string | null> {
  return yield* durableResolve(name ?? `env:${varName}`, { kind: "env_var", name: varName });
}
```

### Tests

1. **Current time** — ISO-8601. Full replay returns same value.
2. **UUID** — format check. Full replay returns same UUID.
3. **Env var** — set var, resolve. Full replay ignores env changes.
4. **Random float** — in range. Full replay same number.
5. **Random int** — integer in `[min, max]`. Full replay same.
6. **Custom resolver** — called live, not on replay.
7. **Env var not set** — `null`, no error.
8. **Platform** — `{ os, arch }` shape.
9. **Convenience wrappers** — `durableNow`, `durableUUID`, `durableEnv` correct.
10. **Custom resolver error** — verify propagation.
11. **Divergence** — mismatched type/name.

---

## Replay Guards

The `ReplayGuard` API and `StaleInputError` already exist (see `@effectionx/durable-streams` replay-guard.ts and replay-guard.test.ts). What's missing are the **concrete, reusable guard implementations** that the effects are designed to work with. The existing tests validate the middleware mechanism using inline guards. These specifications cover the packaged guards that users install.

All guards follow the same pattern from the replay guard spec §5:

- **`check` phase** — runs in generator context before replay begins. I/O is allowed. Gathers current state and caches it in a closure-scoped `Map`.
- **`decide` phase** — runs synchronously inside `DurableEffect.enter()` during replay. Reads from the cache, compares against recorded values in `event.result.value`, returns `{ outcome: "replay" }` or `{ outcome: "error", error }`.

Guards are installed on the caller's scope via `scope.around(ReplayGuard, ...)` before `yield*`-ing into `durableRun`. They compose via Effection's middleware chain and inherit into child scopes.

### File location

`guards.ts` — all guards in one file, re-exported from `mod.ts`.

---

### Guard 1: `useFileContentGuard` — file staleness detection

**Works with:** `durableReadFile`

Detects when a file referenced by a `read_file` effect has changed since the journal was recorded.

- **Check**: reads `event.description.path`, calls `runtime.readTextFile()` + `computeSHA256()` to get the current hash, caches it keyed by path. Deduplicates — if 20 events reference the same path, the file is hashed once.
- **Decide**: reads `event.result.value.contentHash` (the recorded hash), compares against the cached current hash. Mismatch → `StaleInputError`.
- **No opinion**: if the event has no `path` in description or no `contentHash` in result, calls `next(event)`.

```typescript
function* useFileContentGuard(): Operation<void> {
  const scope = yield* useScope();
  const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);
  const cache = new Map<string, string>();

  scope.around(ReplayGuard, {
    *check([event], next) {
      const filePath = event.description.path;
      if (typeof filePath === "string" && !cache.has(filePath)) {
        const content = yield* runtime.readTextFile(filePath);
        const currentHash = yield* computeSHA256(content);
        cache.set(filePath, currentHash);
      }
      return yield* next(event);
    },
    decide([event], next) {
      const filePath = event.description.path;
      const resultValue = event.result.status === "ok" ? event.result.value : undefined;
      const recordedHash = (resultValue as Record<string, unknown> | undefined)
        ?.contentHash as string | undefined;

      if (typeof filePath === "string" && typeof recordedHash === "string") {
        const currentHash = cache.get(filePath);
        if (currentHash && currentHash !== recordedHash) {
          return {
            outcome: "error",
            error: new StaleInputError(
              `File changed: ${filePath} (recorded: ${recordedHash.slice(0, 16)}…, ` +
              `current: ${currentHash.slice(0, 16)}…)`,
            ),
          };
        }
      }
      return next(event);
    },
  });
}
```

#### Tests

1. **File unchanged** — hash matches, replay proceeds.
2. **File changed** — hash mismatch, `StaleInputError` thrown.
3. **No path in description** — guard passes through, no opinion.
4. **No contentHash in result** — guard passes through.
5. **Multiple events same path** — file hashed once (cache dedup).
6. **File missing at check time** — check throws, surfaced as error before replay starts.
7. **Integration with `durableReadFile`** — golden run, mutate file, replay blocked.
8. **Inherited by children** — guard installed on parent, child scope effects validated.

---

### Guard 2: `useGlobContentGuard` — directory scan staleness detection

**Works with:** `durableGlob`

Detects when the file set matching a glob pattern has changed (files added, removed, or modified).

- **Check**: reads `event.description.baseDir`, `include`, `exclude`. Calls `runtime.glob()` + hashes each file + computes composite scanHash. Caches keyed by `baseDir:include:exclude`.
- **Decide**: reads `event.result.value.scanHash`, compares against cached current scanHash. Mismatch → `StaleInputError`.

```typescript
function* useGlobContentGuard(): Operation<void> {
  const scope = yield* useScope();
  const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);
  const cache = new Map<string, string>();

  scope.around(ReplayGuard, {
    *check([event], next) {
      if (event.description.type === "glob") {
        const baseDir = event.description.baseDir as string;
        const include = event.description.include as string[];
        const exclude = (event.description.exclude ?? []) as string[];
        const key = `${baseDir}|${JSON.stringify(include)}|${JSON.stringify(exclude)}`;

        if (!cache.has(key)) {
          const entries = yield* runtime.glob({ patterns: include, root: baseDir, exclude });
          const matches: Array<{ path: string; contentHash: string }> = [];
          for (const entry of entries) {
            if (!entry.isFile) continue;
            const content = yield* runtime.readTextFile(`${baseDir}/${entry.path}`);
            const contentHash = yield* computeSHA256(content);
            matches.push({ path: entry.path, contentHash });
          }
          matches.sort((a, b) => a.path.localeCompare(b.path));
          const seen = new Set<string>();
          const deduped = matches.filter(m => {
            if (seen.has(m.path)) return false;
            seen.add(m.path); return true;
          });
          const scanHash = yield* computeSHA256(JSON.stringify(deduped));
          cache.set(key, scanHash);
        }
      }
      return yield* next(event);
    },
    decide([event], next) {
      if (event.description.type === "glob") {
        const baseDir = event.description.baseDir as string;
        const include = event.description.include as string[];
        const exclude = (event.description.exclude ?? []) as string[];
        const key = `${baseDir}|${JSON.stringify(include)}|${JSON.stringify(exclude)}`;

        const currentHash = cache.get(key);
        const recordedHash = (event.result.status === "ok"
          ? (event.result.value as Record<string, unknown>)?.scanHash
          : undefined) as string | undefined;

        if (currentHash && recordedHash && currentHash !== recordedHash) {
          return {
            outcome: "error",
            error: new StaleInputError(`Glob results changed for ${baseDir}`),
          };
        }
      }
      return next(event);
    },
  });
}
```

#### Tests

1. **Files unchanged** — scanHash matches, replay proceeds.
2. **File added** — scanHash mismatch, `StaleInputError`.
3. **File removed** — scanHash mismatch, `StaleInputError`.
4. **File modified** — scanHash mismatch (content hash changed), `StaleInputError`.
5. **Non-glob events pass through** — guard only acts on `type === "glob"`.
6. **Same glob scanned once** — cache dedup for identical patterns.
7. **Integration with `durableGlob`** — golden run, mutate tree, replay blocked.

---

### Guard 3: `useCodeFreshnessGuard` — eval source/bindings staleness

**Works with:** `durableEval`

Detects when the source code or bindings for an eval cell have changed.

Unlike the file and glob guards, this guard needs external input — the **current** source code and bindings for each cell name. It can't discover this from the filesystem because eval source comes from the caller, not from a path. The guard takes a lookup function that maps cell names to their current source and bindings.

- **Check**: for each `eval` event, looks up the current source/bindings by `event.description.name`, computes `sourceHash` and `bindingsHash`, caches them.
- **Decide**: reads `event.result.value.sourceHash` and `bindingsHash`, compares against cached current hashes. Either mismatch → `StaleInputError`.

```typescript
interface CellSource {
  source: string;
  bindings: Record<string, Json>;
}

function* useCodeFreshnessGuard(
  getCellSource: (cellName: string) => CellSource | undefined,
): Operation<void> {
  const scope = yield* useScope();
  const cache = new Map<string, { sourceHash: string; bindingsHash: string }>();

  scope.around(ReplayGuard, {
    *check([event], next) {
      if (event.description.type === "eval") {
        const cellName = event.description.name;
        if (!cache.has(cellName)) {
          const cell = getCellSource(cellName);
          if (cell) {
            const sourceHash = yield* computeSHA256(cell.source);
            const bindingsHash = yield* computeSHA256(JSON.stringify(cell.bindings));
            cache.set(cellName, { sourceHash, bindingsHash });
          }
        }
      }
      return yield* next(event);
    },
    decide([event], next) {
      if (event.description.type === "eval") {
        const cellName = event.description.name;
        const current = cache.get(cellName);
        const recorded = event.result.status === "ok"
          ? event.result.value as Record<string, unknown>
          : undefined;

        if (current && recorded) {
          if (current.sourceHash !== recorded.sourceHash) {
            return {
              outcome: "error",
              error: new StaleInputError(`Source changed for cell "${cellName}"`),
            };
          }
          if (current.bindingsHash !== recorded.bindingsHash) {
            return {
              outcome: "error",
              error: new StaleInputError(`Bindings changed for cell "${cellName}"`),
            };
          }
        }
      }
      return next(event);
    },
  });
}
```

#### Tests

1. **Source and bindings unchanged** — hashes match, replay proceeds.
2. **Source changed** — sourceHash mismatch, `StaleInputError` mentioning source.
3. **Bindings changed** — bindingsHash mismatch, `StaleInputError` mentioning bindings.
4. **Both changed** — sourceHash checked first, error references source.
5. **Unknown cell name** — `getCellSource` returns undefined, guard passes through.
6. **Non-eval events pass through** — guard only acts on `type === "eval"`.
7. **Integration with `durableEval`** — golden run, change source, replay blocked.
8. **Integration with `durableEval`** — golden run, change bindings, replay blocked.

---

### Guard composition

Multiple guards compose naturally via Effection's middleware:

```typescript
function* myWorkflow(): Operation<void> {
  const scope = yield* useScope();

  // Install all guards — order doesn't matter for error semantics
  // (any guard returning error halts replay)
  yield* useFileContentGuard();
  yield* useGlobContentGuard();
  yield* useCodeFreshnessGuard((name) => currentSources.get(name));

  yield* durableRun(function* () {
    const files = yield* durableGlob("sources", { baseDir: "src/", include: ["**/*.ts"] });
    for (const match of files.matches) {
      const content = yield* durableReadFile(`read:${match.path}`, match.path);
      yield* durableEval(`eval:${match.path}`, myEvaluator, { source: content.content });
    }
  }, { stream, runtime });
}
```

All three guards see all events during the check phase. During decide, each guard filters by `event.description.type` — file guard acts on `read_file`, glob guard on `glob`, code guard on `eval`. Events that no guard has an opinion on fall through to the default `{ outcome: "replay" }`.

---

## Summary

### Effect vocabulary

| Effect | Type | Runtime methods used |
|--------|------|---------------------|
| `durableExec` | `"exec"` | `runtime.exec()` |
| `durableReadFile` | `"read_file"` | `runtime.readTextFile()` |
| `durableGlob` | `"glob"` | `runtime.glob()`, `runtime.readTextFile()` |
| `durableFetch` | `"fetch"` | `runtime.fetch()` |
| `durableEval` | `"eval"` | none (caller-provided evaluator) |
| `durableResolve` | `"resolve"` | `runtime.env()`, `runtime.platform()` |

### Replay guards

| Guard | Works with | Detects |
|-------|-----------|---------|
| `useFileContentGuard` | `durableReadFile` | File content changed since journal recorded |
| `useGlobContentGuard` | `durableGlob` | Files added/removed/modified in scanned directory |
| `useCodeFreshnessGuard` | `durableEval` | Source code or bindings changed for eval cell |

All use `createDurableOperation`. All I/O goes through `DurableRuntime` (Operation-native). All hashing goes through `computeSHA256` (Operation-native).

### Implementation order

1. **`DurableRuntime` interface + `nodeRuntime()` + `stubRuntime()`**
2. **`computeSHA256` in `hash.ts`**
3. **`durableResolve`** + wrappers — simplest
4. **`durableReadFile`** — enables replay guard integration
5. **`useFileContentGuard`** — first concrete guard, validates guard pattern
6. **`durableExec`** — subprocess
7. **`durableFetch`** — HTTP
8. **`durableGlob`** — glob + readTextFile
9. **`useGlobContentGuard`** — second guard
10. **`durableEval`** — evaluator
11. **`useCodeFreshnessGuard`** — third guard

### Exports (in `mod.ts`)

```typescript
export { durableExec, durableReadFile, durableGlob, durableFetch,
  durableEval, durableResolve, durableNow, durableUUID, durableEnv,
} from "./operations.ts";
export type { ExecOptions, ExecResult, ReadFileResult, GlobOptions,
  GlobMatch, GlobResult, FetchOptions, FetchResult, EvalOptions,
  EvalResult, ResolveKind, DurableRuntime,
} from "./operations.ts";
export { useFileContentGuard, useGlobContentGuard, useCodeFreshnessGuard,
} from "./guards.ts";
export type { CellSource } from "./guards.ts";
export { nodeRuntime } from "./node-runtime.ts";
export { computeSHA256 } from "./hash.ts";
```
