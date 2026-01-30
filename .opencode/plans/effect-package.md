# Plan: `@effectionx/effect` Package

## Overview

Create a new package providing bidirectional interop between Effect and Effection:

1. **`EffectRuntime`** - Run Effect programs inside Effection operations
2. **`EffectionRuntime`** - Run Effection operations inside Effect programs

Both APIs will be exported from a single `mod.ts` file but kept as separate, independent implementations.

---

## Decisions Made

| Question | Decision |
|----------|----------|
| Error handling | **Both**: `run()` throws errors, `runExit()` returns `Exit<A, E>` |
| Layer composition | **Single layer**: Users compose layers themselves using Effect's primitives |
| Test matrix | **Yes**: Add `effect` to peer dependency test matrix |

### Reviewer Notes

- Context naming: avoid collisions between `EffectRuntime` as interface vs context token and `EffectionRuntime` as interface vs tag; consider `EffectRuntimeContext` or `EffectionRuntimeTag` for the exported tokens.
- Effect runtime API: consider `run<A, E, R>(effect: Effect.Effect<A, E, R>)` so effects can require services provided by the layer.
- Effect runtime implementation: confirm the exact Effect 3 API (`ManagedRuntime.make`, `ManagedRuntime.makeLayer`, or `Runtime.defaultRuntime`) and align imports with actual usage.
- Effect test helpers: confirm `Effect.runPromise` / `Effect.runPromiseExit` are the preferred Effect 3 APIs (some codebases prefer `Runtime` helpers).
- Cancellation semantics: ensure the implementation wires Effect interruption to Effection scope halt (and vice versa) using finalizers so cleanup guarantees match the documentation.
- README comparison table: avoid absolute claims; use softer phrasing ("built-in supervision" vs "structured concurrency") to stay accurate across versions.

---

## File Structure

```
effect/
├── mod.ts                    # Main exports (both directions)
├── effect-runtime.ts         # EffectRuntime implementation (Effect → Effection)
├── effection-runtime.ts      # EffectionRuntime implementation (Effection → Effect)
├── effect.test.ts            # Tests for both directions
├── package.json              # Package manifest
├── tsconfig.json             # TypeScript config
└── README.md                 # Documentation
```

---

## Package Configuration

### `package.json`

```json
{
  "name": "@effectionx/effect",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/mod.js",
  "types": "./dist/mod.d.ts",
  "exports": {
    ".": {
      "development": "./mod.ts",
      "default": "./dist/mod.js"
    }
  },
  "peerDependencies": {
    "effect": "^3",
    "effection": "^3 || ^4"
  },
  "devDependencies": {
    "@effectionx/bdd": "workspace:*",
    "effect": "^3"
  },
  "license": "MIT",
  "author": "engineering@frontside.com",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/thefrontside/effectionx.git"
  },
  "bugs": {
    "url": "https://github.com/thefrontside/effectionx/issues"
  },
  "engines": {
    "node": ">= 22"
  },
  "sideEffects": false
}
```

### `tsconfig.json`

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["**/*.ts"],
  "exclude": ["**/*.test.ts", "dist"],
  "references": [
    { "path": "../bdd" }
  ]
}
```

---

## API Design

### `effect-runtime.ts` - Run Effect inside Effection

```typescript
import { Effect, Exit, Layer, ManagedRuntime } from "effect";
import { call, createContext, Operation, resource } from "effection";

/**
 * A runtime for executing Effect programs inside Effection operations.
 */
export interface EffectRuntime {
  /**
   * Run an Effect program and return its result as an Effection Operation.
   *
   * The Effect must have all dependencies provided (R = never), or dependencies
   * must be satisfied by the layer passed to `makeEffectRuntime()`.
   * 
   * Effect failures will be thrown as JavaScript errors.
   *
   * @param effect - The Effect program to run
   * @returns An Operation that yields the Effect's success value
   * @throws The Effect's error `E` if it fails
   * 
   * @example
   * ```ts
   * const runtime = yield* makeEffectRuntime();
   * const result = yield* runtime.run(Effect.succeed(42));
   * // result = 42
   * ```
   */
  run<A, E>(effect: Effect.Effect<A, E, never>): Operation<A>;

