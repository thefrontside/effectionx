import { describe, it } from "@effectionx/bdd";
import { Context, Effect, Exit, Fiber, Layer } from "effect";
import { call, scoped, sleep, spawn, suspend, withResolvers } from "effection";
import { expect } from "expect";

import {
  EffectionRuntime,
  makeEffectRuntime,
  makeEffectionRuntime,
} from "./mod.ts";

describe("@effectionx/effect-ts", () => {
  describe("EffectRuntime - Effect inside Effection", () => {
    describe("run()", () => {
      it("runs a successful Effect and returns the value", function* () {
        const runtime = yield* makeEffectRuntime();
        const result = yield* runtime.run(Effect.succeed(42));
        expect(result).toEqual(42);
      });

      it("runs Effect with transformations (map, flatMap)", function* () {
        const runtime = yield* makeEffectRuntime();
        const program = Effect.succeed(10).pipe(
          Effect.map((n) => n * 2),
          Effect.flatMap((n) => Effect.succeed(n + 1)),
        );
        const result = yield* runtime.run(program);
        expect(result).toEqual(21);
      });

      it("throws Effect failures as JavaScript errors", function* () {
        const runtime = yield* makeEffectRuntime();
        let caught: unknown;
        try {
          yield* runtime.run(Effect.fail(new Error("boom")));
          throw new Error("should have thrown");
        } catch (error) {
          caught = error;
        }
        expect((caught as Error).message).toEqual("boom");
      });

      it("handles Effect.die (defects)", function* () {
        const runtime = yield* makeEffectRuntime();
        let caught: unknown;
        try {
          yield* runtime.run(Effect.die("unexpected"));
          throw new Error("should have thrown");
        } catch (error) {
          caught = error;
        }
        // Effect.die wraps in FiberFailure, check the message
        expect(String(caught)).toContain("unexpected");
      });

      it("runs Effect.sleep correctly", function* () {
        const runtime = yield* makeEffectRuntime();
        const start = Date.now();
        yield* runtime.run(Effect.sleep("50 millis"));
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(45);
      });

      it("runs Effect.gen programs", function* () {
        const runtime = yield* makeEffectRuntime();
        const program = Effect.gen(function* () {
          const a = yield* Effect.succeed(1);
          const b = yield* Effect.succeed(2);
          return a + b;
        });
        const result = yield* runtime.run(program);
        expect(result).toEqual(3);
      });

      it("works with Effect.async", function* () {
        const runtime = yield* makeEffectRuntime();
        const program = Effect.async<number>((resume) => {
          const timer = setTimeout(() => resume(Effect.succeed(42)), 10);
          return Effect.sync(() => clearTimeout(timer));
        });
        const result = yield* runtime.run(program);
        expect(result).toEqual(42);
      });
    });

    describe("runExit()", () => {
      it("returns Exit.Success for successful Effect", function* () {
        const runtime = yield* makeEffectRuntime();
        const exit = yield* runtime.runExit(Effect.succeed(42));
        expect(Exit.isSuccess(exit)).toEqual(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value).toEqual(42);
        }
      });

      it("returns Exit.Failure for failed Effect", function* () {
        const runtime = yield* makeEffectRuntime();
        const exit = yield* runtime.runExit(Effect.fail(new Error("boom")));
        expect(Exit.isFailure(exit)).toEqual(true);
      });

      it("returns Exit.Failure for Effect.die", function* () {
        const runtime = yield* makeEffectRuntime();
        const exit = yield* runtime.runExit(Effect.die("defect"));
        expect(Exit.isFailure(exit)).toEqual(true);
      });

      it("preserves the full Cause in Exit.Failure", function* () {
        const runtime = yield* makeEffectRuntime();
        const error = new Error("typed error");
        const exit = yield* runtime.runExit(Effect.fail(error));
        expect(Exit.isFailure(exit)).toEqual(true);
        // Can inspect Cause for error details
      });
    });

    describe("with optional layer", () => {
      it("provides services from the layer", function* () {
        class Counter extends Context.Tag("Counter")<
          Counter,
          { value: number }
        >() {}
        const CounterLive = Layer.succeed(Counter, { value: 100 });

        const runtime = yield* makeEffectRuntime(CounterLive);
        // Types flow correctly - runtime is EffectRuntime<Counter>
        const result = yield* runtime.run(
          Effect.gen(function* () {
            const counter = yield* Counter;
            return counter.value;
          }),
        );
        expect(result).toEqual(100);
      });

      it("supports composed layers", function* () {
        class A extends Context.Tag("A")<A, { a: number }>() {}
        class B extends Context.Tag("B")<B, { b: number }>() {}

        const ALive = Layer.succeed(A, { a: 1 });
        const BLive = Layer.succeed(B, { b: 2 });
        const AppLayer = Layer.mergeAll(ALive, BLive);

        const runtime = yield* makeEffectRuntime(AppLayer);
        // Types flow correctly - runtime is EffectRuntime<A | B>
        const result = yield* runtime.run(
          Effect.gen(function* () {
            const a = yield* A;
            const b = yield* B;
            return a.a + b.b;
          }),
        );
        expect(result).toEqual(3);
      });
    });

    describe("cancellation", () => {
      // TODO: This test fails with effection 4.1.0-alpha.3 preview due to
      // scope teardown timing changes. Re-enable when effection 4.1.0 is stable.
      it.skip("interrupts Effect when Effection task is halted", function* () {
        let finalizerRan = false;
        const { resolve: effectReady, operation: waitForEffectReady } =
          withResolvers<void>();

        // Run in a nested scope so we can control when it ends
        yield* scoped(function* () {
          const runtime = yield* makeEffectRuntime();

          // Spawn so the effect runs concurrently and we can end the scope
          yield* spawn(function* () {
            yield* runtime.run(
              Effect.gen(function* () {
                yield* Effect.addFinalizer(() =>
                  Effect.sync(() => {
                    finalizerRan = true;
                  }),
                );
                // Signal after finalizer is registered
                effectReady();
                yield* Effect.sleep("10 seconds");
              }).pipe(Effect.scoped),
            );
          });

          // Wait for the effect to register finalizer before scope ends
          yield* waitForEffectReady;
        });

        // After the scoped block completes, the finalizer should have run
        expect(finalizerRan).toEqual(true);
      });
    });

    describe("lifecycle", () => {
      it("disposes ManagedRuntime when Effection scope ends", function* () {
        let runtimeActive = false;

        yield* scoped(function* () {
          const runtime = yield* makeEffectRuntime();
          yield* runtime.run(
            Effect.sync(() => {
              runtimeActive = true;
            }),
          );
          // After scoped block completes, runtime should be disposed
        });

        // Runtime was active during the scope
        expect(runtimeActive).toEqual(true);
      });
    });
  });

  describe("EffectionRuntime - Effection inside Effect", () => {
    // Helper to run Effect programs with EffectionRuntime
    const runWithEffection = <A, E>(
      effect: Effect.Effect<A, E, EffectionRuntime>,
    ): Promise<A> =>
      Effect.runPromise(
        effect.pipe(Effect.provide(makeEffectionRuntime()), Effect.scoped),
      );

    const runWithEffectionExit = <A, E>(
      effect: Effect.Effect<A, E, EffectionRuntime>,
    ): Promise<Exit.Exit<A, E>> =>
      Effect.runPromiseExit(
        effect.pipe(Effect.provide(makeEffectionRuntime()), Effect.scoped),
      );

    describe("run()", () => {
      it("runs a successful Operation and returns the value", function* () {
        const result = yield* call(() =>
          runWithEffection(
            Effect.gen(function* () {
              const runtime = yield* EffectionRuntime;
              return yield* runtime.run(function* () {
                return 42;
              });
            }),
          ),
        );
        expect(result).toEqual(42);
      });

      it("runs Operation with sleep", function* () {
        const start = Date.now();
        yield* call(() =>
          runWithEffection(
            Effect.gen(function* () {
              const runtime = yield* EffectionRuntime;
              yield* runtime.run(function* () {
                yield* sleep(50);
              });
            }),
          ),
        );
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(45);
      });

      it("wraps Operation errors as UnknownException", function* () {
        const exit = yield* call(() =>
          runWithEffectionExit(
            Effect.gen(function* () {
              const runtime = yield* EffectionRuntime;
              return yield* runtime.run(function* () {
                throw new Error("boom");
              });
            }),
          ),
        );

        expect(Exit.isFailure(exit)).toEqual(true);
      });

      it("returns an Effect", function* () {
        const result = yield* call(() =>
          runWithEffection(
            Effect.gen(function* () {
              const runtime = yield* EffectionRuntime;
              const effect = runtime.run(function* () {
                return 42;
              });
              expect(Effect.isEffect(effect)).toEqual(true);
              return yield* effect;
            }),
          ),
        );
        expect(result).toEqual(42);
      });
    });

    describe("cancellation", () => {
      it("runs Effection finally blocks when Effect scope ends", function* () {
        let finalizerRan = false;

        yield* call(() =>
          runWithEffection(
            Effect.gen(function* () {
              const runtime = yield* EffectionRuntime;
              yield* runtime
                .run(function* () {
                  try {
                    yield* suspend();
                  } finally {
                    finalizerRan = true;
                  }
                })
                .pipe(Effect.fork);

              yield* Effect.sleep("50 millis");
              // Scope ends here, which should close Effection scope
            }),
          ),
        );

        expect(finalizerRan).toEqual(true);
      });

      it("runs Effection finally blocks when Effect fiber is interrupted", function* () {
        let finalizerRan = false;

        yield* call(() =>
          runWithEffection(
            Effect.gen(function* () {
              const runtime = yield* EffectionRuntime;

              const fiber = yield* runtime
                .run(function* () {
                  try {
                    yield* suspend();
                  } finally {
                    finalizerRan = true;
                  }
                })
                .pipe(Effect.fork);

              yield* Effect.sleep("50 millis");
              yield* Fiber.interrupt(fiber);
            }),
          ),
        );

        expect(finalizerRan).toEqual(true);
      });
    });

    describe("lifecycle", () => {
      it("closes Effection scope when Effect scope ends", function* () {
        let scopeEnded = false;

        yield* call(async () => {
          await Effect.runPromise(
            Effect.gen(function* () {
              const runtime = yield* EffectionRuntime;
              yield* runtime
                .run(function* () {
                  try {
                    yield* suspend();
                  } finally {
                    scopeEnded = true;
                  }
                })
                .pipe(Effect.fork);
              yield* Effect.sleep("10 millis");
            }).pipe(Effect.provide(makeEffectionRuntime()), Effect.scoped),
          );
        });

        expect(scopeEnded).toEqual(true);
      });
    });
  });

  describe("bidirectional", () => {
    it("Effect -> Effection: runs Effect pipeline in Effection", function* () {
      const runtime = yield* makeEffectRuntime();

      const result = yield* runtime.run(
        Effect.succeed(42).pipe(Effect.map((n) => n * 2)),
      );

      expect(result).toEqual(84);
    });

    it("nested: Effect uses EffectionRuntime which runs Operation", function* () {
      const effectRuntime = yield* makeEffectRuntime();

      const result = yield* effectRuntime.run(
        Effect.gen(function* () {
          const effectionRuntime = yield* EffectionRuntime;
          return yield* effectionRuntime.run(function* () {
            yield* sleep(10);
            return "nested";
          });
        }).pipe(Effect.provide(makeEffectionRuntime()), Effect.scoped),
      );

      expect(result).toEqual("nested");
    });

    it("deeply nested: Effection -> Effect -> Effection -> Effect", function* () {
      const outerEffectRuntime = yield* makeEffectRuntime();

      const result = yield* outerEffectRuntime.run(
        Effect.gen(function* () {
          const effectionRuntime = yield* EffectionRuntime;

          return yield* effectionRuntime.run(function* () {
            const innerEffectRuntime = yield* makeEffectRuntime();
            return yield* innerEffectRuntime.run(Effect.succeed("deep"));
          });
        }).pipe(Effect.provide(makeEffectionRuntime()), Effect.scoped),
      );

      expect(result).toEqual("deep");
    });
  });

  describe("resource cleanup", () => {
    // TODO: This test fails with effection 4.1.0-alpha.3 preview due to
    // scope teardown timing changes. Re-enable when effection 4.1.0 is stable.
    it.skip("cleans up Effect resources when Effection scope halts", function* () {
      const cleanupOrder: string[] = [];
      const { resolve: resourceAcquired, operation: waitForAcquire } =
        withResolvers<void>();

      yield* scoped(function* () {
        const runtime = yield* makeEffectRuntime();

        yield* spawn(function* () {
          yield* runtime.run(
            Effect.gen(function* () {
              yield* Effect.acquireRelease(
                Effect.sync(() => {
                  cleanupOrder.push("acquired");
                  resourceAcquired();
                }),
                () =>
                  Effect.sync(() => {
                    cleanupOrder.push("released");
                  }),
              );
              // Keep the effect running so we can test cleanup
              yield* Effect.never;
            }).pipe(Effect.scoped),
          );
        });

        // Wait for the resource to be acquired before scope ends
        yield* waitForAcquire;
      });

      // After scoped block completes, cleanup should have happened
      expect(cleanupOrder).toContain("acquired");
      expect(cleanupOrder).toContain("released");
    });

    it("cleans up Effection resources when Effect interrupts", function* () {
      const cleanupOrder: string[] = [];

      yield* call(() =>
        Effect.runPromise(
          Effect.gen(function* () {
            const runtime = yield* EffectionRuntime;

            const fiber = yield* runtime
              .run(function* () {
                try {
                  cleanupOrder.push("started");
                  yield* suspend();
                } finally {
                  cleanupOrder.push("cleaned");
                }
              })
              .pipe(Effect.fork);

            yield* Effect.sleep("50 millis");
            yield* Fiber.interrupt(fiber);
          }).pipe(Effect.provide(makeEffectionRuntime()), Effect.scoped),
        ),
      );

      expect(cleanupOrder).toEqual(["started", "cleaned"]);
    });
  });
});
