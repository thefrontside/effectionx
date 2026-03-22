import { describe, it } from "@effectionx/bdd";
import { type Operation, resource, until } from "effection";
import { expect } from "expect";
import { build } from "esbuild";
import { inlinePlugin } from "./esbuild.ts";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("esbuild inlinePlugin", () => {
  it("transforms yield* in bundled output", function* () {
    let dir = yield* useTmpDir();
    let inputFile = path.join(dir, "input.ts");
    let outFile = path.join(dir, "output.js");

    fs.writeFileSync(
      inputFile,
      `export function* gen() {
  let x = yield* foo();
  return x;
}
`,
    );

    yield* until(
      build({
        entryPoints: [inputFile],
        outfile: outFile,
        bundle: false,
        format: "esm",
        plugins: [inlinePlugin()],
        write: true,
      }),
    );

    let output = fs.readFileSync(outFile, "utf-8");

    expect(output).toContain("$$inline");
    expect(output).toContain("@effectionx/inline");
    expect(output).not.toContain("yield*");
  });

  it("does not transform files without yield*", function* () {
    let dir = yield* useTmpDir();
    let inputFile = path.join(dir, "input.ts");
    let outFile = path.join(dir, "output.js");

    fs.writeFileSync(inputFile, `export const x = 1;\n`);

    yield* until(
      build({
        entryPoints: [inputFile],
        outfile: outFile,
        bundle: false,
        format: "esm",
        plugins: [inlinePlugin()],
        write: true,
      }),
    );

    let output = fs.readFileSync(outFile, "utf-8");

    expect(output).not.toContain("$$inline");
    expect(output).not.toContain("@effectionx/inline");
  });
});

function useTmpDir(): Operation<string> {
  return resource(function* (provide) {
    let dir = fs.mkdtempSync(path.join(os.tmpdir(), "esbuild-inline-"));
    try {
      yield* provide(dir);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
}
