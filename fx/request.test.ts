import { describe, it } from "@effectionx/bdd";
import { expect } from "@std/expect";

import { json, request } from "./request.ts";

// Ensure to run tests with --allow-net permission
describe("request() and json()", () => {
  it("should fetch a URL and return a response", function* () {
    const response = yield* request(
      "https://jsonplaceholder.typicode.com/todos/1",
    );
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });

  it("should parse JSON from a response", function* () {
    const response = yield* request(
      "https://jsonplaceholder.typicode.com/todos/1",
    );
    const data = yield* json(response);
  
    expect(data).toHaveProperty("id", 1);
    expect(data).toHaveProperty("title");
  });
});

