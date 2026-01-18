import assert from "node:assert";
import { describe, it } from "@effectionx/bdd";
import { sleep, spawn } from "effection";
import { expect } from "expect";

import { always, when } from "./mod.ts";

describe("@effectionx/converge", () => {
  describe("when", () => {
    it("resolves when the assertion passes within the timeout", function* () {
      let total = 0;
      yield* spawn(function* () {
        yield* sleep(30);
        total = 5;
      });

      let start = Date.now();
      let stats = yield* when(
        function* () {
          if (total !== 5) throw new Error(`expected 5, got ${total}`);
          return total;
        },
        { timeout: 100 },
      );

      expect(Date.now() - start).toBeGreaterThanOrEqual(30);
      expect(Date.now() - start).toBeLessThan(100);
      expect(stats.value).toEqual(5);
    });

    it("rejects when the assertion does not pass within the timeout", function* () {
      let total = 0;

      let start = Date.now();
      try {
        yield* when(
          function* () {
            if (total !== 5) throw new Error(`expected 5, got ${total}`);
          },
          { timeout: 50 },
        );
        assert.fail("should have thrown");
      } catch (e) {
        expect((e as Error).message).toEqual("expected 5, got 0");
      }
      expect(Date.now() - start).toBeGreaterThanOrEqual(50);
      expect(Date.now() - start).toBeLessThan(80);
    });

    it("resolves immediately if assertion passes on first try", function* () {
      let start = Date.now();
      let stats = yield* when(
        function* () {
          return 42;
        },
        { timeout: 100 },
      );

      expect(Date.now() - start).toBeLessThan(20);
      expect(stats.value).toEqual(42);
      expect(stats.runs).toEqual(1);
    });

    it("resolves with a stats object", function* () {
      let total = 0;
      yield* spawn(function* () {
        yield* sleep(30);
        total = 5;
      });

      let start = Date.now();
      let stats = yield* when(
        function* () {
          if (total !== 5) throw new Error("expected 5");
          return total * 100;
        },
        { timeout: 100, interval: 10 },
      );
      let end = Date.now();

      expect(stats.start).toBeGreaterThanOrEqual(start);
      expect(stats.start).toBeLessThanOrEqual(start + 5);
      expect(stats.end).toBeGreaterThanOrEqual(end - 5);
      expect(stats.end).toBeLessThanOrEqual(end);
      expect(stats.elapsed).toBeGreaterThanOrEqual(30);
      expect(stats.elapsed).toBeLessThan(100);
      expect(stats.runs).toBeGreaterThanOrEqual(3);
      expect(stats.timeout).toEqual(100);
      expect(stats.interval).toEqual(10);
      expect(stats.value).toEqual(500);
    });

    describe("when the assertion returns false", () => {
      it("rejects if false was continually returned", function* () {
        try {
          yield* when(
            function* () {
              return false;
            },
            { timeout: 50 },
          );
          assert.fail("should have thrown");
        } catch (e) {
          expect((e as Error).message).toEqual(
            "convergent assertion returned `false`",
          );
        }
      });

      it("resolves when false is no longer returned", function* () {
        let total = 0;
        yield* spawn(function* () {
          yield* sleep(30);
          total = 10;
        });

        let stats = yield* when(
          function* () {
            return total >= 10;
          },
          { timeout: 100 },
        );

        expect(stats.value).toEqual(true);
      });
    });

    it("uses the configured interval", function* () {
      let runs = 0;
      yield* spawn(function* () {
        yield* sleep(50);
      });

      try {
        yield* when(
          function* () {
            runs++;
            throw new Error("always fail");
          },
          { timeout: 50, interval: 20 },
        );
      } catch {
        // expected
      }

      // With 50ms timeout and 20ms interval, we should get ~3 runs
      expect(runs).toBeGreaterThanOrEqual(2);
      expect(runs).toBeLessThanOrEqual(4);
    });

    it("uses default timeout of 2000ms", function* () {
      let stats = yield* when(function* () {
        return 42;
      });

      expect(stats.timeout).toEqual(2000);
    });

    it("uses default interval of 10ms", function* () {
      let stats = yield* when(function* () {
        return 42;
      });

      expect(stats.interval).toEqual(10);
    });
  });

  describe("always", () => {
    it("resolves if the assertion does not fail throughout the timeout", function* () {
      let total = 5;

      let start = Date.now();
      let stats = yield* always(
        function* () {
          if (total !== 5) throw new Error("expected 5");
          return total;
        },
        { timeout: 50 },
      );

      expect(Date.now() - start).toBeGreaterThanOrEqual(50);
      expect(stats.value).toEqual(5);
    });

    it("rejects immediately when the assertion fails within the timeout", function* () {
      let total = 5;
      yield* spawn(function* () {
        yield* sleep(30);
        total = 0;
      });

      let start = Date.now();
      try {
        yield* always(
          function* () {
            if (total !== 5) throw new Error(`expected 5, got ${total}`);
          },
          { timeout: 100 },
        );
        assert.fail("should have thrown");
      } catch (e) {
        expect((e as Error).message).toEqual("expected 5, got 0");
      }

      // Should fail around 30ms, not wait until 100ms
      expect(Date.now() - start).toBeGreaterThanOrEqual(30);
      expect(Date.now() - start).toBeLessThan(60);
    });

    it("resolves with a stats object", function* () {
      let total = 5;

      let start = Date.now();
      let stats = yield* always(
        function* () {
          if (total !== 5) throw new Error("expected 5");
          return total * 10;
        },
        { timeout: 50, interval: 10 },
      );
      let end = Date.now();

      expect(stats.start).toBeGreaterThanOrEqual(start);
      expect(stats.start).toBeLessThanOrEqual(start + 5);
      expect(stats.end).toBeGreaterThanOrEqual(end - 5);
      expect(stats.end).toBeLessThanOrEqual(end);
      expect(stats.elapsed).toBeGreaterThanOrEqual(50);
      expect(stats.runs).toBeGreaterThanOrEqual(4); // ~50ms / 10ms interval = ~5 runs, allow for timing variance
      expect(stats.timeout).toEqual(50);
      expect(stats.interval).toEqual(10);
      expect(stats.value).toEqual(50);
    });

    describe("when the assertion returns false", () => {
      it("resolves if false was never returned", function* () {
        let total = 5;

        let stats = yield* always(
          function* () {
            return total < 10;
          },
          { timeout: 50 },
        );

        expect(stats.value).toEqual(true);
      });

      it("rejects when false is returned", function* () {
        let total = 5;
        yield* spawn(function* () {
          yield* sleep(30);
          total = 10;
        });

        try {
          yield* always(
            function* () {
              return total < 10;
            },
            { timeout: 100 },
          );
          assert.fail("should have thrown");
        } catch (e) {
          expect((e as Error).message).toEqual(
            "convergent assertion returned `false`",
          );
        }
      });
    });

    it("uses default timeout of 200ms", function* () {
      let stats = yield* always(function* () {
        return 42;
      });

      expect(stats.timeout).toEqual(200);
    });

    it("uses default interval of 10ms", function* () {
      let stats = yield* always(function* () {
        return 42;
      });

      expect(stats.interval).toEqual(10);
    });

    it("uses the configured interval", function* () {
      let runs = 0;

      let stats = yield* always(
        function* () {
          runs++;
          return true;
        },
        { timeout: 50, interval: 20 },
      );

      // With 50ms timeout and 20ms interval, we should get ~3 runs
      expect(stats.runs).toBeGreaterThanOrEqual(2);
      expect(stats.runs).toBeLessThanOrEqual(4);
    });
  });
});
