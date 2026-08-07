# Process

Execute and manage system processes with structured concurrency. A library for
spawning and controlling child processes in Effection programs.

---

This package provides two main functions: `exec()` for running processes with a
finite lifetime, and `daemon()` for long-running processes like servers.

## Features

- Stream-based access to stdout and stderr
- Writable stdin for sending input to processes
- Proper signal handling and cleanup on both POSIX and Windows
- Shell mode for complex commands with glob expansion
- Structured error handling with `join()` and `expect()` methods
- Independent process-exit observation with `exited()`
- State-aware escalation from graceful shutdown to hard termination

## Basic Usage

### Running a Command

Use `exec()` to run a command and wait for it to complete:

```typescript
import { main } from "effection";
import { exec } from "@effectionx/process";

await main(function* () {
  // Run a command and get the result
  let result = yield* exec("echo 'Hello World'").join();

  console.log(result.stdout); // "Hello World\n"
  console.log(result.code); // 0
});
```

### Streaming Output

Access stdout and stderr as streams for real-time output processing:

```typescript
import { each, main, spawn } from "effection";
import { exec } from "@effectionx/process";

await main(function* () {
  let process = yield* exec("npm install");

  // Stream stdout in real-time
  yield* spawn(function* () {
    for (let chunk of yield* each(process.stdout)) {
      console.log(chunk);
      yield* each.next();
    }
  });

  // Wait for the process to complete
  yield* process.expect();
});
```

### Handling Process Output With Middleware

By default, we log the output, but you can remove or add additional handling of output lines per `stdout` and `stderr`.

```typescript
import { each, main, spawn } from "effection";
import { exec } from "@effectionx/process";

await main(function* () {
  let process = yield* exec("npm install");

  yield* process.around({
    *stdout(line) {
      // it does this by default
      process.stdout.write(line);
    },
    *stderr(line) {
      // it does this by default
      process.stderr.write(line);
    },
  });

  // Wait for the process to complete
  yield* process.expect();
});
```

### Sending Input to stdin

Write to a process's stdin:

```typescript
import { main } from "effection";
import { exec } from "@effectionx/process";

await main(function* () {
  let process = yield* exec("cat");

  process.stdin.send("Hello from stdin!\n");

  let result = yield* process.join();
  console.log(result.stdout); // "Hello from stdin!\n"
});
```

## join() vs expect()

Both methods wait for the process to complete and collect stdout/stderr, but
they differ in error handling:

- **`join()`** - Always returns the result, regardless of exit code
- **`expect()`** - Throws an `ExecError` if the process exits with a non-zero
  code

```typescript
import { main } from "effection";
import { exec, ExecError } from "@effectionx/process";

await main(function* () {
  // join() returns result even on failure
  let result = yield* exec("exit 1", { shell: true }).join();
  console.log(result.code); // 1

  // expect() throws on non-zero exit
  try {
    yield* exec("exit 1", { shell: true }).expect();
  } catch (error) {
    if (error instanceof ExecError) {
      console.log(error.message); // Command failed with exit code 1
    }
  }
});
```

## exited() vs join()

Use `exited()` when you need the direct child's exit status without waiting for
its stdout and stderr streams to close. This distinction matters when a
descendant inherits one of those streams and keeps it open after the direct
child exits.

`exited()` observes process lifetime only. Output remains available separately
through `stdout` and `stderr`:

```typescript
import { main } from "effection";
import { exec } from "@effectionx/process";

await main(function* () {
  let process = yield* exec("node task.js");
  let status = yield* process.exited();

  console.log(status.code);
});
```

- **`exited()`** waits for the direct child to exit and does not wait for stdio
  to close
- If the process fails to spawn, **`exited()`** raises the spawn error and
  replays that same error when evaluated again
- **`join()`** waits for the direct child to exit and for its stdio streams to
  close
- **`expect()`** has the same close-settled behavior as `join()`, and throws an
  `ExecError` for an unsuccessful exit status

