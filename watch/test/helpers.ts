import type { Process } from "@effectionx/process";
import { assert } from "@std/assert";
import { emptyDir, ensureDir } from "@std/fs";
import { dirname, fromFileUrl, join } from "@std/path";
import type { Operation, Result, Stream } from "effection";
import { each, Ok, sleep, spawn, until } from "effection";
import { cp, readFile, writeFile } from "node:fs/promises";

import type { Start } from "../watch.ts";

export interface Fixture {
  path: string;
  getPath(filename: "src/file.txt" | "dist/artifact.txt"): string;
  read(name: "src/file.txt"): Operation<string>;
  write(
    filename: "src/file.txt" | "dist/artifact.txt",
    content: string,
  ): Operation<void>;
}

export function* useFixture(): Operation<Fixture> {
  let tmpDir = fromFileUrl(new URL("./temp", import.meta.url));
  let fixtureDir = fromFileUrl(new URL("./fixtures", import.meta.url));
  // let path = join(tmpDir, "fixtures");
  let path = tmpDir;
  try {
    yield* until(emptyDir(tmpDir));
  } catch (e) {
    console.log(`Encountered error clearing ${tmpDir}`);
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
    console.log(`Encountered error copying from ${fixtureDir} to ${tmpDir}`);
    console.error(e);
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

export function* inspector(stream: Stream<Start, never>) {
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
