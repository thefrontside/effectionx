import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "@effectionx/bdd";
import { each } from "effection";
import { expect } from "expect";

import { fromReadable } from "./readable.ts";

describe("fromReadable", () => {
  it("reads a file stream", function* () {
    const fixturePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "test/fixtures/sample.txt",
    );
    const fileStream = fs.createReadStream(fixturePath);
    const stream = fromReadable(fileStream);

    const chunks: Uint8Array[] = [];
    for (const chunk of yield* each(stream)) {
      chunks.push(chunk);
      yield* each.next();
    }

    const content = new TextDecoder().decode(
      new Uint8Array(chunks.flatMap((c) => [...c])),
    );
    expect(content).toBe("hello world\n");
  });

  it("handles stream end", function* () {
    const fixturePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "test/fixtures/sample.txt",
    );
    const fileStream = fs.createReadStream(fixturePath);
    const stream = fromReadable(fileStream);
    const subscription = yield* stream;

    // Read until done
    let result = yield* subscription.next();
    while (!result.done) {
      result = yield* subscription.next();
    }

    expect(result.done).toBe(true);
    expect(result.value).toBeUndefined();
  });
});
