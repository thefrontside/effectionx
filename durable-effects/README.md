# @effectionx/durable-effects

Durable effects and replay guards for Effection workflows.

Provides a collection of durable effects (`durableExec`, `durableReadFile`,
`durableGlob`, `durableFetch`, `durableEval`, `durableResolve`) and replay
guards (`useFileContentGuard`, `useGlobContentGuard`, `useCodeFreshnessGuard`)
for use with `@effectionx/durable-streams`.

---

## Installation

```bash
npm install @effectionx/durable-effects @effectionx/durable-streams effection
```

## Usage

```typescript
import { durableRun, InMemoryStream } from "@effectionx/durable-streams";
import {
  nodeRuntime,
  DurableRuntimeCtx,
  durableExec,
  durableReadFile,
  useFileContentGuard,
} from "@effectionx/durable-effects";
import { run, useScope } from "effection";

await run(function* () {
  const scope = yield* useScope();

  // Install the runtime
  scope.set(DurableRuntimeCtx, nodeRuntime());

  // Optionally install replay guards
  yield* useFileContentGuard();

  // Run a durable workflow
  const stream = new InMemoryStream();
  yield* durableRun(function* () {
    const result = yield* durableExec("build", {
      command: ["npm", "run", "build"],
    });
    const config = yield* durableReadFile("config", "./config.json");
    return { result, config };
  }, { stream });
});
```