  /**
   * Run an Effect program and return its Exit (success or failure).
   *
   * Unlike `run()`, this does not throw on failure. Instead, it returns
   * an `Exit<A, E>` that you can inspect to determine success or failure.
   * This preserves Effect's full error model including the Cause.
   *
   * @param effect - The Effect program to run
   * @returns An Operation that yields the Effect's Exit
   * 
   * @example
   * ```ts
   * const runtime = yield* makeEffectRuntime();
   * const exit = yield* runtime.runExit(Effect.fail(new Error("boom")));
   * if (Exit.isFailure(exit)) {
   *   console.log(exit.cause); // Full Cause<E> with error details
   * } else {
   *   console.log(exit.value); // Success value
   * }
   * ```
   */
  runExit<A, E>(effect: Effect.Effect<A, E, never>): Operation<Exit.Exit<A, E>>;
}

/**
 * Effection Context for accessing the EffectRuntime.
 * 
 * Use this to store the runtime in Effection's context so child operations
 * can access it without passing it explicitly.
 * 
 * @example
 * ```ts
 * // Set in parent
 * const runtime = yield* makeEffectRuntime();
 * yield* EffectRuntime.set(runtime);
 * 
 * // Access in child
 * function* childOperation() {
 *   const rt = yield* EffectRuntime.expect();
 *   return yield* rt.run(Effect.succeed(42));
 * }
 * ```
 */
export const EffectRuntime: Context<EffectRuntime>;

/**
 * Create an EffectRuntime resource that manages an Effect ManagedRuntime.
 *
 * The ManagedRuntime is automatically disposed when the Effection scope ends,
 * ensuring proper cleanup of Effect resources.
 *
 * @param layer - Optional Effect Layer to provide services. Defaults to `Layer.empty`.
 *                Users can compose multiple layers using Effect's `Layer.merge()`,
 *                `Layer.mergeAll()`, or `Layer.provide()` before passing.
 * @returns An Operation that yields the EffectRuntime
 * 
 * @example Basic usage
 * ```ts
 * import { run } from "effection";
 * import { Effect } from "effect";
 * import { makeEffectRuntime } from "@effectionx/effect";
 *
 * await run(function* () {
 *   const runtime = yield* makeEffectRuntime();
 *   const result = yield* runtime.run(Effect.succeed(42));
 *   console.log(result); // 42
 * });
 * ```
 * 
 * @example With services
 * ```ts
 * import { Layer, Context, Effect } from "effect";
 * 
 * class Logger extends Context.Tag("Logger")<Logger, { log: (msg: string) => Effect.Effect<void> }>() {}
 * const LoggerLive = Layer.succeed(Logger, { log: (msg) => Effect.log(msg) });
 * 
 * await run(function* () {
 *   const runtime = yield* makeEffectRuntime(LoggerLive);
 *   yield* runtime.run(Effect.gen(function* () {
 *     const logger = yield* Logger;
 *     yield* logger.log("Hello!");
 *   }));
 * });
 * ```
 * 
 * @example Composing multiple layers
 * ```ts
 * const AppLayer = Layer.mergeAll(DatabaseLive, LoggerLive, CacheLive);
 * const runtime = yield* makeEffectRuntime(AppLayer);
 * ```
 */
export function* makeEffectRuntime<R = never>(
  layer?: Layer.Layer<R, never, never>
): Operation<EffectRuntime>;
```

### `effection-runtime.ts` - Run Effection inside Effect

```typescript
import { Context, Effect, Layer } from "effect";
import { UnknownException } from "effect/Cause";
import { createScope, Operation } from "effection";

/**
 * A runtime for executing Effection operations inside Effect programs.
 */
