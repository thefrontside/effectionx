import { after, describe as $describe, it as $it } from "node:test";
import { createBDD } from "./bdd.ts";

const bdd = createBDD({
  describe: $describe,
  it: $it,
  afterAll: after,
});

export const { describe, it, beforeAll, beforeEach } = bdd;
