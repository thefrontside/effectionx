import process from "node:process";
import { beforeEach, describe, it } from "@effectionx/bdd";
import { type Task, spawn, withResolvers } from "effection";
import { expect } from "expect";

import { captureError, fetchText } from "./helpers.ts";

import { lines } from "@effectionx/stream-helpers";
import { type Process, type ProcessResult, exec, processApi } from "../mod.ts";

const SystemRoot = process.env.SystemRoot;

// Validate SHELL environment variable is set for proper test execution
if (process.platform === "win32" && !process.env.SHELL) {
  throw new Error(
    "SHELL environment variable is required for Windows tests.\n" +
      "Please set SHELL using one of these commands:\n" +
      "  PowerShell: $env:SHELL = 'powershell'\n" +
      "  pwsh: $env:SHELL = 'pwsh'\n" +
      "  CMD: set SHELL=cmd\n" +
      "  Git Bash: export SHELL=bash",
  );
}

const isBash = () => {
  // On POSIX systems, SHELL is undefined so default to bash
  if (process.platform !== "win32") return true;

  // On Windows, SHELL is required and set, check it or fallback to process.env.shell
  const shell = process.env.SHELL?.toLowerCase();
  const processShell = process.env.shell;

  return shell === "bash" || processShell?.endsWith("bash.exe");
};