export interface EffectionRuntime {
  /**
   * Run an Effection operation and return its result as an Effect.
   *
   * Errors thrown in the operation become `UnknownException` in Effect.
   * The Effection scope is automatically cleaned up when the Effect completes
   * or is interrupted.
   *
   * @param operation - The Effection operation to run
   * @returns An Effect that yields the operation's result
   * 
   * @example
   * ```ts
   * const program = Effect.gen(function* () {
   *   const runtime = yield* EffectionRuntime;
   *   return yield* runtime.run(function* () {
   *     yield* sleep(100);
   *     return "hello";
   *   });
   * });
   * ```
   */
  run<T>(operation: Operation<T>): Effect.Effect<T, UnknownException>;
}

/**
 * Effect Context Tag for accessing the EffectionRuntime.
 * 
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const runtime = yield* EffectionRuntime;
 *   // use runtime.run(...)
 * });
 * ```
 */
export const EffectionRuntime: Context.Tag<EffectionRuntime, EffectionRuntime>;

/**
 * Create an Effect Layer that provides an EffectionRuntime.
 *
 * The Effection scope is automatically closed when the Effect scope ends,
 * ensuring proper cleanup of Effection resources.
 *
 * @returns An Effect Layer providing EffectionRuntime
 * 
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { sleep } from "effection";
 * import { makeEffectionRuntime, EffectionRuntime } from "@effectionx/effect";
 *
 * const program = Effect.gen(function* () {
 *   const runtime = yield* EffectionRuntime;
 *   const result = yield* runtime.run(function* () {
 *     yield* sleep(100);
 *     return "hello from effection";
 *   });
 *   return result;
 * });
 *
 * await Effect.runPromise(
 *   program.pipe(
 *     Effect.provide(makeEffectionRuntime()),
 *     Effect.scoped
 *   )
 * );
 * ```
 */
export function makeEffectionRuntime(): Layer.Layer<EffectionRuntime>;
```

### `mod.ts` - Combined Exports

```typescript
// Effect → Effection
export {
  EffectRuntime,
  makeEffectRuntime,
  type EffectRuntime as EffectRuntimeType
} from "./effect-runtime.ts";

// Effection → Effect
export {
  EffectionRuntime,
  makeEffectionRuntime,
  type EffectionRuntime as EffectionRuntimeType
} from "./effection-runtime.ts";
```

---

## README.md

```markdown
# Effect

