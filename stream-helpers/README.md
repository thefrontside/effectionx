# Stream Helpers

A collection of stream hyelpers built on top of [Effection](https://github.com/thefrontside/effection) for efficient and controlled stream processing.

## Installation

```bash
npm install @effectionx/stream-helpers
```

## Features

### Batch

The `batch` operation groups stream items into batches based on size and/or time constraints.

```typescript
import { batch } from "@effectionx/stream-helpers";
import { run, each } from "effection";

// Example: Batch by size
await run(function* () {
  const stream = batch({ maxSize: 3 })(sourceStream);
  
  for (const batch of yield* each(stream)) {
    console.log(batch); // [1, 2, 3], [4, 5, 6], ...
  }
});

// Example: Batch by time
await run(function* () {
  const stream = batch({ maxTime: 1000 })(sourceStream);
  
  for (const batch of yield* each(stream)) {
    console.log(batch); // Items received within 1 second
  }
});

// Example: Combined batching
await run(function* () {
  const stream = batch({ maxSize: 5, maxTime: 1000 })(sourceStream);
  
  for (const batch of yield* each(stream)) {
    console.log(batch); // Either 5 items or items within 1 second
  }
});
```

### Valve Operation

The `valve` operation controls stream flow based on buffer size thresholds.

```typescript
import { valve } from "@frontside/effectionx";
import { run, each } from "effection";

await run(function* () {
  const stream = valve({
    openAt: 2,    // Open valve when buffer size <= 2
    closeAt: 5,   // Close valve when buffer size >= 5
    open() {
      console.log("Valve opened");
    },
    close() {
      console.log("Valve closed");
    }
  })(sourceStream);

  for (const value of yield* each(stream)) {
    console.log(value);
  }
});
```

## Use Cases

### Batch Operation
- Grouping API requests to reduce network overhead
- Buffering database operations for bulk inserts
- Collecting metrics before processing

### Valve Operation
- Implementing backpressure in data pipelines
- Controlling memory usage in high-throughput systems
- Rate limiting stream processing