import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { createArraySignal, is } from "@effectionx/signals";
import { forEach } from "@effectionx/stream-helpers";

import process from "node:process";
import { watch } from "../watch.ts";
import { inspector, useFixture } from "./helpers.ts";
import { spawn } from "effection";

describe("watch", () => {
  it("restarts the specified process when files change.", function* () {
    let fixture = yield* useFixture();
    let processes = yield* inspector(
      watch({
        path: fixture.path,
        cmd: `node --experimental-strip-types cat.ts`,
        event: "change",
        execOptions: {
          cwd: import.meta.dirname,
          env: {
            PATH: process.env.PATH!,
          },
          arguments: [fixture.getPath("src/file.txt")],
        },
      }),
    );

    let start = yield* processes.expectNext();

    yield* start.process.expect();

    expect(start).toMatchObject({
      stderr: "",
      stdout: "this is a source file",
    });

    yield* fixture.write("src/file.txt", "this source file is changed");

    let next = yield* processes.expectNext();

    yield* next.process.expect();

    expect(next).toMatchObject({
      stderr: "",
      stdout: "this source file is changed",
    });
  });

  it("ignores files in .gitignore", function* () {
    expect.assertions(1);
    let fixture = yield* useFixture();

    let processes = yield* inspector(
      watch({
        path: fixture.path,
        cmd: `echo hello`,
        event: "change",
      }),
    );

    //it starts the first time
    yield* processes.expectNext();

    yield* fixture.write("dist/artifact.txt", "this file was built again");

    yield* processes.expectNoRestart();

    expect(processes.starts).toHaveLength(1);
  });

  it.skip("ignores files in a .gitignore that is in a parent directory", function* () {
    // start an example in a nested directory than the git ignore
    // touch a change in an ignored file within the directory
    // enuser that there was no restart;
  });

  it("waits until stdout is closed before restarting", function* () {
    let fixture = yield* useFixture();
    let processes = yield* inspector(
      watch({
        path: fixture.path,
        cmd: `node --experimental-strip-types watch-graceful.ts`,
        execOptions: {
          cwd: import.meta.dirname,
          env: {
            PATH: process.env.PATH!,
          },
        },
      }),
    );

    const output = yield* createArraySignal<string>([]);

    let first = yield* processes.expectNext();

    yield* spawn(function* () {
      yield* forEach(function* (line) {
        output.push(`${line}`.trim());
      }, first.process.stdout);
    });

    yield* is(output, (array) => array.includes("started"));

    yield* fixture.write("src/file.txt", "hello planet");

    yield* is(output, (array) => array.includes("done"));

    yield* processes.expectNext();

    expect(output.valueOf()).toEqual(["started", "done"]);
  });

  // start an example that prints "done" to the console upon SIGINT);

  it.skip("allows for a hard kill ", function* () {
    // start an example that will suspend asked to exit and so will
    // never exit.
    // send the command to exit the watch and the main returns
  });
});