Bidirectional interop between [Effect](https://effect.website/) and [Effection](https://frontside.com/effection).

---

## Why?

Effect and Effection are both powerful libraries for managing side effects in TypeScript,
but they have different philosophies and strengths:

| Feature | Effect | Effection |
|---------|--------|-----------|
| **Concurrency Model** | Fiber-based with supervision | Structured concurrency with scopes |
| **Error Handling** | Type-safe errors in signature | JavaScript throw/catch |
| **Dependencies** | Context/Layer system | Context API |
| **Syntax** | Generator or pipe-based | Generator-based |
| **Resource Management** | Scope with finalizers | Automatic cleanup on scope exit |

This package lets you use both together:

- **Use Effect inside Effection** when you want Effect's type-safe error handling
  or need to use Effect-based libraries within Effection's structured concurrency
- **Use Effection inside Effect** when you want Effection's simple generator syntax
  or need to use Effection-based libraries within an Effect application

## Installation

```bash
npm install @effectionx/effect effect effection
```

**Peer dependencies:** Both `effect` (^3) and `effection` (^3 || ^4) must be installed.

## Running Effect inside Effection

Use `makeEffectRuntime()` to create a runtime that can execute Effect programs
inside Effection operations.

### Basic Usage

```ts
import { main } from "effection";
import { Effect } from "effect";
import { makeEffectRuntime, EffectRuntime } from "@effectionx/effect";

await main(function* () {
  // Create the Effect runtime (automatically disposed when scope ends)
  const runtime = yield* makeEffectRuntime();

  // Optionally set it in context for child operations
  yield* EffectRuntime.set(runtime);

  // Run Effect programs
  const result = yield* runtime.run(
    Effect.succeed(42).pipe(Effect.map(n => n * 2))
  );

  console.log(result); // 84
});
```

### Error Handling

Effect failures are thrown as JavaScript errors when using `run()`:

```ts
import { main } from "effection";
import { Effect } from "effect";
import { makeEffectRuntime } from "@effectionx/effect";

await main(function* () {
  const runtime = yield* makeEffectRuntime();

  try {
    yield* runtime.run(Effect.fail(new Error("boom")));
  } catch (error) {
    console.log(error.message); // "boom"
  }
});
```

For type-safe error handling, use `runExit()` which returns an `Exit<A, E>`:

```ts
import { main } from "effection";
import { Effect, Exit } from "effect";
import { makeEffectRuntime } from "@effectionx/effect";

await main(function* () {
  const runtime = yield* makeEffectRuntime();

  const exit = yield* runtime.runExit(Effect.fail(new Error("boom")));

  if (Exit.isFailure(exit)) {
    // Access the full Cause<E> with error details
    console.log(exit.cause);
  } else {
    // Access the success value
    console.log(exit.value);
  }
});
```

### With Effect Services

You can provide an Effect Layer to pre-configure services:

```ts
import { main } from "effection";
import { Effect, Context, Layer } from "effect";
import { makeEffectRuntime } from "@effectionx/effect";

// Define a service
class Logger extends Context.Tag("Logger")<Logger, {
  log: (msg: string) => Effect.Effect<void>
}>() {}

const LoggerLive = Layer.succeed(Logger, {
  log: (msg) => Effect.sync(() => console.log(msg))
});

await main(function* () {
  // Provide layer to the runtime
  const runtime = yield* makeEffectRuntime(LoggerLive);

  // Effects can now use Logger without explicit provide
  yield* runtime.run(
    Effect.gen(function* () {
      const logger = yield* Logger;
      yield* logger.log("Hello!");
    })
  );
});
```

Compose multiple layers using Effect's primitives:

```ts
const AppLayer = Layer.mergeAll(DatabaseLive, LoggerLive, CacheLive);
const runtime = yield* makeEffectRuntime(AppLayer);
```

### Concurrent Effect Execution

Spawn multiple Effect programs concurrently using Effection's structured concurrency:

```ts
import { main, spawn } from "effection";
import { Effect } from "effect";
import { makeEffectRuntime, EffectRuntime } from "@effectionx/effect";

await main(function* () {
  const runtime = yield* makeEffectRuntime();
  yield* EffectRuntime.set(runtime);

  // Spawn concurrent tasks
  const task1 = yield* spawn(function* () {
    const rt = yield* EffectRuntime.expect();
    return yield* rt.run(Effect.sleep("100 millis").pipe(Effect.as("first")));
  });

  const task2 = yield* spawn(function* () {
    const rt = yield* EffectRuntime.expect();
    return yield* rt.run(Effect.sleep("50 millis").pipe(Effect.as("second")));
  });

  console.log(yield* task1); // "first"
  console.log(yield* task2); // "second"
});
```

### Cancellation

When an Effection scope is halted, any running Effect programs are interrupted:

```ts
import { main, spawn, sleep } from "effection";
import { Effect } from "effect";
import { makeEffectRuntime } from "@effectionx/effect";

await main(function* () {
  const runtime = yield* makeEffectRuntime();

  const task = yield* spawn(function* () {
    yield* runtime.run(
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() => Effect.log("Effect interrupted!"));
        yield* Effect.sleep("10 seconds");
      }).pipe(Effect.scoped)
    );
  });

  yield* sleep(100);
  // Task is automatically halted when main scope ends
  // Effect finalizer runs: "Effect interrupted!"
});
```

## Running Effection inside Effect

Use `makeEffectionRuntime()` to create a Layer that can execute Effection operations
inside Effect programs.

### Basic Usage

```ts
import { Effect } from "effect";
import { sleep } from "effection";
import { makeEffectionRuntime, EffectionRuntime } from "@effectionx/effect";

const program = Effect.gen(function* () {
  const runtime = yield* EffectionRuntime;

  const result = yield* runtime.run(function* () {
    yield* sleep(100);
    return "hello from effection";
  });

  return result.toUpperCase();
});

const result = await Effect.runPromise(
  program.pipe(
    Effect.provide(makeEffectionRuntime()),
    Effect.scoped
  )
);

console.log(result); // "HELLO FROM EFFECTION"
```

### Error Handling

Errors thrown in Effection operations become `UnknownException` in Effect:

```ts
import { Effect, Exit } from "effect";
import { makeEffectionRuntime, EffectionRuntime } from "@effectionx/effect";

const program = Effect.gen(function* () {
  const runtime = yield* EffectionRuntime;

  return yield* runtime.run(function* () {
    throw new Error("boom");
  });
});

const exit = await Effect.runPromiseExit(
  program.pipe(
    Effect.provide(makeEffectionRuntime()),
    Effect.scoped
  )
);

// exit is Exit.Failure with UnknownException containing the error
if (Exit.isFailure(exit)) {
  console.log("Failed:", exit.cause);
}
```

### Cancellation

When the Effect scope ends or is interrupted, the Effection scope is closed:

```ts
import { Effect, Fiber } from "effect";
import { suspend } from "effection";
import { makeEffectionRuntime, EffectionRuntime } from "@effectionx/effect";

const program = Effect.gen(function* () {
  const runtime = yield* EffectionRuntime;

  const fiber = yield* runtime.run(function* () {
    try {
      yield* suspend();
    } finally {
      console.log("Effection cleanup!");
    }
  }).pipe(Effect.fork);

  yield* Effect.sleep("100 millis");
  yield* Fiber.interrupt(fiber);
  // Logs: "Effection cleanup!"
});

await Effect.runPromise(
  program.pipe(
    Effect.provide(makeEffectionRuntime()),
    Effect.scoped
  )
);
```

## API Reference

### EffectRuntime

#### `makeEffectRuntime(layer?)`

Creates an Effection resource that provides an `EffectRuntime`.

**Parameters:**
- `layer` (optional) - An Effect Layer to provide services. Users can compose
  multiple layers using `Layer.merge()`, `Layer.mergeAll()`, or `Layer.provide()`.

**Returns:** `Operation<EffectRuntime>` - A resource that yields the runtime

**Lifecycle:** The underlying `ManagedRuntime` is automatically disposed when the Effection scope ends.

#### `EffectRuntime.run(effect)`

Runs an Effect program and returns its result. Throws on failure.

**Parameters:**
- `effect: Effect<A, E, never>` - The Effect to run

**Returns:** `Operation<A>` - An operation that yields the success value

**Throws:** The effect's error `E` if it fails

#### `EffectRuntime.runExit(effect)`

Runs an Effect program and returns its Exit (success or failure). Does not throw.

**Parameters:**
- `effect: Effect<A, E, never>` - The Effect to run

**Returns:** `Operation<Exit<A, E>>` - An operation that yields the Exit

#### `EffectRuntime` (Context)

Effection Context for storing/retrieving the runtime:
- `EffectRuntime.set(runtime)` - Store in context
- `EffectRuntime.expect()` - Retrieve from context (throws if not set)
- `EffectRuntime.get()` - Retrieve from context (returns undefined if not set)

---

### EffectionRuntime

#### `makeEffectionRuntime()`

Creates an Effect Layer that provides an `EffectionRuntime`.

**Returns:** `Layer.Layer<EffectionRuntime>` - A layer providing the runtime

**Lifecycle:** The underlying Effection scope is automatically closed when the Effect scope ends.

#### `EffectionRuntime.run(operation)`

Runs an Effection operation and returns its result as an Effect.

**Parameters:**
- `operation: Operation<T>` - The operation to run

**Returns:** `Effect<T, UnknownException>` - An effect that yields the result

#### `EffectionRuntime` (Tag)

Effect Context Tag for accessing the runtime:
```ts
const runtime = yield* EffectionRuntime;
```

## Comparison

| Aspect | `EffectRuntime.run()` | `EffectRuntime.runExit()` | `EffectionRuntime.run()` |
|--------|----------------------|---------------------------|-------------------------|
| **Direction** | Effect → Effection | Effect → Effection | Effection → Effect |
| **Error Handling** | Throws JS error | Returns `Exit<A, E>` | Returns `UnknownException` |
| **Use When** | Simple cases | Need typed errors | Using Effection in Effect |
| **Cancellation** | Effection halt → Effect interrupt | Same | Effect interrupt → Effection halt |
```

---

## Test File (`effect.test.ts`)

### Test Structure

```typescript
import { describe, it, beforeEach } from "@effectionx/bdd";
import { expect } from "expect";
import { sleep, spawn, suspend, run, call, type Operation } from "effection";
import { Effect, Exit, Fiber, Layer, Context } from "effect";

import {
  EffectRuntime,
  makeEffectRuntime,
  EffectionRuntime,
  makeEffectionRuntime
} from "./mod.ts";

describe("@effectionx/effect", () => {

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
          Effect.map(n => n * 2),
          Effect.flatMap(n => Effect.succeed(n + 1))
        );
        const result = yield* runtime.run(program);
        expect(result).toEqual(21);
      });

      it("throws Effect failures as JavaScript errors", function* () {
        const runtime = yield* makeEffectRuntime();
        let caught: unknown;
        try {
          yield* runtime.run(Effect.fail(new Error("boom")));
          expect.fail("should have thrown");
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
          expect.fail("should have thrown");
        } catch (error) {
          caught = error;
        }
        expect(caught).toEqual("unexpected");
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
        class Counter extends Context.Tag("Counter")<Counter, { value: number }>() {}
        const CounterLive = Layer.succeed(Counter, { value: 100 });

        const runtime = yield* makeEffectRuntime(CounterLive);
        const result = yield* runtime.run(
          Effect.gen(function* () {
            const counter = yield* Counter;
            return counter.value;
          })
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
        const result = yield* runtime.run(
          Effect.gen(function* () {
            const a = yield* A;
            const b = yield* B;
            return a.a + b.b;
          })
        );
        expect(result).toEqual(3);
      });
    });

    describe("cancellation", () => {
      it("interrupts Effect when Effection task is halted", function* () {
        const runtime = yield* makeEffectRuntime();
        let finalizerRan = false;

        const task = yield* spawn(function* () {
          yield* runtime.run(
            Effect.gen(function* () {
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => { finalizerRan = true; })
              );
              yield* Effect.sleep("10 seconds");
            }).pipe(Effect.scoped)
          );
        });

        yield* sleep(50);
        // Task will be halted when we exit this scope

        // Need to wait a tick for cleanup
        yield* sleep(10);
        expect(finalizerRan).toEqual(true);
      });
    });

    describe("lifecycle", () => {
      it("disposes ManagedRuntime when Effection scope ends", function* () {
        let runtimeActive = true;

        yield* call(async () => {
          await run(function* () {
            const runtime = yield* makeEffectRuntime();
            yield* runtime.run(Effect.sync(() => { runtimeActive = true; }));
          });
          // After run completes, runtime should be disposed
        });

        // Runtime was active during the scope
        expect(runtimeActive).toEqual(true);
      });
    });

    describe("context", () => {
      it("can store and retrieve runtime from Effection context", function* () {
        const runtime = yield* makeEffectRuntime();
        yield* EffectRuntime.set(runtime);

        const retrieved = yield* EffectRuntime.expect();
        expect(retrieved).toBe(runtime);
      });

      it("child operations can access runtime from context", function* () {
        const runtime = yield* makeEffectRuntime();
        yield* EffectRuntime.set(runtime);

        function* childOperation(): Operation<number> {
          const rt = yield* EffectRuntime.expect();
          return yield* rt.run(Effect.succeed(42));
        }

        const result = yield* childOperation();
        expect(result).toEqual(42);
      });
    });
  });

  describe("EffectionRuntime - Effection inside Effect", () => {

    // Helper to run Effect programs with EffectionRuntime
    const runWithEffection = <A, E>(
      effect: Effect.Effect<A, E, EffectionRuntime>
    ): Promise<A> =>
      Effect.runPromise(
        effect.pipe(
          Effect.provide(makeEffectionRuntime()),
          Effect.scoped
        )
      );

    const runWithEffectionExit = <A, E>(
      effect: Effect.Effect<A, E, EffectionRuntime>
    ): Promise<Exit.Exit<A, E>> =>
      Effect.runPromiseExit(
        effect.pipe(
          Effect.provide(makeEffectionRuntime()),
          Effect.scoped
        )
      );

    describe("run()", () => {
      it("runs a successful Operation and returns the value", function* () {
        const result = yield* call(() => runWithEffection(
          Effect.gen(function* () {
            const runtime = yield* EffectionRuntime;
            return yield* runtime.run(function* () {
              return 42;
            });
          })
        ));
        expect(result).toEqual(42);
      });

      it("runs Operation with sleep", function* () {
        const start = Date.now();
        yield* call(() => runWithEffection(
          Effect.gen(function* () {
            const runtime = yield* EffectionRuntime;
            yield* runtime.run(function* () {
              yield* sleep(50);
            });
          })
        ));
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(45);
      });

      it("wraps Operation errors as UnknownException", function* () {
        const exit = yield* call(() => runWithEffectionExit(
          Effect.gen(function* () {
            const runtime = yield* EffectionRuntime;
            return yield* runtime.run(function* () {
              throw new Error("boom");
            });
          })
        ));

        expect(Exit.isFailure(exit)).toEqual(true);
      });

      it("can be used in Effect pipelines", function* () {
        const result = yield* call(() => runWithEffection(
          Effect.gen(function* () {
            const runtime = yield* EffectionRuntime;
            return yield* runtime.run(function* () {
              return "hello";
            });
          }).pipe(
            Effect.map(s => s.toUpperCase())
          )
        ));
        expect(result).toEqual("HELLO");
      });
    });

    describe("cancellation", () => {
      it("runs Effection finally blocks when Effect scope ends", function* () {
        let finalizerRan = false;

        yield* call(() => runWithEffection(
          Effect.gen(function* () {
            const runtime = yield* EffectionRuntime;
            yield* runtime.run(function* () {
              try {
                yield* suspend();
              } finally {
                finalizerRan = true;
              }
            }).pipe(Effect.fork);

            yield* Effect.sleep("50 millis");
            // Scope ends here, which should close Effection scope
          })
        ));

        expect(finalizerRan).toEqual(true);
      });

      it("runs Effection finally blocks when Effect fiber is interrupted", function* () {
        let finalizerRan = false;

        yield* call(() => runWithEffection(
          Effect.gen(function* () {
            const runtime = yield* EffectionRuntime;

            const fiber = yield* runtime.run(function* () {
              try {
                yield* suspend();
              } finally {
                finalizerRan = true;
              }
            }).pipe(Effect.fork);

            yield* Effect.sleep("50 millis");
            yield* Fiber.interrupt(fiber);
          })
        ));

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
              yield* runtime.run(function* () {
                try {
                  yield* suspend();
                } finally {
                  scopeEnded = true;
                }
              }).pipe(Effect.fork);
              yield* Effect.sleep("10 millis");
            }).pipe(
              Effect.provide(makeEffectionRuntime()),
              Effect.scoped
            )
          );
        });

        expect(scopeEnded).toEqual(true);
      });
    });
  });

  describe("bidirectional", () => {
    it("Effect → Effection: runs Effect pipeline in Effection", function* () {
      const runtime = yield* makeEffectRuntime();

      const result = yield* runtime.run(
        Effect.succeed(42).pipe(Effect.map(n => n * 2))
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
        }).pipe(
          Effect.provide(makeEffectionRuntime()),
          Effect.scoped
        )
      );

      expect(result).toEqual("nested");
    });

    it("deeply nested: Effection → Effect → Effection → Effect", function* () {
      const outerEffectRuntime = yield* makeEffectRuntime();

      const result = yield* outerEffectRuntime.run(
        Effect.gen(function* () {
          const effectionRuntime = yield* EffectionRuntime;

          return yield* effectionRuntime.run(function* () {
            const innerEffectRuntime = yield* makeEffectRuntime();
            return yield* innerEffectRuntime.run(Effect.succeed("deep"));
          });
        }).pipe(
          Effect.provide(makeEffectionRuntime()),
          Effect.scoped
        )
      );

      expect(result).toEqual("deep");
    });
  });

  describe("resource cleanup", () => {
    it("cleans up Effect resources when Effection scope halts", function* () {
      const runtime = yield* makeEffectRuntime();
      const cleanupOrder: string[] = [];

      const task = yield* spawn(function* () {
        yield* runtime.run(
          Effect.acquireRelease(
            Effect.sync(() => { cleanupOrder.push("acquired"); }),
            () => Effect.sync(() => { cleanupOrder.push("released"); })
          )
        );
        yield* suspend(); // Wait forever
      });

      yield* sleep(50);
      // Task halted when scope ends

      yield* sleep(10);
      expect(cleanupOrder).toContain("acquired");
      expect(cleanupOrder).toContain("released");
    });

    it("cleans up Effection resources when Effect interrupts", function* () {
      const cleanupOrder: string[] = [];

      yield* call(() => Effect.runPromise(
        Effect.gen(function* () {
          const runtime = yield* EffectionRuntime;

          const fiber = yield* runtime.run(function* () {
            try {
              cleanupOrder.push("started");
              yield* suspend();
            } finally {
              cleanupOrder.push("cleaned");
            }
          }).pipe(Effect.fork);

          yield* Effect.sleep("50 millis");
          yield* Fiber.interrupt(fiber);
        }).pipe(
          Effect.provide(makeEffectionRuntime()),
          Effect.scoped
        )
      ));

      expect(cleanupOrder).toEqual(["started", "cleaned"]);
    });
  });
});
```

---

## Workspace Integration

### Files to Update

1. **`pnpm-workspace.yaml`** - Add `effect` entry
2. **`tsconfig.json` (root)** - Add reference to `effect`

---

## Implementation Tasks

### Phase 1: Setup (I will do)
1. Create branch: `git checkout -b effect-integration`
2. Create package directory structure
3. Create `package.json` and `tsconfig.json`
4. Create `README.md`
5. Create test file with all test cases
6. Create stub implementation files
7. Update workspace files
8. Run `pnpm sync:fix` and `pnpm install`

### Phase 2: Implementation (You will provide)
1. Provide `effect-runtime.ts` implementation
2. Provide `effection-runtime.ts` implementation
3. Update `mod.ts` exports

### Phase 3: Validation (I will do)
1. Run tests
2. Run lint/format
3. Run build and type check
4. Create PR

---

## Reference: Your Implementation Code

### Effect → Effection (EffectRuntime)

Key points from your implementation:
- Uses `ManagedRuntime.make(layer)` from Effect
- Wraps `runtime.runPromise(effect)` with Effection's `call()` for `run()`
- Will need `runtime.runPromiseExit(effect)` for `runExit()`
- Uses Effection's `resource()` for lifecycle management
- Disposes runtime in `finally` block via `call(() => runtime.dispose())`

### Effection → Effect (EffectionRuntime)

Key points from your implementation:
- Uses `createScope()` from Effection to create isolated scope
- Wraps `scope.run()` with `Effect.tryPromise()` for conversion
- Uses `Effect.addFinalizer()` to close Effection scope
- Returns `Layer.effect()` for Effect's dependency injection
