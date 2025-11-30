import {
  afterAll,
  describe as $describe,
  it as $it,
} from "@std/testing/bdd";
import { createBDD } from "./bdd.ts";

const bdd = createBDD({
  describe: $describe,
  it: $it,
  afterAll,
});

export const { describe, it, beforeAll, beforeEach } = bdd;
