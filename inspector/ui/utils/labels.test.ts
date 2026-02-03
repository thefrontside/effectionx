import { describe, it, expect } from "vitest";
import { flattenNodeData } from "./labels";

describe("flattenNodeData", () => {
  it("flattens single top-level labels object and stringifies values", () => {
    const data = {
      "@effectionx/inspector.labels": {
        name: "Global",
        port: 41000,
        meta: { a: 1 },
        args: ["--break"],
      },
    };

    const props = flattenNodeData(data);
    const map = Object.fromEntries(props.map((p) => [p.k, p.v]));

    expect(map.name).toBe("Global");
    expect(map.port).toBe("41000");
    expect(map.meta).toBe(JSON.stringify({ a: 1 }));
    expect(map.args).toBe(JSON.stringify(["--break"]));
  });

  it("prefixes keys when there are multiple top-level objects", () => {
    const data = {
      foo: { a: 1 },
      bar: { b: true },
      baz: "simple",
    };

    const props = flattenNodeData(data);
    const map = Object.fromEntries(props.map((p) => [p.k, p.v]));

    expect(map["foo.a"]).toBe(JSON.stringify({ a: 1 }));
    expect(map["bar.b"]).toBe(JSON.stringify({ b: true }));
    expect(map.baz).toBe("simple");
  });
});
