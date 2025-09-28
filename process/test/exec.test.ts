import { spawn, type Task } from "effection";
import { expect } from "@std/expect";
import { beforeEach, describe, it } from "@effectionx/bdd";

import { exec, type Process, type ProcessResult } from "../mod.ts";
import {
  captureError,
  expectMatch,
  fetchText,
  streamClose,
} from "./helpers.ts";
import process from "node:process";
import { EOL } from "node:os";
import { lines } from "../src/helpers.ts";

const SystemRoot = Deno.env.get("SystemRoot");

const isPowerShell = () =>
  process.platform === "win32" && !process.env.shell?.endsWith("bash.exe");

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
    let joinStdout: Task<unknown>;
    let joinStderr: Task<unknown>;

    beforeEach(function* () {
      proc = yield* exec("deno run -A './fixtures/echo-server.ts'", {
        env: {
          PORT: "29000",
          PATH: process.env.PATH as string,
          ...SystemRoot ? { SystemRoot } : {},
        },
        cwd: import.meta.dirname,
      });

      joinStdout = yield* spawn(streamClose(proc.stdout));
      joinStderr = yield* spawn(streamClose(proc.stderr));

      yield* expectMatch(/listening/, lines()(proc.stdout));
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
        expect.assertions(2);
        yield* proc.expect();
        expect(yield* joinStdout).toEqual(undefined);
        expect(yield* joinStderr).toEqual(undefined);
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
      });

      it("closes stdout and stderr", function* () {
        expect(yield* joinStdout).toEqual(undefined);
        expect(yield* joinStderr).toEqual(undefined);
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
  it("automatically parses the command argumens using shellwords", function* () {
    let proc = exec('echo "first" | echo "second"', {
      shell: false,
    });
    let { stdout }: ProcessResult = yield* proc.expect();

    // The shellwords parser correctly splits the command into ["echo", "first", "|", "echo", "second"]
    // However, the echo command behaves differently across shells:
    // - bash/Unix shells: outputs all arguments on one line separated by spaces, strips quotes: "first | echo second\n"
    // - PowerShell: outputs all arguments on one line separated by spaces, preserves quotes: `"first" "|" "echo" "second"\r\n`
    const expected = isPowerShell()
      ? `"first" "|" "echo" "second"\r\n`
      : "first | echo second\n";

    expect(stdout).toEqual(expected);
  });
});

