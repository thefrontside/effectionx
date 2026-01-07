import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import type { Scope } from "effection";

import { readTree } from "./lib/mod.ts";

// helper to construct v3 frames
export function v3Frame(
  context: Record<string, unknown>,
  children: unknown[] = [],
) {
  const normalized = children.map((c) => {
    if (c && typeof c === "object") {
      const obj = c as Record<string, unknown>;
      if ("frame" in obj) {
        return obj["frame"] as {
          context: Record<string, unknown>;
          children: unknown;
        };
      }
    }
    return c;
  });

  return { frame: { context, children: new Set(normalized) } };
}

// helper to construct v4 scopes
export function v4Scope(
  contexts: Record<string, unknown>,
  children: unknown[] = [],
) {
  const normalized = children.map((c) => {
    if (c && typeof c === "object") {
      const obj = c as Record<string, unknown>;
      if ("contexts" in obj) {
        return obj as { contexts: Record<string, unknown> };
      }
    }
    return c;
  });

  return {
    contexts: Object.assign({}, contexts, {
      "@effection/scope.children": new Set(normalized),
    }),
  };
}

describe("readTree()", () => {
  it("reads v3 style scopes", function* () {
    const root = v3Frame({ foo: 1 }, [v3Frame({ bar: 2 })]);

    const tree = readTree(root as unknown as Scope);
    expect(tree).toEqual({
      data: { foo: 1 },
      children: [{ data: { bar: 2 }, children: [] }],
    });
  });

  it("reads v4 style scopes", function* () {
    const root = v4Scope({ foo: 3 }, [v4Scope({ bar: 4 })]);

    const tree = readTree(root as unknown as Scope);
    expect(tree).toEqual({
      data: { foo: 3, "@effection/scope.children": {} },
      children: [
        { data: { bar: 4, "@effection/scope.children": {} }, children: [] },
      ],
    });
  });

  it("handles unserializable values gracefully", function* () {
    const circular: Record<string, unknown> = {} as Record<string, unknown>;
    // create a non-serializable reference
    (circular as Record<string, unknown>)["self"] = circular;

    const root = v3Frame({ bad: circular });
    const tree = readTree(root as unknown as Scope);

    const data = (tree as unknown as { data: Record<string, unknown> }).data;
    expect(data["bad"]).toBe("unserializable");
  });

  it("throws for unknown scope shapes", function* () {
    expect(() => readTree({} as unknown as Scope)).toThrow(TypeError);
  });
});
