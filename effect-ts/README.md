# Effect-TS

Bidirectional interop between [Effect-TS](https://effect.website/) and [Effection](https://frontside.com/effection).

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
npm install @effectionx/effect-ts effect effection
```

**Peer dependencies:** Both `effect` (^3) and `effection` (^3 || ^4) must be installed.

## Running Effect inside Effection

Use `makeEffectRuntime()` to create a runtime that can execute Effect programs
inside Effection operations.

### Basic Usage

```ts
import { main } from "effection";
import { Effect } from "effect";
import { makeEffectRuntime } from "@effectionx/effect-ts";

await main(function* () {
  // Create the Effect runtime (automatically disposed when scope ends)
  const runtime = yield* makeEffectRuntime();

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
import { makeEffectRuntime } from "@effectionx/effect-ts";

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
import { makeEffectRuntime } from "@effectionx/effect-ts";

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
import { makeEffectRuntime } from "@effectionx/effect-ts";

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

### Cancellation

When an Effection scope is halted, any running Effect programs are interrupted:

```ts
import { main, spawn, sleep } from "effection";
import { Effect } from "effect";
import { makeEffectRuntime } from "@effectionx/effect-ts";

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
import { makeEffectionRuntime, EffectionRuntime } from "@effectionx/effect-ts";

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
import { makeEffectionRuntime, EffectionRuntime } from "@effectionx/effect-ts";

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
import { makeEffectionRuntime, EffectionRuntime } from "@effectionx/effect-ts";

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

#### `makeEffectRuntime<R>(layer?)`

Creates an Effection resource that provides an `EffectRuntime<R>`.

**Type Parameters:**
- `R` - The services/context provided by the layer (inferred from `layer`)

**Parameters:**
- `layer` (optional) - An Effect Layer to provide services. Users can compose
  multiple layers using `Layer.merge()`, `Layer.mergeAll()`, or `Layer.provide()`.

**Returns:** `Operation<EffectRuntime<R>>` - A resource that yields the runtime

**Lifecycle:** The underlying `ManagedRuntime` is automatically disposed when the Effection scope ends.

**Type Safety:** The returned runtime is typed with the services provided by the layer,
so TypeScript will error if you try to run an effect that requires services not in the layer.

#### `EffectRuntime<R>.run(effect)`

Runs an Effect program and returns its result. Throws on failure.

**Parameters:**
- `effect: Effect<A, E, R>` - The Effect to run (can require services `R` from the runtime)

**Returns:** `Operation<A>` - An operation that yields the success value

**Throws:** The effect's error `E` if it fails

#### `EffectRuntime<R>.runExit(effect)`

Runs an Effect program and returns its Exit (success or failure). Does not throw.

**Parameters:**
- `effect: Effect<A, E, R>` - The Effect to run (can require services `R` from the runtime)

**Returns:** `Operation<Exit<A, E>>` - An operation that yields the Exit

---

### EffectionRuntime

#### `makeEffectionRuntime(parent?)`

Creates an Effect Layer that provides an `EffectionRuntime`.

**Parameters:**
- `parent` (optional) - A parent Effection `Scope`. If provided, the runtime's
  scope will inherit all contexts from the parent scope. This is useful when
  running Effect code from within an Effection operation and you want the
  Effection operations inside Effect to have access to Effection contexts.

**Returns:** `Layer.Layer<EffectionRuntime>` - A layer providing the runtime

**Lifecycle:** The underlying Effection scope is automatically closed when the Effect scope ends.

#### `EffectionRuntime.run(operation)`

Runs an Effection operation and returns its result as an Effect.

**Parameters:**
- `operation: () => Operation<T>` - The operation (generator function) to run

**Returns:** `Effect<T, UnknownException>` - An effect that yields the result

#### `EffectionRuntime` (Tag)

Effect Context Tag for accessing the runtime:
```ts
const runtime = yield* EffectionRuntime;
```

## Comparison

| Aspect | `EffectRuntime.run()` | `EffectRuntime.runExit()` | `EffectionRuntime.run()` |
|--------|----------------------|---------------------------|-------------------------|
| **Direction** | Effect -> Effection | Effect -> Effection | Effection -> Effect |
| **Error Handling** | Throws JS error | Returns `Exit<A, E>` | Returns `UnknownException` |
| **Use When** | Simple cases | Need typed errors | Using Effection in Effect |
| **Cancellation** | Effection halt -> Effect interrupt | Same | Effect interrupt -> Effection halt |
