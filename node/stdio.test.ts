import { Readable } from "node:stream";
import { describe, it } from "@effectionx/vitest";
import { each } from "effection";
import { expect } from "expect";

import { Stdio, stderr, stdin, stdout } from "./stdio.ts";
import { fromReadable } from "./stream.ts";

describe("@effectionx/node/stdio", () => {
  it("captures stdout through middleware", function* () {
    const captured: Uint8Array[] = [];
    yield* Stdio.around({
      *stdout([bytes]) {
        captured.push(bytes);
      },
    });

    yield* stdout(new TextEncoder().encode("hello"));

    expect(captured).toHaveLength(1);
    expect(new TextDecoder().decode(captured[0])).toBe("hello");
  });

  it("captures stderr through middleware", function* () {
    const captured: Uint8Array[] = [];
    yield* Stdio.around({
      *stderr([bytes]) {
        captured.push(bytes);
      },
    });

    yield* stderr(new TextEncoder().encode("oops"));

    expect(captured).toHaveLength(1);
    expect(new TextDecoder().decode(captured[0])).toBe("oops");
  });

  it("substitutes stdin through middleware", function* () {
    yield* Stdio.around({
      stdin() {
        return fromReadable(Readable.from([Buffer.from("mocked")]));
      },
    });

    const chunks: Uint8Array[] = [];
    for (const chunk of yield* each(stdin())) {
      chunks.push(chunk);
      yield* each.next();
    }

    const received = new TextDecoder().decode(Buffer.concat(chunks));
    expect(received).toBe("mocked");
  });
});