## Shutdown escalation

When an active process's host scope shuts down, `exec()` first requests a
graceful shutdown. On POSIX it sends `SIGTERM` to the process group; on Windows
it sends Ctrl-C and closes stdin.

The optional `shutdown` middleware controls whether that graceful request
should escalate to hard termination. It runs concurrently with process and
stdio closure. Calling `next()` hard-terminates the process tree; if the process
and its stdio close first, Effection cancels the middleware. Without middleware,
shutdown remains graceful and can wait indefinitely for a non-cooperative
process.

Treat `next()` as terminal delegation. Full closure can cancel the middleware
while hard termination is completing, so middleware bookkeeping must happen
before calling `next()` rather than after it returns.

Because middleware runs in the process's evaluation scope, it can inspect
context and wait for application state instead of relying on a fixed timeout:

```typescript
import { createContext, main, type Operation } from "effection";
import { exec } from "@effectionx/process";

interface ShutdownState {
  untilUnresponsive(): Operation<void>;
}

const shutdownState = createContext<ShutdownState>("shutdown state");

await main(function* () {
  const process = yield* exec("node server.js", {
    *shutdown(args, terminate) {
      const state = yield* shutdownState.expect();
      yield* state.untilUnresponsive();
      return yield* terminate(...args);
    },
  });

  yield* process.expect();
});
```

`shutdownState` in this example is an application-owned context whose
`untilUnresponsive()` operation observes health, draining, child ownership, or
another meaningful escalation condition. Returning without calling `next()`
keeps the shutdown graceful.

## Running Daemons

Use `daemon()` for long-running processes like servers. Unlike `exec()`, a
daemon is expected to run forever - if it exits prematurely, it raises an error:

```typescript
import { main, suspend } from "effection";
import { daemon } from "@effectionx/process";

await main(function* () {
  // Start a web server
  let server = yield* daemon("node server.js");

  console.log(`Server started with PID: ${server.pid}`);

  // The server will be automatically terminated when this scope exits
  yield* suspend();
});
```

## Options

The `exec()` and `daemon()` functions accept an options object:

```typescript
interface ExecOptions {
  // Additional arguments to pass to the command
  arguments?: string[];

  // Environment variables for the process
  env?: Record<string, string>;

  // Use shell to interpret the command (enables glob expansion, pipes, etc.)
  // Can be true for default shell or a path to a specific shell
  shell?: boolean | string;

  // Working directory for the process
  cwd?: string;

  // Optional policy for escalating graceful shutdown to hard termination
  shutdown?: ProcessShutdownMiddleware;
}
```

### Examples

```typescript
import { main } from "effection";
import { exec } from "@effectionx/process";

await main(function* () {
  // Pass arguments
  yield* exec("git", {
    arguments: ["commit", "-m", "Initial commit"],
  }).expect();

  // Set environment variables
  yield* exec("node app.js", {
    env: { NODE_ENV: "production", PORT: "3000" },
  }).expect();

  // Use shell mode for complex commands
  yield* exec("ls *.ts | wc -l", {
    shell: true,
  }).expect();

  // Set working directory
  yield* exec("npm install", {
    cwd: "./packages/my-package",
  }).expect();
});
```

## Process Interface

The `Process` object returned by `exec()` provides:

```typescript
interface Process {
  // Process ID
  readonly pid: number;

  // Output streams
  stdout: Stream<string>;
  stderr: Stream<string>;

  // Input stream
  stdin: Writable<string>;

  // Wait for the direct child to exit without waiting for stdio to close.
  // Spawn failures raise and replay the same error.
  exited(): Operation<ExitStatus>;

  // Wait for exit and stdio closure (returns exit status)
  join(): Operation<ExitStatus>;

  // Wait for successful exit and stdio closure (throws on non-zero exit)
  expect(): Operation<ExitStatus>;
}
```
