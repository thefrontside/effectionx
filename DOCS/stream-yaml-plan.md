# Stream YAML Package Plan

## Goal
Add a new package `@effectionx/stream-yaml` that provides a stream helper to parse YAML document streams (string chunks) into `yaml.Document` objects, with tests for single and multi-document streams. The helper must adhere to Effection structured concurrency rules and only consume upstream when the consumer calls `next()`.

## Package Structure
Create a new package at `stream-yaml/`:
- `stream-yaml/package.json`
  - `name`: `@effectionx/stream-yaml`
  - `type`: `module`
  - `exports`: `.` -> `./mod.ts` (and dist mapping consistent with other packages)
  - `peerDependencies`: `effection`
  - `dependencies`: `yaml`
- `stream-yaml/tsconfig.json` (mirrors other packages)
- `stream-yaml/mod.ts` (exports helper)

Add to:
- `pnpm-workspace.yaml` (include `stream-yaml`)
- root `tsconfig.json` references (add `{ "path": "stream-yaml" }`)

## Helper Implementation

### API
```ts
export function yamlDocuments<T = unknown>(): <TClose>(
  stream: Stream<string, TClose>,
) => Stream<Document<T>, TClose>
```

### Behavior
- Input: stream of string chunks
- Output: stream of YAML `Document<T>` objects (caller can call `.toJS()`).
- Only pulls from upstream when consumer calls `next()`.
- Forwards close value from upstream.
- No internal document buffering - returns immediately when a document is ready.

### Implementation Sketch (revised)

The `yaml` package provides:
- `Parser.parse(chunk)` -> `Generator<Token>` - parse string chunks into tokens
- `Parser.end()` -> `Generator<Token>` - flush remaining tokens
- `Composer.next(token)` -> `Generator<Document>` - feed tokens, yields documents when complete
- `Composer.end()` -> `Generator<Document>` - flush remaining documents

```ts
import type { Operation, Stream } from "effection";
import { Parser, Composer, Document, type Token } from "yaml";

export function yamlDocuments<T = unknown>(): <TClose>(
  stream: Stream<string, TClose>,
) => Stream<Document<T>, TClose> {
  return (stream) => ({
    *[Symbol.iterator]() {
      const subscription = yield* stream;
      const parser = new Parser();
      const composer = new Composer();
      
      let closeValue: TClose;
      let upstreamDone = false;
      let composerEnded = false;
      
      // Active token generator from current parse() call
      let tokenGen: Generator<Token> | null = null;

      return {
        *next(): Operation<IteratorResult<Document<T>, TClose>> {
          while (true) {
            // Drain current token generator
            if (tokenGen) {
              let tokenResult = tokenGen.next();
              while (!tokenResult.done) {
                for (const doc of composer.next(tokenResult.value)) {
                  return { done: false, value: doc as Document<T> };
                }
                tokenResult = tokenGen.next();
              }
              tokenGen = null;
            }
            
            // Need more input
            if (upstreamDone) {
              // Flush composer
              if (!composerEnded) {
                composerEnded = true;
                for (const doc of composer.end()) {
                  return { done: false, value: doc as Document<T> };
                }
              }
              return { done: true, value: closeValue };
            }
            
            // Pull next chunk
            const chunk = yield* subscription.next();
            
            if (chunk.done) {
              upstreamDone = true;
              closeValue = chunk.value;
              tokenGen = parser.end();
            } else {
              tokenGen = parser.parse(chunk.value);
            }
          }
        },
      };
    },
  });
}
```

Notes:
- No `spawn`, `race`, or `scoped` needed - simple sequential iteration
- Token generator state preserved between `next()` calls
- Returns immediately when a document is ready (no buffering)
- Only pulls from upstream when current tokens exhausted

## Tests

Use `@effectionx/bdd` and `createChannel` for input.

### Test 1: Single Document
- Stream chunks for:
  ```
  foo: bar
  ```
- Expect one `Document` with `doc.toJS()` -> `{ foo: "bar" }`
- Close value should be forwarded.

### Test 2: Multi-Document
- Stream chunks for:
  ```
  ---
  foo: 1
  ---
  bar: 2
  ```
- Expect two `Document` values in order.
- Close value forwarded.

### Test 3: Chunked Input
- Stream a document split across multiple chunks:
  ```
  chunk1: "foo: "
  chunk2: "bar\n"
  ```
- Expect one `Document` with `doc.toJS()` -> `{ foo: "bar" }`

### Test 4: Multi-Document in Single Chunk
- Stream a single chunk containing multiple documents:
  ```
  chunk: "---\nfoo: 1\n---\nbar: 2\n---\nbaz: 3\n"
  ```
- Expect three `Document` values in order: `{ foo: 1 }`, `{ bar: 2 }`, `{ baz: 3 }`
- Close value forwarded after all documents.

### Close Value
- Use channel close value (e.g., `channel.close("done")`) and ensure stream `next()` returns `{ done: true, value: "done" }`.

## Dependencies
Add to `stream-yaml/package.json`:
- `"yaml": "^2.x"` (version consistent with repo policy)

## Notes for the other agent
- Follow existing package template patterns (exports, types, engines).
- Use ASCII-only code/comments unless file already uses Unicode.
- Keep tests consistent with existing `stream-helpers` test style.
- The `@effectionx/node-events` dependency is NOT needed - the yaml package uses generators, not EventEmitter.

## Critical Review Notes (Inline Feedback)

1) **Verify YAML generator API types**
   - The plan assumes `Parser.parse()` returns a `Generator<Token>`. Confirm the actual return type in the installed `yaml` version and adjust typing accordingly.
   - **RESOLVED**: Verified from yaml package type definitions:
     - `Parser.parse(source: string, incomplete?: boolean): Generator<Token, void>`
     - `Parser.end(): Generator<Token, void>`
     - `Composer.next(token: Token): Generator<Document.Parsed, void>`
     - `Composer.end(): Generator<Document.Parsed, void>`

2) **Avoid document loss when multiple docs are emitted**
   - `composer.next(token)` can yield more than one document per token. The current sketch returns the first doc and discards the rest.
   - Same issue for `composer.end()` (can yield multiple docs).
   - Add a small queue (`pendingDocs: Document[]`) to buffer docs and return them one-by-one across `next()` calls.
   - **RESOLVED**: Tested empirically - `composer.next(token)` yields **at most 1 document** per call, and `composer.end()` yields **at most 1 document**. No buffering needed. The `for...of` loop in the implementation is safe because each generator yields at most once.

3) **Test multi-doc in a single chunk**
   - Add a test where two documents are delivered in a single chunk (e.g., `---\nfoo: 1\n---\nbar: 2\n`). This validates the queue logic.
   - **ACCEPTED**: Added as Test 4 below.

4) **Close handling after final documents**
   - When `upstreamDone === true`, continue draining queued documents before returning `{ done: true, value: closeValue }`.
   - **RESOLVED**: Already handled - implementation drains `composer.end()` before returning close value.
