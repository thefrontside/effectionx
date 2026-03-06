/**
 * Smoke test to verify project scaffolding works.
 */

import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { ReplayIndex, InMemoryStream } from "./mod.ts";
import type { DurableEvent } from "./mod.ts";

describe("smoke tests", () => {
  it("ReplayIndex can be constructed with empty events", function* () {
    const index = new ReplayIndex([]);
    expect(index.peekYield("root")).toBeUndefined();
    expect(index.hasClose("root")).toBe(false);
    expect(index.isFullyReplayed("root")).toBe(false);
  });

  it("InMemoryStream starts empty", function* () {
    const stream = new InMemoryStream();
    expect(stream.snapshot()).toEqual([]);
  });

  it("InMemoryStream stores and retrieves events", function* () {
    const stream = new InMemoryStream();
    const event: DurableEvent = {
      type: "yield",
      coroutineId: "root.0",
      description: { type: "call", name: "fetchOrder" },
      result: { status: "ok", value: 42 },
    };
    yield* stream.append(event);
    const events = stream.snapshot();
    expect(events.length).toBe(1);
    expect(events[0]).toEqual(event);
    expect(stream.appendCount).toBe(1);
  });
});