describe("handles env vars", () => {
  describe("when the `shell` option is `bash`", () => {
    let shell = "bash";

    it("can echo a passed in environment variable", function* () {
      let proc = exec("echo $EFFECTION_TEST_ENV_VAL", {
        shell,
        env: { EFFECTION_TEST_ENV_VAL: "boop" },
      });
      let { stdout, code }: ProcessResult = yield* proc.expect();

      expect(stdout).toEqual("boop\n");
      expect(code).toBe(0);
    });

    it("can echo a passed in environment variable with curly brace syntax", function* () {
      let proc = exec("echo ${EFFECTION_TEST_ENV_VAL}", {
        shell,
        env: { EFFECTION_TEST_ENV_VAL: "boop" },
      });
      let { stdout, code }: ProcessResult = yield* proc.expect();

      expect(stdout).toEqual("boop\n");
      expect(code).toBe(0);
    });
  });

  describe("when the `shell` option is `true`", () => {
    let shell = true;

    it("can echo a passed in environment variable", function* () {
      let proc = exec("echo $EFFECTION_TEST_ENV_VAL", {
        shell,
        env: { EFFECTION_TEST_ENV_VAL: "boop" },
      });
      let { stdout, code }: ProcessResult = yield* proc.expect();

      // this fails on windows, this shell option doesn't work on windows
      // due to it generally running through cmd.exe which can't handle this syntax
      let result = process.platform !== "win32"
        ? "boop\n"
        // note the additional \r that is added
        : "$EFFECTION_TEST_ENV_VAL\r\n";
      expect(stdout).toEqual(result);
      expect(code).toBe(0);
    });

    it("can echo a passed in environment variable with curly brace syntax", function* () {
      let proc = exec("echo ${EFFECTION_TEST_ENV_VAL}", {
        shell,
        env: { EFFECTION_TEST_ENV_VAL: "boop" },
      });
      let { stdout, code }: ProcessResult = yield* proc.expect();

      // this fails on windows, this shell option doesn't work on windows
      // due to it generally running through cmd.exe which can't handle this syntax
      let result = process.platform !== "win32"
        ? "boop\n"
        // note the additional \r that is added
        : "${EFFECTION_TEST_ENV_VAL}\r\n";
      expect(stdout).toEqual(result);
      expect(code).toBe(0);
    });
  });

  describe("when the `shell` option is `false`", () => {
    let shell = false;

    it("can echo a passed in environment variable", function* () {
      let proc = exec("echo $EFFECTION_TEST_ENV_VAL", {
        shell,
        env: { EFFECTION_TEST_ENV_VAL: "boop" },
      });
      let { stdout, code }: ProcessResult = yield* proc.expect();

      console.log(
        "shell false test - platform:",
        process.platform,
        "shell:",
        process.env.shell,
        "condition result:",
        process.platform === "win32" &&
          !process.env.shell?.endsWith("bash.exe"),
      );
      console.log("shell false test - actual stdout:", JSON.stringify(stdout));

      const expected = isPowerShell()
        ? `"$EFFECTION_TEST_ENV_VAL"` + EOL // PowerShell: quotes + CRLF
        : "$EFFECTION_TEST_ENV_VAL" + "\n"; // Everything else: no quotes + LF
      expect(stdout).toEqual(expected);
      expect(code).toBe(0);
    });

    it("can echo a passed in environment variable with curly brace syntax", function* () {
      let proc = exec("echo ${EFFECTION_TEST_ENV_VAL}", {
        shell,
        env: { EFFECTION_TEST_ENV_VAL: "boop" },
      });
      let { stdout, code }: ProcessResult = yield* proc.expect();

      // PowerShell preserves quotes around the output and keeps curly braces
      // Shellwords normalizes ${VAR} to $VAR on all platforms
      const expected = isPowerShell()
        ? `"` + "${EFFECTION_TEST_ENV_VAL}" + `"` + EOL // PowerShell: quotes + CRLF
        : "$EFFECTION_TEST_ENV_VAL" + "\n"; // Everything else: normalized to $VAR + LF
      expect(stdout).toEqual(expected);
      expect(code).toBe(0);
    });
  });

  describe("when the `shell` option is `process.env.shell`", () => {
    let shell = process.env.shell;
    // This comes back undefined in linux, mac and windows (using the cmd.exe default).
    // When using git-bash on windows, this appears to be set.
    // We haven't found any other configurations where it is set by default.

    it("can echo a passed in environment variable", function* () {
      let proc = exec("echo $EFFECTION_TEST_ENV_VAL", {
        shell,
        env: { EFFECTION_TEST_ENV_VAL: "boop" },
      });
      let { stdout, code }: ProcessResult = yield* proc.expect();

      let result = shell?.endsWith("bash.exe")
        ? "boop\n" // Bash resolves env vars even with process.env.shell
        : (isPowerShell()
          ? `"$EFFECTION_TEST_ENV_VAL"` + EOL
          : "$EFFECTION_TEST_ENV_VAL" + "\n");
      expect(stdout).toEqual(result);
      expect(code).toBe(0);
    });

    it("can echo a passed in environment variable with curly brace syntax", function* () {
      let proc = exec("echo ${EFFECTION_TEST_ENV_VAL}", {
        shell,
        env: { EFFECTION_TEST_ENV_VAL: "boop" },
      });
      let { stdout, code }: ProcessResult = yield* proc.expect();

      if (shell?.endsWith("bash.exe")) {
        expect(stdout).toEqual("boop\n"); // Bash resolves env vars
      } else if (isPowerShell()) {
        expect(stdout).toEqual(`"` + "${EFFECTION_TEST_ENV_VAL}" + `"` + EOL); // PowerShell: quotes + CRLF
      } else {
        expect(stdout).toEqual("${EFFECTION_TEST_ENV_VAL}" + "\n"); // Everything else: no quotes + LF
      }
      expect(code).toBe(0);
    });
  });
});