describe("exec", () => {
  describe(".join", () => {
    it("runs successfully to completion", function* () {
      let result: ProcessResult = yield* exec(
        "node './fixtures/hello-world.js'",
        {
          cwd: import.meta.dirname,
        },
      ).join();

      expect(result).toMatchObject({
        code: 0,
        stdout: "hello\nworld\n",
        stderr: "boom\n",
      });
    });

    it("runs failed process to completion", function* () {
      let result: ProcessResult = yield* exec(
        "node './fixtures/hello-world-failed.js'",
        {
          cwd: import.meta.dirname,
        },
      ).join();

      expect(result.code).toEqual(37);
      expect(result.stdout).toEqual("hello world\n");
      expect(result.stderr).toEqual("boom\n");
    });
  });

  describe(".expect", () => {
    expect.assertions(1);
    it("runs successfully to completion", function* () {
      let result: ProcessResult = yield* exec(
        "node './fixtures/hello-world.js'",
        {
          cwd: import.meta.dirname,
        },
      ).expect();

      expect(result).toMatchObject({
        code: 0,
        stdout: "hello\nworld\n",
        stderr: "boom\n",
      });
    });

    it("throws an error if process fails", function* () {
      let error: Error = yield* captureError(
        exec("node './test/fixtures/hello-world-failed.js'").expect(),
      );

      expect(error.name).toEqual("ExecError");
    });
  });

  describe("spawning", () => {
    describe("a process that fails to start because executable is not found", () => {
      it("calling join() throws an exception", function* () {
        let error: unknown;
        let proc = yield* exec("argle", { arguments: ["bargle"] });
        try {
          yield* proc.join();
        } catch (e) {
          error = e;
        }
        expect(error).toBeInstanceOf(Error);
      });
      it("calling expect() throws an exception", function* () {
        let error: unknown;
        let proc = yield* exec("argle", { arguments: ["bargle"] });
        try {
          yield* proc.expect();
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
      });
    });
  });
  describe("successfully", () => {
    let proc: Process;
    let stdoutTask: Task<{ sawData: boolean; matched: boolean }>;
    let stderrTask: Task<{ sawData: boolean }>;

    beforeEach(function* () {
      const stdoutReady = withResolvers<boolean>();

      proc = yield* exec(
        "node --experimental-strip-types './fixtures/echo-server.ts'",
        {
          env: {
            PORT: "29000",
            PATH: process.env.PATH as string,
            ...(SystemRoot ? { SystemRoot } : {}),
          },
          cwd: import.meta.dirname,
        },
      );

      stdoutTask = yield* spawn(function* () {
        const subscription = yield* lines()(proc.stdout);
        let sawData = false;
        let matched = false;
        let resolved = false;
        let next = yield* subscription.next();
        while (!next.done) {
          sawData = true;
          if (!matched && /listening/.test(next.value)) {
            matched = true;
            if (!resolved) {
              stdoutReady.resolve(true);
              resolved = true;
            }
          }
          next = yield* subscription.next();
        }
        if (!resolved) {
          stdoutReady.resolve(false);
        }
        return { sawData, matched };
      });

      stderrTask = yield* spawn(function* () {
        const subscription = yield* proc.stderr;
        let sawData = false;
        let next = yield* subscription.next();
        while (!next.done) {
          sawData = true;
          next = yield* subscription.next();
        }
        return { sawData };
      });

      const listening = yield* stdoutReady.operation;
      if (!listening) {
        throw new Error("Expected echo server to log listening.");
      }
    });

    describe("when it succeeds", () => {
      beforeEach(function* () {
        yield* fetchText("http://localhost:29000", {
          method: "POST",
          body: "exit",
        });
      });

      it("has a pid", function* () {
        expect(typeof proc.pid).toBe("number");
        expect(proc.pid).not.toBeNaN();
        // make sure it completes
        yield* proc.join();
      });

      it("joins successfully", function* () {
        let status = yield* proc.join();
        expect(status.code).toEqual(0);
      });

      it("expects successfully", function* () {
        let status = yield* proc.expect();
        expect(status.code).toEqual(0);
      });

      it("closes stdout and stderr", function* () {
        yield* proc.expect();

        const stdoutResult = yield* stdoutTask;
        const stderrResult = yield* stderrTask;

        expect(stdoutResult.matched).toEqual(true);
        expect(stdoutResult.sawData).toEqual(true);
        expect(stderrResult.sawData).toEqual(true);
      });
    });

    describe("when it fails", () => {
      let error: Error;
      beforeEach(function* () {
        yield* fetchText("http://localhost:29000", {
          method: "POST",
          body: "fail",
        });
      });

      it("joins successfully", function* () {
        let status = yield* proc.join();
        expect(status.code).not.toEqual(0);
      });

      it("expects unsuccessfully", function* () {
        try {
          yield* proc.expect();
        } catch (e) {
          error = e as Error;
        }
        expect(error).toBeDefined();

        const stdoutResult = yield* stdoutTask;
        expect(stdoutResult.matched).toEqual(true);
        expect(stdoutResult.sawData).toEqual(true);
      });

      it("closes stdout and stderr", function* () {
        const stdoutResult = yield* stdoutTask;
        const stderrResult = yield* stderrTask;

        expect(stdoutResult.matched).toEqual(true);
        expect(stdoutResult.sawData).toEqual(true);
        expect(stderrResult.sawData).toEqual(true);
      });
    });
  });
});

// running shell scripts in windows is not well supported, our windows
// process stuff sets shell to `false` and so you probably shouldn't do this
// in windows at all.
if (process.platform !== "win32") {
  describe("when the `shell` option is true", () => {
    it("lets the shell do all of the shellword parsing", function* () {
      let proc = exec('echo "first" | echo "second"', {
        shell: true,
      });
      let { stdout }: ProcessResult = yield* proc.expect();

      expect(stdout).toEqual("second\n");
    });
  });
}

describe("when the `shell` option is `false`", () => {
  it("correctly receives literal arguments when shell: false", function* () {
    // Arguments are passed literally as parsed by shellwords-ts
    let proc = exec("node ./fixtures/dump-args.js first | echo second", {
      shell: false,
      cwd: import.meta.dirname,
    });
    let { stdout }: ProcessResult = yield* proc.expect();

    // Node's console.log uses a single LF (\n) line ending.
    const expected = `${JSON.stringify({
      args: ["first", "|", "echo", "second"], // Arguments received by Node
      envVar: undefined,
    })}\n`;

    expect(stdout).toEqual(expected);
  });

  it("verifies environment variable handling and literal argument passing", function* () {
    // Execute the custom script with the literal argument
    let proc = exec("node ./fixtures/dump-args.js $EFFECTION_TEST_ENV_VAL", {
      shell: false, // Ensures the argument is passed literally
      env: {
        EFFECTION_TEST_ENV_VAL: "boop",
        PATH: process.env.PATH as string,
      },
      cwd: import.meta.dirname,
    });
    let { stdout, code }: ProcessResult = yield* proc.expect();

    // The argument is passed literally, and the env var is available in the child process's env.
    const expected = `${JSON.stringify({
      args: ["$EFFECTION_TEST_ENV_VAL"], // Argument is passed literally
      envVar: "boop", // Env variable is read from process.env
    })}\n`;

    expect(stdout).toEqual(expected);
    expect(code).toBe(0);
  });
});

describe("handles env vars", () => {
  describe("when the `shell` option is `bash`", () => {
    let shell = "bash";

    it("can pass in an environment variable", function* () {
      let proc = exec("node ./fixtures/dump-args.js $EFFECTION_TEST_ENV_VAL", {
        shell,
        env: {
          EFFECTION_TEST_ENV_VAL: "boop",
          PATH: process.env.PATH as string,
        },
        cwd: import.meta.dirname,
      });
      let { stdout, code }: ProcessResult = yield* proc.expect();

      const expected = `${JSON.stringify({
        args: ["boop"],
        envVar: "boop",
      })}\n`;

      expect(stdout).toEqual(expected);
      expect(code).toBe(0);
    });

    it("can pass in an environment variable with curly brace syntax", function* () {
      let proc = exec(
        "node ./fixtures/dump-args.js ${EFFECTION_TEST_ENV_VAL}",
        {
          shell,
          env: {
            EFFECTION_TEST_ENV_VAL: "boop",
            PATH: process.env.PATH as string,
          },
          cwd: import.meta.dirname,
        },
      );
      let { stdout, code }: ProcessResult = yield* proc.expect();

      const expected = `${JSON.stringify({
        args: ["boop"],
        envVar: "boop",
      })}\n`;

      expect(stdout).toEqual(expected);
      expect(code).toBe(0);
    });
  });

  describe("when the `shell` option is `true`", () => {
    let shell = true;

    it("can pass in an environment variable", function* () {
      let proc = exec("node ./fixtures/dump-args.js $EFFECTION_TEST_ENV_VAL", {
        shell,
        env: {
          EFFECTION_TEST_ENV_VAL: "boop",
          PATH: process.env.PATH as string,
        },
        cwd: import.meta.dirname,
      });
      let { stdout, code }: ProcessResult = yield* proc.expect();

      // this fails on windows, this shell option doesn't work on windows
      // due to it generally running through cmd.exe which can't handle this syntax
      let expected =
        process.platform !== "win32"
          ? `${JSON.stringify({ args: ["boop"], envVar: "boop" })}\n`
          : // note the additional \r that is added
            `${JSON.stringify({
              args: ["$EFFECTION_TEST_ENV_VAL"],
              envVar: "boop",
            })}\n`;

      expect(stdout).toEqual(expected);
      expect(code).toBe(0);
    });

    it("can pass in an environment variable with curly brace syntax", function* () {
      let proc = exec(
        "node ./fixtures/dump-args.js ${EFFECTION_TEST_ENV_VAL}",
        {
          shell,
          env: {
            EFFECTION_TEST_ENV_VAL: "boop",
            PATH: process.env.PATH as string,
          },
          cwd: import.meta.dirname,
        },
      );
      let { stdout, code }: ProcessResult = yield* proc.expect();

      // this fails on windows, this shell option doesn't work on windows
      // due to it generally running through cmd.exe which can't handle this syntax
      let expected =
        process.platform !== "win32"
          ? `${JSON.stringify({ args: ["boop"], envVar: "boop" })}\n`
          : // note the additional \r that is added
            `${JSON.stringify({
              args: ["${EFFECTION_TEST_ENV_VAL}"],
              envVar: "boop",
            })}\n`;

      expect(stdout).toEqual(expected);
      expect(code).toBe(0);
    });
  });

  describe("when the `shell` option is `false`", () => {
    let shell = false;

    it("can pass in an environment variable", function* () {
      let proc = exec("node ./fixtures/dump-args.js $EFFECTION_TEST_ENV_VAL", {
        shell,
        env: {
          EFFECTION_TEST_ENV_VAL: "boop",
          PATH: process.env.PATH as string,
        },
        cwd: import.meta.dirname,
      });
      let { stdout, code }: ProcessResult = yield* proc.expect();

      const expected = `${JSON.stringify({
        args: ["$EFFECTION_TEST_ENV_VAL"],
        envVar: "boop",
      })}\n`;

      expect(stdout).toEqual(expected);
      expect(code).toBe(0);
    });

    it("can pass in an environment variable with curly brace syntax", function* () {
      let proc = exec(
        "node ./fixtures/dump-args.js ${EFFECTION_TEST_ENV_VAL}",
        {
          shell,
          env: {
            EFFECTION_TEST_ENV_VAL: "boop",
            PATH: process.env.PATH as string,
          },
          cwd: import.meta.dirname,
        },
      );
      let { stdout, code }: ProcessResult = yield* proc.expect();

      // Platform behavior differences with shell: false:
      // - PowerShell/CMD: Preserves quotes around arguments and keeps curly braces: "${EFFECTION_TEST_ENV_VAL}" + CRLF
      // - Bash (Windows): Normalizes ${VAR} to $VAR during argument processing: $EFFECTION_TEST_ENV_VAL + LF
      // - Bash (Unix): Keeps curly braces intact: ${EFFECTION_TEST_ENV_VAL} + LF
      // Note: Shellwords parsing preserves braces on all platforms, but bash execution normalizes them
      const expected = `${JSON.stringify({
        args: ["${EFFECTION_TEST_ENV_VAL}"],
        envVar: "boop",
      })}\n`;

      expect(stdout).toEqual(expected);
      expect(code).toBe(0);
    });
  });

  if (process.platform === "win32" && isBash()) {
    describe("when the `shell` option is `process.env.shell` (Windows bash only)", () => {
      let shell = process.env.shell;
      // This tests Git Bash on Windows where process.env.shell is set to bash.exe

      it("can pass in an environment variable", function* () {
        let proc = exec(
          "node ./fixtures/dump-args.js $EFFECTION_TEST_ENV_VAL",
          {
            shell,
            env: {
              EFFECTION_TEST_ENV_VAL: "boop",
              PATH: process.env.PATH as string,
            },
            cwd: import.meta.dirname,
          },
        );
        let { stdout, code }: ProcessResult = yield* proc.expect();

        // Windows bash should resolve environment variables
        const expected = `${JSON.stringify({
          args: ["boop"],
          envVar: "boop",
        })}\n`;
        expect(stdout).toEqual(expected);
        expect(code).toBe(0);
      });

      it("can pass in an environment variable with curly brace syntax", function* () {
        let proc = exec(
          "node ./fixtures/dump-args.js ${EFFECTION_TEST_ENV_VAL}",
          {
            shell,
            env: {
              EFFECTION_TEST_ENV_VAL: "boop",
              PATH: process.env.PATH as string,
            },
            cwd: import.meta.dirname,
          },
        );
        let { stdout, code }: ProcessResult = yield* proc.expect();

        // Windows bash should resolve environment variables with curly brace syntax
        const expected = `${JSON.stringify({
          args: ["boop"],
          envVar: "boop",
        })}\n`;
        expect(stdout).toEqual(expected);
        expect(code).toBe(0);
      });
    });
  }

  // Close the main "handles env vars" describe block
});

describe("processApi middleware", () => {
  it("can intercept process creation with logging", function* () {
    let createdCommands: string[] = [];

    yield* processApi.around({
      *createProcess(args, next) {
        let [cmd] = args;
        createdCommands.push(cmd);
        return yield* next(...args);
      },
    });

    // Use node -e for cross-platform compatibility (Windows doesn't have echo as executable)
    yield* exec("node", { arguments: ["-e", "console.log('hello')"] }).join();
    yield* exec("node", { arguments: ["-e", "console.log('world')"] }).join();

    expect(createdCommands).toEqual(["node", "node"]);
  });

  it("middleware is scoped and does not leak", function* () {
    let outerCalls: string[] = [];
    let innerCalls: string[] = [];

    yield* processApi.around({
      *createProcess(args, next) {
        outerCalls.push("outer");
        return yield* next(...args);
      },
    });

    // Make a call in outer scope (use node for cross-platform)
    yield* exec("node", { arguments: ["-e", "console.log('outer')"] }).join();

    // Spawn a child scope with additional middleware
    let task = yield* spawn(function* () {
      yield* processApi.around({
        *createProcess(args, next) {
          innerCalls.push("inner");
          return yield* next(...args);
        },
      });

      // Make call in inner scope - should hit both middlewares
      yield* exec("node", { arguments: ["-e", "console.log('inner')"] }).join();
    });

    yield* task;

    // Outer scope should have both outer middleware calls
    expect(outerCalls).toEqual(["outer", "outer"]);
    // Inner scope should have one call
    expect(innerCalls).toEqual(["inner"]);
  });
});
