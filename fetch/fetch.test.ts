import { beforeEach, describe, it } from "@effectionx/bdd";
import { expect } from "expect";

import {
  type IncomingMessage,
  type ServerResponse,
  createServer,
} from "node:http";
import { type Operation, call, each, ensure, withResolvers } from "effection";

import { HttpError, fetch } from "./fetch.ts";

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

      if (req.url === "/slow") {
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

  it("throws HttpError for ensureOk() when response is not ok", function* () {
    let response = yield* fetch(`${url}/missing`);
    let error = yield* captureError(response.ensureOk());

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({
      status: 404,
      statusText: "Not Found",
    });
  });

  it("prevents consuming the body twice", function* () {
    let response = yield* fetch(`${url}/text`);

    expect(yield* response.text()).toEqual("hello");

    let error = yield* captureError(response.json());
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      message: "Body has already been consumed",
    });
  });

  it("clones responses before body consumption", function* () {
    let response = yield* fetch(`${url}/text`);
    let clone = response.clone();

    expect(yield* response.text()).toEqual("hello");
    expect(yield* clone.text()).toEqual("hello");
  });

  it("aborts when init.signal is aborted", function* () {
    let controller = new AbortController();
    controller.abort();

    let error = yield* captureError(
      fetch(`${url}/slow`, { signal: controller.signal }),
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: "AbortError" });
  });
});

function* captureError(
  operation: Operation<unknown>,
): Operation<unknown | undefined> {
  try {
    yield* operation;
    return undefined;
  } catch (error) {
    return error;
  }
}
