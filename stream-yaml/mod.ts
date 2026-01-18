import type { Operation, Stream } from "effection";
import { type CST, Composer, type Document, Parser } from "yaml";

export type { Document } from "yaml";

/**
 * Stream helper that parses YAML document streams from string chunks.
 *
 * Transforms a stream of string chunks into a stream of YAML Document objects.
 * Supports multi-document YAML streams (documents separated by `---`).
 *
 * @example
 * ```ts
 * import { yamlDocuments } from "@effectionx/stream-yaml";
 * import { pipe } from "effection";
 *
 * const docs = yield* pipe(stringStream, yamlDocuments());
 * for (const doc of yield* docs) {
 *   console.log(doc.toJS());
 * }
 * ```
 */
export function yamlDocuments(): <TClose>(
  stream: Stream<string, TClose>,
) => Stream<Document.Parsed, TClose> {
  return <TClose>(stream: Stream<string, TClose>) => ({
    *[Symbol.iterator]() {
      const subscription = yield* stream;
      const parser = new Parser();
      const composer = new Composer();

      let closeValue: TClose;
      let upstreamDone = false;
      let composerEnded = false;

      // Active token generator from current parse() call
      let tokenGen: Generator<CST.Token> | null = null;

      // Queue of documents ready to be returned
      // (composer.next() must be fully exhausted to update internal state)
      const pendingDocs: Document.Parsed[] = [];

      return {
        *next(): Operation<IteratorResult<Document.Parsed, TClose>> {
          while (true) {
            // Return any pending documents first
            const pending = pendingDocs.shift();
            if (pending) {
              return { done: false, value: pending };
            }

            // Drain current token generator
            if (tokenGen) {
              let tokenResult = tokenGen.next();
              while (!tokenResult.done) {
                // Must fully exhaust composer.next() to update composer state
                for (const doc of composer.next(tokenResult.value)) {
                  pendingDocs.push(doc);
                }
                // If we got docs, return the first one
                const firstDoc = pendingDocs.shift();
                if (firstDoc) {
                  return { done: false, value: firstDoc };
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
                // Must fully exhaust composer.end()
                for (const doc of composer.end()) {
                  pendingDocs.push(doc);
                }
                const flushedDoc = pendingDocs.shift();
                if (flushedDoc) {
                  return { done: false, value: flushedDoc };
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
