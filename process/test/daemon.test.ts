import { beforeEach, describe, it } from "@effectionx/deno-testing-bdd";
import { expect } from "@std/expect";
import { ensure, spawn, suspend, until, withResolvers, type Task } from "effection";
import process from "node:process";

import { daemon, type Process } from "../mod.ts";
import { captureError, expectMatch, fetch, streamClose } from "./helpers.ts";

describe("daemon", () => {
  let task: Task<void>;
  let proc: Process;

  beforeEach(function* () {
    const result = withResolvers<Process>();
    task = yield* spawn<void>(function* () {
      let proc: Process = yield* daemon("node", {
        arguments: ["./fixtures/echo-server.js"],
        env: { PORT: "29000", PATH: process.env.PATH as string },
        cwd: import.meta.dirname,
      });
      result.resolve(proc);
      yield* suspend();
    });
    proc = yield* result.operation;

    yield* expectMatch(/listening/, proc.stdout.lines());

    yield* ensure(function* () {
      task.halt();
    });
  });

  it("starts the given child", function* () {
    let response = yield* fetch("http://localhost:29000", {
      method: "POST",
      body: "hello",
    });
    let text = yield* until(response.text());

    expect(response.status).toEqual(200);
    expect(text).toEqual("hello");
  });

  // describe("halting the daemon task", () => {
  //   beforeEach(function* () {
  //     task.halt();
  //   });
  //   it("kills the process", function* () {
  //     expect(
  //       yield* captureError(
  //         fetch(`http://localhost:29000`, { method: "POST", body: "hello" }),
  //       ),
  //     ).toHaveProperty("name", "FetchError");
  //   });
  // });

  // describe("shutting down the daemon process prematurely", () => {
  //   beforeEach(function* () {
  //     const response = yield* fetch("http://localhost:29000", { method: "POST", body: "exit" });
  //     yield* until(response.text());
  //   });

  //   it("throw an error because it was not expected to close", function* () {
  //     yield* until(expect(task).rejects.toHaveProperty("name", "DaemonExitError"));
  //   });
  // });
});
