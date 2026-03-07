/**
 * Tests for replay guards — useFileContentGuard, useGlobContentGuard,
 * useCodeFreshnessGuard.
 *
 * Each guard is tested with:
 * 1. Unchanged state → replay proceeds
 * 2. Changed state → StaleInputError thrown
 * 3. Non-applicable events → pass through (no opinion)
 *
 * Guards are installed before durableRun. During replay:
 * - check phase gathers current state (hashes, etc.)
 * - decide phase compares against recorded state in journal
 */

import { describe, it } from "@effectionx/bdd";
import {
  type DurableEvent,
  InMemoryStream,
  type Json,
  StaleInputError,
  type Workflow,
  durableRun,
} from "@effectionx/durable-streams";
import { useScope } from "effection";
import { expect } from "expect";
import {
  useCodeFreshnessGuard,
  useFileContentGuard,
  useGlobContentGuard,
} from "./guards.ts";
import { computeSHA256 } from "./hash.ts";
import {
  durableEval,
  durableGlob,
  durableReadFile,
  durableResolve,
} from "./operations.ts";
import { DurableRuntimeCtx } from "./runtime.ts";
import { stubRuntime } from "./stub-runtime.ts";

// ---------------------------------------------------------------------------
// useFileContentGuard
// ---------------------------------------------------------------------------

