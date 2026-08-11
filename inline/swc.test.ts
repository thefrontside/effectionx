import { describe, it } from "@effectionx/bdd";
import { until } from "effection";
import { expect } from "expect";
import { transform } from "@swc/core";
import path from "node:path";
import url from "node:url";

describe("SWC WASM plugin", () => {
  it("transforms yield* into yield $$inline(...)", function* () {
    let input = `function* gen() { let x = yield* foo(); }`;
    let { code } = yield* until(swcTransform(input));

    expect(code).toContain("$$inline");
    expect(code).toContain("yield $$inline(foo())");
    expect(code).not.toContain("yield*");
  });

  it("adds the @effectionx/inline import", function* () {
    let input = `function* gen() { yield* foo(); }`;
    let { code } = yield* until(swcTransform(input));

    expect(code).toContain(
      'import { inline as $$inline } from "@effectionx/inline"',
    );
  });

  it("does not transform plain yield", function* () {
    let input = `function* gen() { let x = yield foo(); }`;
    let { code } = yield* until(swcTransform(input));

    expect(code).not.toContain("$$inline");
    expect(code).toContain("yield foo()");
  });

  it("does not transform non-generator functions", function* () {
    let input = `function foo() { return 1; }`;
    let { code } = yield* until(swcTransform(input));

    expect(code).not.toContain("$$inline");
  });

  it("transforms multiple yield* expressions", function* () {
    let input = `function* gen() {
  let a = yield* foo();
  let b = yield* bar();
  return a + b;
}`;
    let { code } = yield* until(swcTransform(input));

    expect(code).toContain("$$inline(foo())");
    expect(code).toContain("$$inline(bar())");
    expect(code).not.toContain("yield*");
  });

  it("handles TypeScript syntax", function* () {
    let input = `function* gen(): Operation<number> {
  let x: number = yield* createNumber(5);
  return x;
}`;
    let { code } = yield* until(swcTransform(input));

    expect(code).toContain("$$inline(createNumber(5))");
  });

  it("skips the entire file with 'no inline' directive", function* () {
    let input = `"no inline";
function* gen() { let x = yield* foo(); }`;
    let { code } = yield* until(swcTransform(input));

    expect(code).not.toContain("$$inline");
    expect(code).toContain("yield*");
  });

  it("adds the import exactly once", function* () {
    let input = `function* gen() {
  yield* a();
  yield* b();
  yield* c();
}`;
    let { code } = yield* until(swcTransform(input));

    let count = (code.match(/@effectionx\/inline/g) || []).length;
    expect(count).toBe(1);
  });
});

const dir = path.dirname(url.fileURLToPath(import.meta.url));
const wasm = path.resolve(
  dir,
  "swc/target/wasm32-wasip1/release/swc_plugin_inline.wasm",
);

function swcTransform(source: string) {
  return transform(source, {
    filename: "input.ts",
    jsc: {
      parser: {
        syntax: "typescript",
      },
      target: "esnext",
      experimental: {
        plugins: [[wasm, {}]],
      },
    },
    isModule: true,
  });
}
