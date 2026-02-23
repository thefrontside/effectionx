import { beforeEach, describe, it } from "@effectionx/bdd";
import { expect } from "expect";

import {
  type IncomingMessage,
  type ServerResponse,
  createServer,
} from "node:http";
import {
  Err,
  Ok,
  type Operation,
  type Result,
  call,
  each,
  ensure,
  spawn,
  withResolvers,
} from "effection";

import { type FetchResponse, HttpError, fetch, fetchApi } from "./fetch.ts";

function box<T>(content: () => Operation<T>): Operation<Result<T>> {
  return {
    *[Symbol.iterator]() {
      try {
        return Ok(yield* content());
      } catch (error) {
        return Err(error as Error);
      }
    },
  };
}

describe("fetch()", () => {
  let url: string;

  beforeEach(function* () {
    let server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url === "/json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: 1, title: "do things" }));
        return;
      }

      if (req.url === "/text") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("hello");
        return;
      }

      if (req.url === "/stream") {
        res.writeHead(200, { "Content-Type": "application/octet-stream" });
        res.write("chunk-1");
        res.write("chunk-2");
        res.end("chunk-3");
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    });

    let ready = withResolvers<void>();
    server.listen(0, () => ready.resolve());
    yield* ready.operation;

    let addr = server.address();
    let port = typeof addr === "object" && addr ? addr.port : 0;

    url = `http://localhost:${port}`;
    yield* ensure(() =>
      call(() => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
  });

  describe("traditional API", () => {
    it("reads JSON responses", function* () {
      let response = yield* fetch(`${url}/json`);
      let data = yield* response.json<{ id: number; title: string }>();

      expect(data).toEqual({ id: 1, title: "do things" });
    });

    it("supports parser-based json()", function* () {
      let response = yield* fetch(`${url}/json`);
      let data = yield* response.json((value) => {
        if (
          typeof value !== "object" ||
          value === null ||
          !("id" in value) ||
          !("title" in value)
        ) {
          throw new Error("invalid payload");
        }

        return { id: value.id as number, title: value.title as string };
      });

      expect(data).toEqual({ id: 1, title: "do things" });
    });

    it("streams response bodies", function* () {
      let response = yield* fetch(`${url}/stream`);
      let body = response.body();
      let decoder = new TextDecoder();
      let chunks: string[] = [];

      for (let chunk of yield* each(body)) {
        chunks.push(decoder.decode(chunk, { stream: true }));
        yield* each.next();
      }

      chunks.push(decoder.decode());
      expect(chunks.join("")).toEqual("chunk-1chunk-2chunk-3");
    });

    it("throws HttpError for expect() when response is not ok", function* () {
      let response = yield* fetch(`${url}/missing`);
      let result = yield* box(() => response.expect());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(HttpError);
        expect(result.error).toMatchObject({
          status: 404,
          statusText: "Not Found",
        });
      }
    });
  });

  describe("fluent API", () => {
    it("reads JSON with fetch().json()", function* () {
      let data = yield* fetch(`${url}/json`).json<{
        id: number;
        title: string;
      }>();

      expect(data).toEqual({ id: 1, title: "do things" });
    });

    it("reads text with fetch().text()", function* () {
      let text = yield* fetch(`${url}/text`).text();

      expect(text).toEqual("hello");
    });

    it("supports parser with fetch().json(parse)", function* () {
      let data = yield* fetch(`${url}/json`).json((value) => {
        if (
          typeof value !== "object" ||
          value === null ||
          !("id" in value) ||
          !("title" in value)
        ) {
          throw new Error("invalid payload");
        }

        return { id: value.id as number, title: value.title as string };
      });

      expect(data).toEqual({ id: 1, title: "do things" });
    });

    it("streams response bodies with fetch().body()", function* () {
      let body = fetch(`${url}/stream`).body();
      let decoder = new TextDecoder();
      let chunks: string[] = [];

      for (let chunk of yield* each(body)) {
        chunks.push(decoder.decode(chunk, { stream: true }));
        yield* each.next();
      }

      chunks.push(decoder.decode());
      expect(chunks.join("")).toEqual("chunk-1chunk-2chunk-3");
    });

    it("throws HttpError with fetch().expect().json()", function* () {
      let result = yield* box(() => fetch(`${url}/missing`).expect().json());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(HttpError);
        expect(result.error).toMatchObject({
          status: 404,
          statusText: "Not Found",
        });
      }
    });

    it("chains expect() before json() successfully", function* () {
      let data = yield* fetch(`${url}/json`)
        .expect()
        .json<{ id: number; title: string }>();

      expect(data).toEqual({ id: 1, title: "do things" });
    });
  });

  describe("middleware API", () => {
    it("can intercept requests with logging", function* () {
      let requestedUrls: string[] = [];

      yield* fetchApi.around({
        *fetch(args, next) {
          let [input] = args;
          requestedUrls.push(String(input));
          return yield* next(...args);
        },
      });

      yield* fetch(`${url}/json`).json();
      yield* fetch(`${url}/text`).text();

      expect(requestedUrls).toEqual([`${url}/json`, `${url}/text`]);
    });

    it("can mock responses", function* () {
      // Create a mock response
      const mockResponse: FetchResponse = {
        raw: new Response(JSON.stringify({ mocked: true })),
        bodyUsed: false,
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        url: "mock://test",
        redirected: false,
        type: "basic",
        *json<T>(): Operation<T> {
          return { mocked: true } as T;
        },
        *text(): Operation<string> {
          return '{"mocked": true}';
        },
        *arrayBuffer(): Operation<ArrayBuffer> {
          return new ArrayBuffer(0);
        },
        *blob(): Operation<Blob> {
          return new Blob();
        },
        *formData(): Operation<FormData> {
          return new FormData();
        },
        body() {
          throw new Error("Not implemented");
        },
        *expect() {
          return this;
        },
      };

      yield* fetchApi.around({
        *fetch(args, next) {
          let [input] = args;
          if (String(input).includes("/mocked")) {
            return mockResponse;
          }
          return yield* next(...args);
        },
      });

      // This should be mocked
      let mockedData = yield* fetch(`${url}/mocked`).json<{
        mocked: boolean;
      }>();
      expect(mockedData).toEqual({ mocked: true });

      // This should still hit the real server
      let realData = yield* fetch(`${url}/json`).json<{
        id: number;
        title: string;
      }>();
      expect(realData).toEqual({ id: 1, title: "do things" });
    });

    it("middleware is scoped and does not leak", function* () {
      let outerCalls: string[] = [];
      let innerCalls: string[] = [];

      yield* fetchApi.around({
        *fetch(args, next) {
          outerCalls.push("outer");
          return yield* next(...args);
        },
      });

      // Make a request in outer scope
      yield* fetch(`${url}/json`).json();

      // Spawn a child scope with additional middleware
      let task = yield* spawn(function* () {
        yield* fetchApi.around({
          *fetch(args, next) {
            innerCalls.push("inner");
            return yield* next(...args);
          },
        });

        // Make request in inner scope - should hit both middlewares
        yield* fetch(`${url}/json`).json();
      });

      yield* task;

      // Outer scope should only have outer middleware call
      expect(outerCalls).toEqual(["outer", "outer"]);
      // Inner scope should have one call
      expect(innerCalls).toEqual(["inner"]);
    });
  });
});
