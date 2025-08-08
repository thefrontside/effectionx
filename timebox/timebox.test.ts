import { describe, it } from "bdd";
import { expect } from "expect";
import { timebox } from "./mod.ts";
import { type Operation, run, sleep, suspend } from "effection";

describe("timebox", () => {
  it("is completed if operation returns within alloted time", async () => {
    let outcome = await run(() => timebox(100, delayed(5, () => "hello")));
    outcome.timeout;
    expect(outcome).toMatchObject({
      timeout: false,
      value: "hello",
    });
  });

  it("is completed if operation throws within alloted time", async () => {
    let task = run(() =>
      timebox(
        100,
        delayed(5, () => {
          throw new Error("boom!");
        }),
      )
    );
    await expect(task).rejects.toMatchObject({
      message: "boom!",
    });
  });

  it("is timed out if operation does not return within alloted time", async () => {
    await expect(run(() => timebox(10, suspend))).resolves.toMatchObject({
      timeout: true,
    });
  });
});

function delayed<T>(delayMS: number, value: () => T): () => Operation<T> {
  return function* () {
    yield* sleep(delayMS);
    return value();
  };
}
