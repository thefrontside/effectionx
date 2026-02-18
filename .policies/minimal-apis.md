# Minimal and Interoperable APIs Policy (Experimental)

This document defines the experimental policy for keeping public API surfaces small and aligned with platform standards.

## Core Principle

**Prefer the smallest public surface area that composes with existing ecosystem standards.** Export primitives first, helpers second.

## The Rule

| Scenario              | Required Behavior                                                           |
| --------------------- | --------------------------------------------------------------------------- |
| New exports           | Default to not exporting until demonstrated consumer need                   |
| Naming                | Align with platform/spec conventions (e.g., `AbortSignal`, `AsyncIterable`) |
| Options objects       | Keep minimal; avoid "kitchen sink" configurations                           |
| Helpers vs primitives | Export primitives first; add helpers only when patterns repeat              |
| Custom abstractions   | Avoid wrappers unless they add clear value over platform APIs               |

## Examples

### Compliant: Minimal focused export

```typescript
import { call, type Operation } from "effection";
import { readFile } from "node:fs/promises";

// Single responsibility, minimal API
export function readJson(path: string): Operation<unknown> {
  return call(async () => JSON.parse(await readFile(path, "utf8")));
}
```

### Compliant: Platform-aligned naming

```typescript
// Uses platform naming conventions
export function toAsyncIterable<T>(stream: Stream<T>): AsyncIterable<T> {
  // ...
}

export function fromAsyncIterable<T>(iterable: AsyncIterable<T>): Stream<T> {
  // ...
}
```

### Non-Compliant: Oversized options before demand

```typescript
// BAD: Too many options before real usage demonstrates need
export function readJson(
  path: string,
  options: {
    retry?: number;
    timeout?: number;
    trace?: boolean;
    encoding?: BufferEncoding;
    reviver?: (key: string, value: unknown) => unknown;
    fallback?: unknown;
  },
): Operation<unknown> {
  // complexity without demonstrated need
}
```

### Non-Compliant: Custom wrapper hiding platform API

```typescript
// BAD: Custom naming when platform convention exists
export function makeSignalForCancellation(): AbortController {
  return new AbortController();
}
// Should just use AbortController directly
```

## Verification Checklist

Before marking a review complete, verify:

- [ ] New exports have demonstrated consumer need (issue, discussion, or usage)
- [ ] Naming follows platform conventions where applicable
- [ ] Options objects are minimal (max 3-4 options for initial release)
- [ ] No custom wrappers around simple platform APIs
- [ ] Primitives are exported; helpers compose them

## Common Mistakes

| Mistake                             | Fix                                                 |
| ----------------------------------- | --------------------------------------------------- |
| Exporting "just in case"            | Keep internal until requested                       |
| Custom naming for standard concepts | Use platform names (`AbortSignal`, `AsyncIterable`) |
| Large options object upfront        | Start with positional args, add options when needed |
| Helper without primitive            | Export the primitive, helper can be added later     |

## Related Policies

- [Ergonomics Policy](./ergonomics.md) - Balance minimal APIs with good DX
- [Documentation Policy](./documentation.md) - Document what you export
- [Policies Index](./index.md) - Add your new policy to the Policy Documents table
