import { describe, it } from "@effectionx/bdd";
import { assert } from "@std/assert";
import { expect } from "@std/expect";
import { emptyDir } from "@std/fs/empty-dir";
import { fromFileUrl } from "@std/path";

import type { Operation, Result, Stream } from "effection";
import { each, Ok, sleep, spawn, until } from "effection";

describe("watch", () => {
  it("restarts the specified process when files change.", function* () {
    let fixture = yield* useFixture();
    let processes = yield* inspector(
      watch({
        path: fixture.path,
        cmd: `cat ${fixture.getPath("src/file.txt")}`,
        event: "change",
      }),
    );

    let start = yield* processes.expectNext();

    let exit = yield* start.process.join();

    expect(exit.code).toEqual(0);

    expect(start.stdout).toEqual("this is a source file");

    yield* fixture.write("src/file.txt", "this source file is changed");

    let next = yield* processes.expectNext();

    expect(next.stdout).toEqual("this source file is changed");
  });

  it("ignores files in .gitignore", function* () {
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
        cmd: `deno run -A watch-graceful.ts`,
        execOptions: {
          cwd: import.meta.dirname,
          shell: true,
        },
      }),
    );

    let first = yield* processes.expectNext();

    yield* fixture.write("src/file.txt", "hello planet");

    yield* processes.expectNext();

    expect(first.stdout).toEqual("done\n");
  });

  // start an example that prints "done" to the console upon SIGINT);

  it.skip("allows for a hard kill ", function* () {
    // start an example that will suspend asked to exit and so will
    // never exit.
    // send the command to exit the watch and the main returns
  });
});

import type { Process } from "@effectionx/process";
import { ensureDir } from "@std/fs/ensure-dir";
import { dirname, join } from "@std/path";
import { cp, readFile, writeFile } from "node:fs/promises";
import { type Start, watch } from "../watch.ts";

interface Fixture {
  path: string;
  getPath(filename: "src/file.txt" | "dist/artifact.txt"): string;
  read(name: "src/file.txt"): Operation<string>;
  write(
    filename: "src/file.txt" | "dist/artifact.txt",
    content: string,
  ): Operation<void>;
}

function* useFixture(): Operation<Fixture> {
  let tmpDir = fromFileUrl(new URL("./temp", import.meta.url));
  let fixtureDir = fromFileUrl(new URL("./fixtures", import.meta.url));
  // let path = join(tmpDir, "fixtures");
  let path = tmpDir;
  try {
    yield* until(emptyDir(tmpDir));
  } catch (e) {
    console.log(`Encountered error clearing ${tmpDir}`)
    console.error(e);
  }

  try {
    yield* until(
      cp(fixtureDir, tmpDir, {
        recursive: true,
        preserveTimestamps: true,
        force: true,
      }),
    );
  } catch (e) {
    console.log(`Encountered error copying from ${fixtureDir} to ${tmpDir}`)
    console.error(e)
  }

  return {
    path,
    getPath(filename): string {
      return join(path, filename);
    },
    *write(filename: string, content: string) {
      const dest = join(path, filename);
      yield* until(ensureDir(dirname(dest)));
      yield* until(writeFile(join(path, filename), content));
    },
    *read(name) {
      return String(yield* until(readFile(join(path, name))));
    },
  };
}

type SuccessfulStart = {
  stdout: string;
  stderr: string;
  process: Process;
};

type ProcessStart = Result<SuccessfulStart>;

function* inspector(stream: Stream<Start, never>) {
  let starts: ProcessStart[] = [];

  let expected = 0;

  yield* spawn(function* () {
    for (let { result } of yield* each(stream)) {
      if (result.ok) {
        let process = result.value;
        let start = {
          stdout: "",
          stderr: "",
          process: result.value,
        };
        starts.push(Ok(start));
        yield* spawn(function* () {
          for (let chunk of yield* each(process.stdout)) {
            start.stdout += String(chunk);
            yield* each.next();
          }
        });
        yield* spawn(function* () {
          for (let chunk of yield* each(process.stderr)) {
            start.stderr += String(chunk);
            yield* each.next();
          }
        });
      } else {
        starts.push(result);
      }

      yield* each.next();
    }
  });

  let inspector = {
    starts,
    *expectNext(): Operation<SuccessfulStart> {
      let initial = expected;
      for (let i = 0; i < 500; i++) {
        if (initial < starts.length) {
          yield* sleep(10);
          expected = starts.length;
          let result = inspector.starts[inspector.starts.length - 1];
          if (result.ok) {
            return result.value;
          } else {
            throw new Error(
              `expected successful start, but failed: ${result.error}`,
            );
          }
        } else {
          yield* sleep(10);
        }
      }
      throw new Error(`expecting a sucessful start but it never appeared.`);
    },
    *expectNoRestart() {
      let prexisting = inspector.starts.length;
      yield* sleep(200);
      let restarts = inspector.starts.length - prexisting;
      assert(
        restarts === 0,
        `expected no process restarts to have happened, but instead there were: ${restarts}`,
      );
    },
  };
  return inspector;
}
