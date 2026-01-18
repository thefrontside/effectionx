import process from "node:process";
import { beforeEach, describe, it } from "@effectionx/bdd";
import { type Task, spawn, until, withResolvers } from "effection";
import { expect } from "expect";

import { lines } from "@effectionx/stream-helpers";
import { type Daemon, daemon } from "../mod.ts";
import { captureError, expectMatch, fetchText } from "./helpers.ts";

const SystemRoot = process.env.SystemRoot;

describe("daemon", () => {
  let task: Task<void>;
  let proc: Daemon;

  describe("controlling from outside", () => {
    beforeEach(function* () {
      const result = withResolvers<Daemon>();
      task = yield* spawn<void>(function* () {
        let proc = yield* daemon("node", {
          arguments: [
            "--experimental-strip-types",
            "./fixtures/echo-server.ts",
          ],
          env: {
            PORT: "29002",
            PATH: process.env.PATH as string,
            ...(SystemRoot ? { SystemRoot } : {}),
          },
          cwd: import.meta.dirname,
        });
        result.resolve(proc);
        yield* proc;
      });

      proc = yield* result.operation;

      yield* expectMatch(/listening/, lines()(proc.stdout));
    });

    it("starts the given child", function* () {
      const response = yield* fetchText("http://localhost:29002", {
        method: "POST",
        body: "hello",
      });

      expect(response.status).toEqual(200);
      expect(response.text).toEqual("hello");
    });

    describe("halting the daemon task", () => {
      beforeEach(function* () {
        yield* until(task.halt());
      });
      it("kills the process", function* () {
        expect(
          yield* captureError(
            fetchText("http://localhost:29002", {
              method: "POST",
              body: "hello",
            }),
          ),
        ).toMatchObject({
          message: expect.stringContaining("FetchError"),
        });
      });
    });
  });

  describe("shutting down the daemon process prematurely", () => {
    let task: Task<Error>;
    beforeEach(function* () {
      let proc = yield* daemon("node", {
        arguments: ["--experimental-strip-types", "fixtures/echo-server.ts"],
        env: {
          PORT: "29001",
          PATH: process.env.PATH as string,
          ...(SystemRoot ? { SystemRoot } : {}),
        },
        cwd: import.meta.dirname,
      });

      task = yield* spawn(function* () {
        try {
          yield* proc;
        } catch (e) {
          return e as Error;
        }
        return new Error(`this shouldn't happen`);
      });

      yield* expectMatch(/listening/, lines()(proc.stdout));

      yield* fetchText("http://localhost:29001", {
        method: "POST",
        body: "exit",
      });
    });

    it("throw an error because it was not expected to close", function* () {
      yield* until(
        expect(task).resolves.toHaveProperty("name", "DaemonExitError"),
      );
    });
  });
});
