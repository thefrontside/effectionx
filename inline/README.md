# 🚀 Inline

Collapse nested `yield*` delegation into a single flat iterator for
performance-critical code paths.

---

On rare occasions, `yield*` syntax can cause a performance
degradation, for example when there are many, many levels of
recursion. The reason is because when javascript composes generators via `yield*`, each level
of nesting creates an intermediate generator frame. The
engine must unwind through every one of these frames on each call to
`.next()`, `.return()`, or `.throw()`. For deeply nested or recursive
operations, the cost of resuming a single yield point is O(depth).

Most of the time, this overhead is negligible and you should use plain
`yield*` — it's type-safe, gives you clear stack traces, and composes
naturally. But if you've profiled your code and identified deep
`yield*` nesting as a bottleneck (e.g. recursive operations or tight
inner loops with many layers of delegation), `inline()` lets you
opt into a flat execution model where the cost is O(1) regardless of
depth.

Instead of delegating with `yield*`:

```ts
let value = yield* someOperation();
```

Use `inline()` with a plain `yield`:

```ts
import { inline } from "@effectionx/inline";

let value = (yield inline(someOperation())) as SomeType;
```

The trade-off is that the return type is `unknown` (requiring a cast),
and you lose the natural generator stack trace.
