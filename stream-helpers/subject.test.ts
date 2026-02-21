import {
  createChannel,
  type Operation,
  type Stream,
  type Subscription,
} from "effection";
import { beforeEach, describe, it } from "@effectionx/bdd";
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

    downstream = subject(upstream);
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
    downstream = subject(upstream);

    const subscriber = yield* downstream;
    expect(yield* next(subscriber)).toEqual(42);

    yield* upstream.send(1);
    expect(yield* next(subscriber)).toEqual(1);
  });

  it("yields upstream value to late subscriber once upstream has sent", function* () {
    subject = createSubject(42);
    downstream = subject(upstream);

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
});
