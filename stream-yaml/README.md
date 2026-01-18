# Stream Yaml

A helper that parses a stream of strings as YAML documents. Composes
well with `@effectionx/stream-helpers`.

# YAML file to Documents

This example shows how to read the contents of a YAML file as a
stream with Node and process each document.

```ts
import { main, createChannel, spawn } from "effection";
import { readTextFile } from "@effectionx/fs";
import { yamlDocuments } from "@effectionx/stream-yaml";

await main(function* () {
  const channel = createChannel<string, void>();

  // Read file and send contents to channel
  yield* spawn(function* () {
    const content = yield* readTextFile("./config.yaml");
    yield* channel.send(content);
    yield* channel.close();
  });

  // Parse YAML documents from the channel
  const docs = yield* yamlDocuments()(channel);

  for (let result = yield* docs.next(); !result.done; result = yield* docs.next()) {
    const doc = result.value;
    console.log("Document:", doc.toJS());
  }
});
```

# Handling close value

If the stream is closed with a close value, it'll be returned as the
result of the stream.

```ts
import { main, createChannel, spawn } from "effection";
import { yamlDocuments } from "@effectionx/stream-yaml";

await main(function* () {
  const channel = createChannel<string, string>();

  yield* spawn(function* () {
    yield* channel.send("---\nname: first\n---\nname: second\n");
    yield* channel.close("all-done");
  });

  const docs = yield* yamlDocuments()(channel);

  let result = yield* docs.next();
  while (!result.done) {
    console.log("Document:", result.value.toJS());
    result = yield* docs.next();
  }

  // The close value is returned when the stream is exhausted
  console.log("Stream closed with:", result.value); // "all-done"
});
```

# Streaming from process output

This example shows how to parse YAML documents from a process's stdout,
useful for tools that output multiple YAML documents.

```ts
import { main } from "effection";
import { exec } from "@effectionx/process";
import { yamlDocuments } from "@effectionx/stream-yaml";
import { map } from "@effectionx/stream-helpers";

await main(function* () {
  const process = yield* exec("kubectl get pods -o yaml");

  // Convert stdout bytes to strings, then parse as YAML
  const stringStream = yield* map((chunk: Uint8Array) => 
    new TextDecoder().decode(chunk)
  )(process.stdout);

  const docs = yield* yamlDocuments()(stringStream);

  for (let result = yield* docs.next(); !result.done; result = yield* docs.next()) {
    const pod = result.value.toJS();
    console.log("Pod:", pod.metadata?.name);
  }
});
```
