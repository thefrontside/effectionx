import { run, createSignal, sleep } from 'effection';
import { describe, it } from "jsr:@std/testing@^1/bdd";
import { expect } from "jsr:@std/expect@^1";
import { batch } from './batch.ts';

describe("batch", () => {
  it('respects maxTime', async () => {
    await run(function*() {
      const signal = createSignal<number>();
      const stream = batch({ maxTime: 5 })(signal);

      const subscription = yield* stream;

      signal.send(1);
      signal.send(2);
      signal.send(3);

      yield* sleep(10);

      let next = yield* subscription.next();
      expect(next.value).toEqual([1, 2, 3])
    });
  });
  it('respects maxSize', async () => {
    await run(function*() {
      const signal = createSignal<number>();
      const stream = batch({ maxSize: 3 })(signal);

      const subscription = yield* stream;

      signal.send(1);
      signal.send(2);
      signal.send(3);
      signal.send(4);
      signal.send(5);
      signal.send(6);

      let next = yield* subscription.next();
      expect(next.value).toEqual([1, 2, 3]);

      next = yield* subscription.next();
      expect(next.value).toEqual([4, 5, 6]);
    });
  });
});