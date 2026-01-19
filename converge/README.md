# @effectionx/converge

Recognize a desired state and synchronize on when that state has been achieved.

> This package is a port of [@bigtest/convergence](https://github.com/bigtestjs/convergence) adapted for [Effection](https://frontside.com/effection) structured concurrency.

---

## Why Convergence?

Let's say you want to write an assertion to verify a simple cause and
effect: when a certain button is clicked, a dialog appears containing
some text that gets loaded from the network.

In order to do this, you have to make sure that your assertion runs
_after_ the effect you're testing has been realized.

![Image of assertion after an effect](https://raw.githubusercontent.com/thefrontside/effectionx/main/converge/images/assertion-after.png)

If not, then you could end up with a false negative, or "flaky test"
because you ran the assertion too early. If you'd only waited a little
bit longer, then your test would have passed. So sad!

![Image of false negative test](https://raw.githubusercontent.com/thefrontside/effectionx/main/converge/images/false-negative.png)

In fact, test flakiness is the reason most people shy away from
writing big tests in JavaScript in the first place. It seems almost
impossible to write robust tests without having visibility into the
internals of your runtime so that you can manually synchronize on
things like rendering and data loading. Unfortunately, those can be a
moving target, and worse, they couple you to your framework.

But what if instead of trying to run our assertions at just the right
time, we ran them _many_ times until they either pass or we decide to
give up?

![Image of convergent assertion](https://raw.githubusercontent.com/thefrontside/effectionx/main/converge/images/convergent-assertion.png)

This is the essence of what `@effectionx/converge` provides:
repeatedly testing for a condition and then allowing code to run when
that condition has been met.

And it isn't just for assertions either. Because it is a general
mechanism for synchronizing on any observed state, it can be used to
properly time test setup and teardown as well.

---

## Installation

```bash
npm install @effectionx/converge
```

---

## Usage

### `when(assertion, options?)`

Converges when the assertion passes _within_ the timeout period. The
assertion runs repeatedly (every 10ms by default) and is considered
passing when it does not throw or return `false`. If it never passes
within the timeout, the operation throws with the last error.

```typescript
import { when } from "@effectionx/converge";

// Wait for a condition to become true
let { value } = yield* when(function* () {
  if (total !== 100) throw new Error("not ready");
  return total;
});

// With custom timeout
yield* when(
  function* () {
    if (!element.isVisible) throw new Error("not visible");
  },
  { timeout: 5000 },
);
```

### `always(assertion, options?)`

Converges when the assertion passes _throughout_ the timeout period.
Like `when()`, the assertion runs repeatedly, but it must pass
consistently for the entire duration. If it fails at any point, the
operation throws immediately.

```typescript
import { always } from "@effectionx/converge";

// Verify a condition remains true
yield* always(function* () {
  if (counter >= 100) throw new Error("counter exceeded limit");
});

// With custom timeout
yield* always(
  function* () {
    if (!connection.isAlive) throw new Error("connection lost");
  },
  { timeout: 5000 },
);
```

---

## Options

Both `when` and `always` accept an options object:

| Option     | Type     | Default                        | Description                                   |
| ---------- | -------- | ------------------------------ | --------------------------------------------- |
| `timeout`  | `number` | `2000` (when) / `200` (always) | Maximum time to wait in milliseconds          |
| `interval` | `number` | `10`                           | Time between assertion retries in milliseconds |

---

## Stats Object

Both functions return a `ConvergeStats` object with timing and execution info:

```typescript
interface ConvergeStats<T> {
  start: number; // Timestamp when convergence started
  end: number; // Timestamp when convergence ended
  elapsed: number; // Milliseconds the convergence took
  runs: number; // Number of times the assertion was executed
  timeout: number; // The timeout that was configured
  interval: number; // The interval that was configured
  value: T; // The return value from the assertion
}
```

Example:

```typescript
let stats = yield* when(
  function* () {
    return yield* fetchData();
  },
  { timeout: 5000 },
);

console.log(`Converged in ${stats.elapsed}ms after ${stats.runs} attempts`);
console.log(stats.value); // the fetched data
```

---

## Examples

### Waiting for an element to appear

```typescript
yield* when(function* () {
  let element = document.querySelector('[data-test-id="dialog"]');
  if (!element) throw new Error("dialog not found");
  return element;
});
```

### Verifying a value remains stable

```typescript
yield* always(
  function* () {
    if (connection.status !== "connected") {
      throw new Error("connection dropped");
    }
  },
  { timeout: 1000 },
);
```

### Using with file system operations

```typescript
import { when } from "@effectionx/converge";
import { access } from "node:fs/promises";
import { until } from "effection";

// Wait for a file to exist
yield* when(
  function* () {
    let exists = yield* until(
      access(filePath).then(
        () => true,
        () => false,
      ),
    );
    if (!exists) throw new Error("file not found");
    return true;
  },
  { timeout: 10000 },
);
```
