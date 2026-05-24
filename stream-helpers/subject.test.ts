import {
  createChannel,
  createSignal,
  type Operation,
  scoped,
  type Stream,
  type Subscription,
} from "effection";
import { beforeEach, describe, it } from "@effectionx/vitest";
import { expect } from "expect";

import { createSubject } from "./subject.ts";

function* next<T, TClose>(
  subscription: Subscription<T, TClose>,
): Operation<T | TClose> {
  const item = yield* subscription.next();
  if (item.done) {
    return item.value;
  }
  return item.value;
}

describe("subject", () => {
  let subject = createSubject<number>();
  let upstream = createChannel<number, string>();
  let downstream: Stream<number, string>;

  beforeEach(function* () {
    subject = createSubject();

    upstream = createChannel();

    downstream = yield* subject(upstream);
  });

  it("allows multiple subscribers", function* () {
    const subscriber1 = yield* downstream;
    const subscriber2 = yield* downstream;

    yield* upstream.send(1);
    yield* upstream.send(2);

    // 1 multicast to both
    expect(yield* next(subscriber1)).toEqual(1);
    expect(yield* next(subscriber2)).toEqual(1);

    // 2 multicast to both
    expect(yield* next(subscriber1)).toEqual(2);
    expect(yield* next(subscriber2)).toEqual(2);
  });

  it("each later subscribers get latest value", function* () {
    const subscriber1 = yield* downstream;
    yield* upstream.send(1);
    expect(yield* next(subscriber1)).toEqual(1);

    yield* upstream.send(2);
    expect(yield* next(subscriber1)).toEqual(2);

    const subscriber2 = yield* downstream;
    expect(yield* next(subscriber2)).toEqual(2);
  });

  it("sends closing value to all subscribers", function* () {
    const subscriber1 = yield* downstream;
    const subscriber2 = yield* downstream;

    yield* upstream.send(1);
    yield* upstream.close("bye");

    // 1 multicast to both
    expect(yield* next(subscriber1)).toEqual(1);
    expect(yield* next(subscriber2)).toEqual(1);

    // 2 multicast to both
    expect(yield* next(subscriber1)).toEqual("bye");
    expect(yield* next(subscriber2)).toEqual("bye");
  });

  it("yields initial value to first subscriber before any upstream values", function* () {
    subject = createSubject(42);
    downstream = yield* subject(upstream);

    const subscriber = yield* downstream;
    expect(yield* next(subscriber)).toEqual(42);

    yield* upstream.send(1);
    expect(yield* next(subscriber)).toEqual(1);
  });

  it("yields upstream value to late subscriber once upstream has sent", function* () {
    subject = createSubject(42);
    downstream = yield* subject(upstream);

    const subscriber1 = yield* downstream;
    expect(yield* next(subscriber1)).toEqual(42);

    yield* upstream.send(1);
    expect(yield* next(subscriber1)).toEqual(1);

    const subscriber2 = yield* downstream;
    expect(yield* next(subscriber2)).toEqual(1);
  });

  it("subscriber after close receives last value and close value", function* () {
    const subscriber1 = yield* downstream;

    yield* upstream.send(1);
    yield* upstream.close("bye");

    // First subscriber gets value and close
    expect(yield* next(subscriber1)).toEqual(1);
    expect(yield* next(subscriber1)).toEqual("bye");

    // Late subscriber after close should get last value and close value
    const subscriber2 = yield* downstream;
    expect(yield* next(subscriber2)).toEqual("bye");
  });

  it("tracks latest value even when no subscriber has pulled", function* () {
    const source = createSignal<number, string>();
    downstream = yield* createSubject<number>(0)(source);

    const sub1 = yield* downstream;
    expect(yield* next(sub1)).toEqual(0);

    // Upstream emits — sub1 does NOT pull these
    source.send(1);
    source.send(2);

    // Late subscriber gets latest, not initial
    const sub2 = yield* downstream;
    expect(yield* next(sub2)).toEqual(2);
  });

  it("continues tracking after first subscriber exits", function* () {
    const source = createSignal<number, string>();
    downstream = yield* createSubject<number>()(source);

    // First subscriber in a scoped block — exits after reading
    yield* scoped(function* () {
      const sub = yield* downstream;
      source.send(1);
      expect(yield* next(sub)).toEqual(1);
    });
    // sub's scope is gone, but drain lives in the resource scope

    source.send(2);

    // New subscriber still works
    const sub2 = yield* downstream;
    expect(yield* next(sub2)).toEqual(2);
  });
});
