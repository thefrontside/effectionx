import { beforeEach, describe, it } from "@effectionx/bdd";
import { expect } from "@std/expect";

import { json, request } from "./request.ts";
import { ensure, until } from "effection";

// Ensure to run tests with --allow-net permission
describe("request() and json()", () => {
  let url: string;
  beforeEach(function* () {
    let server = Deno.serve(
      () =>
        new Response(JSON.stringify({ id: 1, title: "do things" }), {
          headers: new Headers({
            "Content-Type": "application/json",
          }),
        }),
    );

    url = `http://localhost:${server.addr.port}/todos/1`,
      yield* ensure(() => until(server.shutdown()));
  });

  it("returns a response that can be parsed with json", function* () {
    const response = yield* request(url);
    const data = yield* json(response);

    expect(data).toHaveProperty("id", 1);
    expect(data).toHaveProperty("title");
  });
});
