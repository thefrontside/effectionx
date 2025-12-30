import { beforeEach, describe, it } from "@effectionx/bdd";
import { expect } from "@std/expect";

import { call, ensure, withResolvers } from "effection";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { json, request } from "./request.ts";

// Ensure to run tests with --allow-net permission
describe("request() and json()", () => {
  let url: string;
  beforeEach(function* () {
    let server = createServer(
      (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: 1, title: "do things" }));
      },
    );

    const ready = withResolvers<void>();
    server.listen(0, () => ready.resolve());
    yield* ready.operation;

    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    url = `http://localhost:${port}/todos/1`;
    yield* ensure(() =>
      call(() => new Promise<void>((resolve) => server.close(() => resolve())))
    );
  });

  it("returns a response that can be parsed with json", function* () {
    const response = yield* request(url);
    const data = yield* json(response);

    expect(data).toHaveProperty("id", 1);
    expect(data).toHaveProperty("title");
  });
});
