import { describe, it } from "@effectionx/bdd";
import {
  type DurableEvent,
  InMemoryStream,
  type Json,
  type Workflow,
  durableRun,
} from "@effectionx/durable-streams";
import { useScope } from "effection";
import { expect } from "expect";
import { type EvalResult, durableEval } from "./durable-eval.ts";
import { type ExecResult, durableExec } from "./durable-exec.ts";
import { type FetchResult, durableFetch } from "./durable-fetch.ts";
import { type GlobResult, durableGlob } from "./durable-glob.ts";
import { type ReadFileResult, durableReadFile } from "./durable-read-file.ts";
import {
  durableEnv,
  durableNow,
  durableResolve,
  durableUUID,
} from "./durable-resolve.ts";
import { DurableRuntimeCtx } from "./runtime.ts";
import { stubRuntime } from "./stub-runtime.ts";

describe("durable operations", () => {
  describe("durableExec", () => {
    it("golden run: executes command and records yield/close", function* () {
      const stream = new InMemoryStream();
      const scope = yield* useScope();

      scope.set(
        DurableRuntimeCtx,
        stubRuntime({
          *exec({ command }) {
            expect(command).toEqual(["tsc"]);
            return { exitCode: 0, stdout: "compiled", stderr: "" };
          },
        }),
      );

      function* workflow(): Workflow<Json> {
        return (yield* durableExec("compile", {
          command: ["tsc"],
        })) as unknown as Json;
      }

      const result = (yield* durableRun(workflow, {
        stream,
      })) as unknown as ExecResult;
      expect(result).toEqual({ exitCode: 0, stdout: "compiled", stderr: "" });

      const events = stream.snapshot();
      expect(events.length).toBe(2);
      expect(events[0]!.type).toBe("yield");
      if (events[0]!.type === "yield") {
        expect(events[0]!.description).toEqual({
          type: "exec",
          name: "compile",
          command: ["tsc"],
          timeout: 300000,
          throwOnError: true,
        });
        expect(events[0]!.result).toEqual({
          status: "ok",
          value: { exitCode: 0, stdout: "compiled", stderr: "" },
        });
      }
      expect(events[1]!.type).toBe("close");
    });

    it("full replay: returns stored exec result without live runtime", function* () {
      const stored: ExecResult = {
        exitCode: 0,
        stdout: "from-journal",
        stderr: "",
      };
      const events: DurableEvent[] = [
        {
          type: "yield",
          coroutineId: "root",
          description: {
            type: "exec",
            name: "compile",
            command: ["tsc"],
            timeout: 300000,
          },
          result: { status: "ok", value: stored as unknown as Json },
        },
        {
          type: "close",
          coroutineId: "root",
          result: { status: "ok", value: stored as unknown as Json },
        },
      ];
      const stream = new InMemoryStream(events);

      const scope = yield* useScope();
      scope.set(DurableRuntimeCtx, stubRuntime());

      function* workflow(): Workflow<Json> {
        return (yield* durableExec("compile", {
          command: ["will", "not", "run"],
        })) as unknown as Json;
      }

      const result = (yield* durableRun(workflow, {
        stream,
      })) as unknown as ExecResult;
      expect(result).toEqual(stored);
      expect(stream.appendCount).toBe(0);
    });

    it("error propagation: exec failure bubbles through durableRun", function* () {
      const stream = new InMemoryStream();
      const scope = yield* useScope();

      scope.set(
        DurableRuntimeCtx,
        stubRuntime({
          *exec() {
            throw new Error("boom");
          },
        }),
      );

      function* workflow(): Workflow<Json> {
        return (yield* durableExec("compile", {
          command: ["tsc"],
        })) as unknown as Json;
      }

      try {
        yield* durableRun(workflow, { stream });
        throw new Error("expected durableRun to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("boom");
      }

      const events = stream.snapshot();
      expect(events.length).toBe(2);
      expect(events[0]!.type).toBe("yield");
      if (events[0]!.type === "yield") {
        expect(events[0]!.result.status).toBe("err");
      }
      expect(events[1]!.type).toBe("close");
      if (events[1]!.type === "close") {
        expect(events[1]!.result.status).toBe("err");
      }
    });
  });

  describe("durableReadFile", () => {
    it("golden run: reads content and stores contentHash", function* () {
      const stream = new InMemoryStream();
      const scope = yield* useScope();

      scope.set(
        DurableRuntimeCtx,
        stubRuntime({
          *readTextFile(path) {
            expect(path).toBe("src/input.txt");
            return "hello durable world";
          },
        }),
      );

      function* workflow(): Workflow<Json> {
        return (yield* durableReadFile(
          "read-input",
          "src/input.txt",
        )) as unknown as Json;
      }

      const result = (yield* durableRun(workflow, {
        stream,
      })) as unknown as ReadFileResult;
      expect(result.content).toBe("hello durable world");
      expect(result.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);

      const events = stream.snapshot();
      expect(events.length).toBe(2);
      expect(events[0]!.type).toBe("yield");
      if (events[0]!.type === "yield") {
        expect(events[0]!.description).toEqual({
          type: "read_file",
          name: "read-input",
          path: "src/input.txt",
          encoding: "utf-8",
        });
      }
    });

    it("full replay: returns stored read result without reading disk", function* () {
      const stored: ReadFileResult = {
        content: "journaled content",
        contentHash:
          "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      };
      const stream = new InMemoryStream([
        {
          type: "yield",
          coroutineId: "root",
          description: {
            type: "read_file",
            name: "read-input",
            path: "src/input.txt",
            encoding: "utf-8",
          },
          result: { status: "ok", value: stored as unknown as Json },
        },
        {
          type: "close",
          coroutineId: "root",
          result: { status: "ok", value: stored as unknown as Json },
        },
      ]);

      const scope = yield* useScope();
      scope.set(DurableRuntimeCtx, stubRuntime());

      function* workflow(): Workflow<Json> {
        return (yield* durableReadFile(
          "read-input",
          "different/path.txt",
        )) as unknown as Json;
      }

      const result = (yield* durableRun(workflow, {
        stream,
      })) as unknown as ReadFileResult;
      expect(result).toEqual(stored);
      expect(stream.appendCount).toBe(0);
    });
  });

  describe("durableGlob", () => {
    it("golden run: discovers files, hashes contents, computes scanHash", function* () {
      const stream = new InMemoryStream();
      const scope = yield* useScope();

      scope.set(
        DurableRuntimeCtx,
        stubRuntime({
          *glob({ patterns, root, exclude }) {
            expect(patterns).toEqual(["**/*.ts"]);
            expect(root).toBe("project");
            expect(exclude).toEqual(["**/*.test.ts"]);
            return [
              { path: "src/b.ts", isFile: true },
              { path: "src/a.ts", isFile: true },
              { path: "src/dir", isFile: false },
              { path: "src/a.ts", isFile: true },
            ];
          },
          *readTextFile(path) {
            if (path === "project/src/a.ts") return "A";
            if (path === "project/src/b.ts") return "B";
            throw new Error(`unexpected file: ${path}`);
          },
        }),
      );

      function* workflow(): Workflow<Json> {
        return (yield* durableGlob("scan", {
          baseDir: "project",
          include: ["**/*.ts"],
          exclude: ["**/*.test.ts"],
        })) as unknown as Json;
      }

      const result = (yield* durableRun(workflow, {
        stream,
      })) as unknown as GlobResult;
      expect(result.matches.map((m) => m.path)).toEqual([
        "src/a.ts",
        "src/b.ts",
      ]);
      for (const match of result.matches) {
        expect(match.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      }
      expect(result.scanHash).toMatch(/^sha256:[0-9a-f]{64}$/);

      const events = stream.snapshot();
      expect(events.length).toBe(2);
      expect(events[0]!.type).toBe("yield");
      if (events[0]!.type === "yield") {
        expect(events[0]!.description).toEqual({
          type: "glob",
          name: "scan",
          baseDir: "project",
          include: ["**/*.ts"],
          exclude: ["**/*.test.ts"],
        });
      }
    });

    it("full replay: returns stored glob result without scanning", function* () {
      const stored: GlobResult = {
        matches: [
          {
            path: "src/main.ts",
            contentHash:
              "sha256:2222222222222222222222222222222222222222222222222222222222222222",
          },
        ],
        scanHash:
          "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      };
      const stream = new InMemoryStream([
        {
          type: "yield",
          coroutineId: "root",
          description: {
            type: "glob",
            name: "scan",
            baseDir: "project",
            include: ["**/*.ts"],
            exclude: [],
          },
          result: { status: "ok", value: stored as unknown as Json },
        },
        {
          type: "close",
          coroutineId: "root",
          result: { status: "ok", value: stored as unknown as Json },
        },
      ]);

      const scope = yield* useScope();
      scope.set(DurableRuntimeCtx, stubRuntime());

      function* workflow(): Workflow<Json> {
        return (yield* durableGlob("scan", {
          baseDir: "ignored",
          include: ["ignored"],
        })) as unknown as Json;
      }

      const result = (yield* durableRun(workflow, {
        stream,
      })) as unknown as GlobResult;
      expect(result).toEqual(stored);
      expect(stream.appendCount).toBe(0);
    });
  });

  describe("durableFetch", () => {
    it("golden run: fetches body and records selected headers", function* () {
      const stream = new InMemoryStream();
      const scope = yield* useScope();

      let capturedUrl: string | undefined;
      let capturedInit:
        | {
            method?: string;
            headers?: Record<string, string>;
            body?: string;
            timeout?: number;
          }
        | undefined;

      scope.set(
        DurableRuntimeCtx,
        stubRuntime({
          *fetch(url, init) {
            capturedUrl = url;
            capturedInit = init;
            return {
              status: 200,
              headers: {
                get: (key: string) =>
                  key === "content-type"
                    ? "text/plain"
                    : key === "etag"
                      ? '"v1"'
                      : null,
              },
              *text() {
                return "response body";
              },
            };
          },
        }),
      );

      function* workflow(): Workflow<Json> {
        return (yield* durableFetch("download", {
          url: "https://example.com/data",
          method: "POST",
          headers: { accept: "text/plain" },
          body: "payload",
          timeout: 1234,
        })) as unknown as Json;
      }

      const result = (yield* durableRun(workflow, {
        stream,
      })) as unknown as FetchResult;
      expect(capturedUrl).toBe("https://example.com/data");
      expect(capturedInit).toEqual({
        method: "POST",
        headers: { accept: "text/plain" },
        body: "payload",
        timeout: 1234,
      });
      expect(result.status).toBe(200);
      expect(result.headers).toEqual({
        "content-type": "text/plain",
        etag: '"v1"',
      });
      expect(result.body).toBe("response body");
      expect(result.bodyHash).toMatch(/^sha256:[0-9a-f]{64}$/);

      const events = stream.snapshot();
      expect(events.length).toBe(2);
      expect(events[0]!.type).toBe("yield");
      if (events[0]!.type === "yield") {
        expect(events[0]!.description).toEqual({
          type: "fetch",
          name: "download",
          url: "https://example.com/data",
          method: "POST",
          // Only safe headers are recorded with values; others are redacted
          headers: { accept: "text/plain" },
          bodyHash: "len:7",
        });
      }
    });

    it("full replay: returns stored fetch result without network", function* () {
      const stored: FetchResult = {
        status: 200,
        headers: { "content-type": "application/json" },
        body: '{"ok":true}',
        bodyHash:
          "sha256:4444444444444444444444444444444444444444444444444444444444444444",
      };
      const stream = new InMemoryStream([
        {
          type: "yield",
          coroutineId: "root",
          description: {
            type: "fetch",
            name: "download",
            url: "https://example.com/data",
            method: "GET",
            headers: {},
          },
          result: { status: "ok", value: stored as unknown as Json },
        },
        {
          type: "close",
          coroutineId: "root",
          result: { status: "ok", value: stored as unknown as Json },
        },
      ]);

      const scope = yield* useScope();
      scope.set(DurableRuntimeCtx, stubRuntime());

      function* workflow(): Workflow<Json> {
        return (yield* durableFetch("download", {
          url: "https://ignored.invalid",
        })) as unknown as Json;
      }

      const result = (yield* durableRun(workflow, {
        stream,
      })) as unknown as FetchResult;
      expect(result).toEqual(stored);
      expect(stream.appendCount).toBe(0);
    });
  });

  describe("durableEval", () => {
    it("golden run: evaluates source and records hashes", function* () {
      const stream = new InMemoryStream();
      const scope = yield* useScope();
      scope.set(DurableRuntimeCtx, stubRuntime());

      let evaluatorCalls = 0;
      function* evaluator(source: string, bindings: Record<string, Json>) {
        evaluatorCalls += 1;
        expect(source).toBe("x + y");
        expect(bindings).toEqual({ x: 1, y: 2 });
        return { sum: 3 } as Json;
      }

      function* workflow(): Workflow<Json> {
        return (yield* durableEval("compute", evaluator, {
          source: "x + y",
          language: "js",
          bindings: { x: 1, y: 2 },
        })) as unknown as Json;
      }

      const result = (yield* durableRun(workflow, {
        stream,
      })) as unknown as EvalResult;
      expect(evaluatorCalls).toBe(1);
      expect(result.value).toEqual({ sum: 3 });
      expect(result.sourceHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(result.bindingsHash).toMatch(/^sha256:[0-9a-f]{64}$/);

      const events = stream.snapshot();
      expect(events.length).toBe(2);
      expect(events[0]!.type).toBe("yield");
      if (events[0]!.type === "yield") {
        expect(events[0]!.description).toEqual({
          type: "eval",
          name: "compute",
          language: "js",
        });
      }
    });

    it("full replay: returns stored eval result without invoking evaluator", function* () {
      const stored: EvalResult = {
        value: { answer: 42 },
        sourceHash:
          "sha256:5555555555555555555555555555555555555555555555555555555555555555",
        bindingsHash:
          "sha256:6666666666666666666666666666666666666666666666666666666666666666",
      };
      const stream = new InMemoryStream([
        {
          type: "yield",
          coroutineId: "root",
          description: { type: "eval", name: "compute", language: "js" },
          result: { status: "ok", value: stored as unknown as Json },
        },
        {
          type: "close",
          coroutineId: "root",
          result: { status: "ok", value: stored as unknown as Json },
        },
      ]);

      const scope = yield* useScope();
      scope.set(DurableRuntimeCtx, stubRuntime());

      function* workflow(): Workflow<Json> {
        return (yield* durableEval(
          "compute",
          function* () {
            throw new Error("evaluator should not run on replay");
          },
          { source: "ignored", bindings: {} },
        )) as unknown as Json;
      }

      const result = (yield* durableRun(workflow, {
        stream,
      })) as unknown as EvalResult;
      expect(result).toEqual(stored);
      expect(stream.appendCount).toBe(0);
    });
  });

  describe("durableResolve", () => {
    it("golden run: resolves platform through runtime", function* () {
      const stream = new InMemoryStream();
      const scope = yield* useScope();
      scope.set(
        DurableRuntimeCtx,
        stubRuntime({
          platform() {
            return { os: "darwin", arch: "arm64" };
          },
        }),
      );

      function* workflow(): Workflow<Json> {
        return (yield* durableResolve("platform-info", {
          kind: "platform",
        })) as unknown as Json;
      }

      const result = (yield* durableRun(workflow, { stream })) as unknown as {
        os: string;
        arch: string;
      };
      expect(result).toEqual({ os: "darwin", arch: "arm64" });

      const events = stream.snapshot();
      expect(events.length).toBe(2);
      expect(events[0]!.type).toBe("yield");
      if (events[0]!.type === "yield") {
        expect(events[0]!.description).toEqual({
          type: "resolve",
          name: "platform-info",
          kind: "platform",
        });
      }
    });

    it("full replay: returns stored resolved value without runtime calls", function* () {
      const stored = { os: "linux", arch: "x64" };
      const stream = new InMemoryStream([
        {
          type: "yield",
          coroutineId: "root",
          description: {
            type: "resolve",
            name: "platform-info",
            kind: "platform",
          },
          result: { status: "ok", value: stored as unknown as Json },
        },
        {
          type: "close",
          coroutineId: "root",
          result: { status: "ok", value: stored as unknown as Json },
        },
      ]);

      const scope = yield* useScope();
      scope.set(DurableRuntimeCtx, stubRuntime());

      function* workflow(): Workflow<Json> {
        return (yield* durableResolve("platform-info", {
          kind: "platform",
        })) as unknown as Json;
      }

      const result = (yield* durableRun(workflow, { stream })) as unknown as {
        os: string;
        arch: string;
      };
      expect(result).toEqual(stored);
      expect(stream.appendCount).toBe(0);
    });
  });

  describe("convenience wrappers", () => {
    it("durableNow returns an ISO string and writes resolve event", function* () {
      const stream = new InMemoryStream();
      const scope = yield* useScope();
      scope.set(DurableRuntimeCtx, stubRuntime());

      function* workflow(): Workflow<string> {
        return yield* durableNow();
      }

      const result = yield* durableRun(workflow, { stream });
      expect(result).toMatch(/\d{4}-\d{2}-\d{2}T/);

      const events = stream.snapshot();
      expect(events.length).toBe(2);
      expect(events[0]!.type).toBe("yield");
      if (events[0]!.type === "yield") {
        expect(events[0]!.description).toEqual({
          type: "resolve",
          name: "now",
          kind: "current_time",
        });
      }
    });

    it("durableUUID returns a UUID and writes resolve event", function* () {
      const stream = new InMemoryStream();
      const scope = yield* useScope();
      scope.set(DurableRuntimeCtx, stubRuntime());

      function* workflow(): Workflow<string> {
        return yield* durableUUID();
      }

      const result = yield* durableRun(workflow, { stream });
      expect(result).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      const events = stream.snapshot();
      expect(events.length).toBe(2);
      expect(events[0]!.type).toBe("yield");
      if (events[0]!.type === "yield") {
        expect(events[0]!.description).toEqual({
          type: "resolve",
          name: "uuid",
          kind: "uuid",
        });
      }
    });

    it("durableEnv resolves an environment variable through runtime", function* () {
      const stream = new InMemoryStream();
      const scope = yield* useScope();
      scope.set(
        DurableRuntimeCtx,
        stubRuntime({
          env(name) {
            return name === "API_KEY" ? "secret-value" : undefined;
          },
        }),
      );

      function* workflow(): Workflow<string | null> {
        return yield* durableEnv("API_KEY");
      }

      const result = yield* durableRun(workflow, { stream });
      expect(result).toBe("secret-value");

      const events = stream.snapshot();
      expect(events.length).toBe(2);
      expect(events[0]!.type).toBe("yield");
      if (events[0]!.type === "yield") {
        expect(events[0]!.description).toEqual({
          type: "resolve",
          name: "env:API_KEY",
          kind: "env_var",
          varName: "API_KEY",
        });
      }
    });
  });
});
