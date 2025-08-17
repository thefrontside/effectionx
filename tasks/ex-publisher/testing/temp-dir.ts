import { type Operation, resource, until } from "npm:effection@3.6.0";
import { ensureFile } from "jsr:@std/fs";
import { join } from "jsr:@std/path";

function* writeFiles(
  dir: string,
  files: Record<string, string>,
): Operation<void> {
  for (const [path, content] of Object.entries(files)) {
    yield* until(ensureFile(join(dir, path)));
    yield* until(Deno.writeTextFile(join(dir, path), content));
  }
}

export interface TempDir {
  withFiles(files: Record<string, string>): Operation<void>;
  withWorkspace(
    workspace: string,
    files: Record<string, string>,
  ): Operation<void>;
  path: string;
}

export function createTempDir(
  { prefix = "ex-publisher-test-" }: { prefix?: string } = {},
): Operation<TempDir> {
  return resource(function* (provide) {
    const dir = yield* until(Deno.makeTempDir({ prefix }));

    try {
      yield* provide({
        get path() {
          return dir;
        },
        *withFiles(files: Record<string, string>) {
          yield* writeFiles(dir, files);
        },
        *withWorkspace(workspace: string, files: Record<string, string>) {
          yield* writeFiles(join(dir, workspace), files);
        },
      });
    } finally {
      yield* until(Deno.remove(dir, { recursive: true }));
    }
  });
}
