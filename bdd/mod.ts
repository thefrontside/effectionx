// Runtime detection: use Deno or Node.js BDD implementation
// For explicit imports, use @effectionx/bdd/deno or @effectionx/bdd/node

import type { BDD } from "./bdd.ts";

const isDeno =
  typeof (globalThis as Record<string, unknown>).Deno !== "undefined";

// Use dynamic import paths to avoid TypeScript analyzing the Deno module
// which has dependencies that don't resolve in Node
const modulePath = isDeno ? "./mod.deno.ts" : "./mod.node.ts";
const bdd: BDD = await import(modulePath);

export const { describe, it, beforeAll, beforeEach } = bdd;
