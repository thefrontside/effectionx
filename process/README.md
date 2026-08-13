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
- Optional deadline on shutdown for processes that will not exit
- Shell mode for complex commands with glob expansion
- Structured error handling with `join()` and `expect()` methods

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

## Shutdown

When the owning scope exits, a process is shut down cooperatively: `SIGTERM` to
the process group on POSIX, Ctrl-C plus stdin closure on Windows. Teardown then
waits for the process to exit and for its captured stdout and stderr to close,
so nothing is lost partway through.

That wait has no bound, and two ordinary situations never satisfy it. A process
that traps `SIGTERM` to run its own cleanup can simply decline to exit. A
descendant that inherited stdout or stderr can hold them open long after the
direct command is gone. In either case the scope stays open forever.

`Process` implements [`@effectionx/forceable`][forceable], so wrap it in
`withForce()` to put a deadline on that wait:

```typescript
import { main, sleep, suspend } from "effection";
import { withForce } from "@effectionx/forceable";
import { daemon } from "@effectionx/process";

await main(function* () {
  let server = yield* withForce(daemon("node server.js"), function* (force) {
    yield* sleep(10_000);
    force("server did not exit within 10s of SIGTERM");
  });

  yield* suspend();
});
```

The policy runs alongside the cooperative shutdown rather than replacing it. If
the process exits and its stdio closes in time, the policy is cancelled where it
stands and nothing is forced. If it does not, `force` escalates: `SIGKILL` to
the process group on POSIX, `taskkill /T /F` on Windows. Both reach descendants,
which is what makes them effective against the inherited-stdio case.

A policy is an operation, so it can wait on application state instead of a
clock — whether a queue has drained, whether a health endpoint has gone quiet,
whether this deploy is allowed to take its time:

```typescript
let server = yield* withForce(daemon("node server.js"), function* (force) {
  let drain = yield* DrainState.expect();
  yield* drain.abandoned;
  force("drain abandoned by operator");
});
```

Forcing skips whatever the process would have done on its way out — flushing
buffers, removing lock files, acknowledging in-flight work. Durable cleanup for
a process that might be forced has to be owned by something outside it.

[forceable]: ../forceable/README.md

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

  // Wait for completion (returns exit status)
  join(): Operation<ExitStatus>;

  // Wait for successful completion (throws on non-zero exit)
  expect(): Operation<ExitStatus>;

  // Abandon cooperative shutdown and terminate the process tree.
  // Called for you by withForce(); see Shutdown above.
  [force](reason?: string): void;
}
```