describe("useFileContentGuard", () => {
  it("file unchanged — replay proceeds", function* () {
    const content = "hello world";
    const contentHash = yield* computeSHA256(content);

    // Pre-populate stream with a read_file event that has matching hash
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: {
          type: "read_file",
          name: "read-input",
          path: "src/input.txt",
          encoding: "utf-8",
        },
        result: {
          status: "ok",
          value: { content, contentHash } as unknown as Json,
        },
      },
      {
        type: "close",
        coroutineId: "root",
        result: {
          status: "ok",
          value: { content, contentHash } as unknown as Json,
        },
      },
    ];
    const stream = new InMemoryStream(events);

    const scope = yield* useScope();
    // Runtime returns the SAME content — hash will match
    scope.set(
      DurableRuntimeCtx,
      stubRuntime({
        *readTextFile(path) {
          expect(path).toBe("src/input.txt");
          return content;
        },
      }),
    );
    yield* useFileContentGuard();

    function* workflow(): Workflow<Json> {
      return (yield* durableReadFile(
        "read-input",
        "src/input.txt",
      )) as unknown as Json;
    }

    const result = yield* durableRun(workflow, { stream });
    // Replay succeeded — got stored result
    expect((result as Record<string, unknown>).content).toBe(content);
    expect(stream.appendCount).toBe(0);
  });

  it("file changed — StaleInputError thrown", function* () {
    const originalContent = "original";
    const originalHash = yield* computeSHA256(originalContent);
    const newContent = "modified content";

    // No Close event — so durableRun enters workflow and replays effects
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: {
          type: "read_file",
          name: "read-input",
          path: "src/input.txt",
          encoding: "utf-8",
        },
        result: {
          status: "ok",
          value: {
            content: originalContent,
            contentHash: originalHash,
          } as unknown as Json,
        },
      },
    ];
    const stream = new InMemoryStream(events);

    const scope = yield* useScope();
    // Runtime returns DIFFERENT content — hash will mismatch
    scope.set(
      DurableRuntimeCtx,
      stubRuntime({
        *readTextFile() {
          return newContent;
        },
      }),
    );
    yield* useFileContentGuard();

    function* workflow(): Workflow<Json> {
      return (yield* durableReadFile(
        "read-input",
        "src/input.txt",
      )) as unknown as Json;
    }

    try {
      yield* durableRun(workflow, { stream });
      throw new Error("expected StaleInputError");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("File changed");
      expect((error as Error).message).toContain("src/input.txt");
    }
  });

  it("no path in description — guard passes through", function* () {
    // An event without `path` in description should not be validated
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "resolve", name: "now", kind: "current_time" },
        result: {
          status: "ok",
          value: "2024-01-01T00:00:00.000Z" as unknown as Json,
        },
      },
      {
        type: "close",
        coroutineId: "root",
        result: {
          status: "ok",
          value: "2024-01-01T00:00:00.000Z" as unknown as Json,
        },
      },
    ];
    const stream = new InMemoryStream(events);

    const scope = yield* useScope();
    scope.set(DurableRuntimeCtx, stubRuntime());
    yield* useFileContentGuard();

    function* workflow(): Workflow<Json> {
      return (yield* durableResolve("now", {
        kind: "current_time",
      })) as unknown as Json;
    }

    // Should succeed — guard has no opinion on non-file events
    const result = yield* durableRun(workflow, { stream });
    expect(result).toBe("2024-01-01T00:00:00.000Z");
  });

  it("multiple events same path — file hashed once", function* () {
    const content = "cached content";
    const contentHash = yield* computeSHA256(content);

    // Two read_file events for the same path
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: {
          type: "read_file",
          name: "read1",
          path: "same.txt",
          encoding: "utf-8",
        },
        result: {
          status: "ok",
          value: { content, contentHash } as unknown as Json,
        },
      },
      {
        type: "yield",
        coroutineId: "root",
        description: {
          type: "read_file",
          name: "read2",
          path: "same.txt",
          encoding: "utf-8",
        },
        result: {
          status: "ok",
          value: { content, contentHash } as unknown as Json,
        },
      },
      {
        type: "close",
        coroutineId: "root",
        result: { status: "ok" },
      },
    ];
    const stream = new InMemoryStream(events);

    let readCount = 0;
    const scope = yield* useScope();
    scope.set(
      DurableRuntimeCtx,
      stubRuntime({
        *readTextFile() {
          readCount++;
          return content;
        },
      }),
    );
    yield* useFileContentGuard();

    function* workflow(): Workflow<void> {
      yield* durableReadFile("read1", "same.txt");
      yield* durableReadFile("read2", "same.txt");
    }

    yield* durableRun(workflow, { stream });
    // File should be hashed only once (cache dedup)
    expect(readCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// useGlobContentGuard
// ---------------------------------------------------------------------------

describe("useGlobContentGuard", () => {
  it("files unchanged — replay proceeds", function* () {
    // Compute the scanHash that matches what durableGlob would produce
    const fileA = { path: "a.ts", contentHash: yield* computeSHA256("A") };
    const fileB = { path: "b.ts", contentHash: yield* computeSHA256("B") };
    const matches = [fileA, fileB];
    const scanHash = yield* computeSHA256(JSON.stringify(matches));

    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: {
          type: "glob",
          name: "scan",
          baseDir: "src",
          include: ["*.ts"] as unknown as Json,
          exclude: [] as unknown as Json,
        },
        result: {
          status: "ok",
          value: { matches, scanHash } as unknown as Json,
        },
      },
      {
        type: "close",
        coroutineId: "root",
        result: {
          status: "ok",
          value: { matches, scanHash } as unknown as Json,
        },
      },
    ];
    const stream = new InMemoryStream(events);

    const scope = yield* useScope();
    scope.set(
      DurableRuntimeCtx,
      stubRuntime({
        *glob() {
          return [
            { path: "a.ts", isFile: true },
            { path: "b.ts", isFile: true },
          ];
        },
        *readTextFile(path) {
          if (path === "src/a.ts") return "A";
          if (path === "src/b.ts") return "B";
          throw new Error(`unexpected: ${path}`);
        },
      }),
    );
    yield* useGlobContentGuard();

    function* workflow(): Workflow<Json> {
      return (yield* durableGlob("scan", {
        baseDir: "src",
        include: ["*.ts"],
      })) as unknown as Json;
    }

    const result = yield* durableRun(workflow, { stream });
    expect((result as Record<string, unknown>).scanHash).toBe(scanHash);
    expect(stream.appendCount).toBe(0);
  });

  it("file added — StaleInputError", function* () {
    // Original scan found 1 file, current scan finds 2
    const fileA = { path: "a.ts", contentHash: yield* computeSHA256("A") };
    const originalMatches = [fileA];
    const originalScanHash = yield* computeSHA256(
      JSON.stringify(originalMatches),
    );

    // No Close event — so durableRun enters workflow and replays effects
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: {
          type: "glob",
          name: "scan",
          baseDir: "src",
          include: ["*.ts"] as unknown as Json,
          exclude: [] as unknown as Json,
        },
        result: {
          status: "ok",
          value: {
            matches: originalMatches,
            scanHash: originalScanHash,
          } as unknown as Json,
        },
      },
    ];
    const stream = new InMemoryStream(events);

    const scope = yield* useScope();
    scope.set(
      DurableRuntimeCtx,
      stubRuntime({
        *glob() {
          // Now returns 2 files — scanHash will differ
          return [
            { path: "a.ts", isFile: true },
            { path: "b.ts", isFile: true },
          ];
        },
        *readTextFile(path) {
          if (path === "src/a.ts") return "A";
          if (path === "src/b.ts") return "B";
          throw new Error(`unexpected: ${path}`);
        },
      }),
    );
    yield* useGlobContentGuard();

    function* workflow(): Workflow<Json> {
      return (yield* durableGlob("scan", {
        baseDir: "src",
        include: ["*.ts"],
      })) as unknown as Json;
    }

    try {
      yield* durableRun(workflow, { stream });
      throw new Error("expected StaleInputError");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Glob results changed");
    }
  });

  it("non-glob events pass through", function* () {
    // A read_file event should not be validated by glob guard
    const content = "hello";
    const contentHash = yield* computeSHA256(content);

    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: {
          type: "read_file",
          name: "read",
          path: "file.txt",
          encoding: "utf-8",
        },
        result: {
          status: "ok",
          value: { content, contentHash } as unknown as Json,
        },
      },
      {
        type: "close",
        coroutineId: "root",
        result: {
          status: "ok",
          value: { content, contentHash } as unknown as Json,
        },
      },
    ];
    const stream = new InMemoryStream(events);

    const scope = yield* useScope();
    // Note: stubRuntime with readTextFile override so file guard check
    // doesn't fail (glob guard doesn't need any runtime for non-glob events)
    scope.set(
      DurableRuntimeCtx,
      stubRuntime({
        *readTextFile() {
          return content;
        },
      }),
    );
    yield* useGlobContentGuard();

    function* workflow(): Workflow<Json> {
      return (yield* durableReadFile("read", "file.txt")) as unknown as Json;
    }

    // Should succeed — glob guard has no opinion on read_file events
    const result = yield* durableRun(workflow, { stream });
    expect((result as Record<string, unknown>).content).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// useCodeFreshnessGuard
// ---------------------------------------------------------------------------

describe("useCodeFreshnessGuard", () => {
  it("source and bindings unchanged — replay proceeds", function* () {
    const source = "x + y";
    const bindings = { x: 1, y: 2 };
    const sourceHash = yield* computeSHA256(source);
    const bindingsHash = yield* computeSHA256(JSON.stringify(bindings));

    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "eval", name: "compute", language: "js" },
        result: {
          status: "ok",
          value: {
            value: { sum: 3 },
            sourceHash,
            bindingsHash,
          } as unknown as Json,
        },
      },
      {
        type: "close",
        coroutineId: "root",
        result: {
          status: "ok",
          value: {
            value: { sum: 3 },
            sourceHash,
            bindingsHash,
          } as unknown as Json,
        },
      },
    ];
    const stream = new InMemoryStream(events);

    const scope = yield* useScope();
    scope.set(DurableRuntimeCtx, stubRuntime());

    // getCellSource returns SAME source and bindings
    yield* useCodeFreshnessGuard((cellName) => {
      if (cellName === "compute") return { source, bindings };
      return undefined;
    });

    function* workflow(): Workflow<Json> {
      return (yield* durableEval(
        "compute",
        function* () {
          throw new Error("evaluator should not run on replay");
        },
        { source: "ignored", bindings: {} },
      )) as unknown as Json;
    }

    const result = yield* durableRun(workflow, { stream });
    expect((result as Record<string, Record<string, unknown>>).value).toEqual({
      sum: 3,
    });
    expect(stream.appendCount).toBe(0);
  });

  it("source changed — StaleInputError mentioning source", function* () {
    const originalSource = "x + y";
    const newSource = "x * y";
    const bindings = { x: 1, y: 2 };
    const sourceHash = yield* computeSHA256(originalSource);
    const bindingsHash = yield* computeSHA256(JSON.stringify(bindings));

    // No Close event — so durableRun enters workflow and replays effects
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "eval", name: "compute" },
        result: {
          status: "ok",
          value: {
            value: { sum: 3 },
            sourceHash,
            bindingsHash,
          } as unknown as Json,
        },
      },
    ];
    const stream = new InMemoryStream(events);

    const scope = yield* useScope();
    scope.set(DurableRuntimeCtx, stubRuntime());

    // getCellSource returns DIFFERENT source
    yield* useCodeFreshnessGuard((cellName) => {
      if (cellName === "compute") return { source: newSource, bindings };
      return undefined;
    });

    function* workflow(): Workflow<Json> {
      return (yield* durableEval(
        "compute",
        function* () {
          throw new Error("should not run");
        },
        { source: "ignored", bindings: {} },
      )) as unknown as Json;
    }

    try {
      yield* durableRun(workflow, { stream });
      throw new Error("expected StaleInputError");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Source changed");
      expect((error as Error).message).toContain("compute");
    }
  });

  it("bindings changed — StaleInputError mentioning bindings", function* () {
    const source = "x + y";
    const originalBindings = { x: 1, y: 2 };
    const newBindings = { x: 1, y: 99 };
    const sourceHash = yield* computeSHA256(source);
    const bindingsHash = yield* computeSHA256(JSON.stringify(originalBindings));

    // No Close event — so durableRun enters workflow and replays effects
    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "eval", name: "compute" },
        result: {
          status: "ok",
          value: {
            value: { sum: 3 },
            sourceHash,
            bindingsHash,
          } as unknown as Json,
        },
      },
    ];
    const stream = new InMemoryStream(events);

    const scope = yield* useScope();
    scope.set(DurableRuntimeCtx, stubRuntime());

    // getCellSource returns same source but DIFFERENT bindings
    yield* useCodeFreshnessGuard((cellName) => {
      if (cellName === "compute") return { source, bindings: newBindings };
      return undefined;
    });

    function* workflow(): Workflow<Json> {
      return (yield* durableEval(
        "compute",
        function* () {
          throw new Error("should not run");
        },
        { source: "ignored", bindings: {} },
      )) as unknown as Json;
    }

    try {
      yield* durableRun(workflow, { stream });
      throw new Error("expected StaleInputError");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Bindings changed");
    }
  });

  it("unknown cell name — guard passes through", function* () {
    const sourceHash = yield* computeSHA256("old source");
    const bindingsHash = yield* computeSHA256("{}");

    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: { type: "eval", name: "unknown-cell" },
        result: {
          status: "ok",
          value: {
            value: 42,
            sourceHash,
            bindingsHash,
          } as unknown as Json,
        },
      },
      {
        type: "close",
        coroutineId: "root",
        result: {
          status: "ok",
          value: {
            value: 42,
            sourceHash,
            bindingsHash,
          } as unknown as Json,
        },
      },
    ];
    const stream = new InMemoryStream(events);

    const scope = yield* useScope();
    scope.set(DurableRuntimeCtx, stubRuntime());

    // getCellSource returns undefined for unknown cells
    yield* useCodeFreshnessGuard(() => undefined);

    function* workflow(): Workflow<Json> {
      return (yield* durableEval(
        "unknown-cell",
        function* () {
          throw new Error("should not run");
        },
        { source: "ignored", bindings: {} },
      )) as unknown as Json;
    }

    // Should succeed — guard has no opinion on unknown cells
    const result = yield* durableRun(workflow, { stream });
    expect((result as Record<string, unknown>).value).toBe(42);
  });

  it("non-eval events pass through", function* () {
    const content = "hello";
    const contentHash = yield* computeSHA256(content);

    const events: DurableEvent[] = [
      {
        type: "yield",
        coroutineId: "root",
        description: {
          type: "read_file",
          name: "read",
          path: "file.txt",
          encoding: "utf-8",
        },
        result: {
          status: "ok",
          value: { content, contentHash } as unknown as Json,
        },
      },
      {
        type: "close",
        coroutineId: "root",
        result: {
          status: "ok",
          value: { content, contentHash } as unknown as Json,
        },
      },
    ];
    const stream = new InMemoryStream(events);

    const scope = yield* useScope();
    scope.set(
      DurableRuntimeCtx,
      stubRuntime({
        *readTextFile() {
          return content;
        },
      }),
    );

    // Code freshness guard should ignore read_file events
    yield* useCodeFreshnessGuard(() => undefined);

    function* workflow(): Workflow<Json> {
      return (yield* durableReadFile("read", "file.txt")) as unknown as Json;
    }

    const result = yield* durableRun(workflow, { stream });
    expect((result as Record<string, unknown>).content).toBe(content);
  });
});
