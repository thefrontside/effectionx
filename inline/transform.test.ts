import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { transformSource } from "./transform.ts";

describe("transformSource", () => {
  it("transforms yield* into yield $$inline(...)", function* () {
    let input = `function* gen() { let x = yield* foo(); }`;
    let { code, transformed } = transformSource(input, "test.ts");

    expect(transformed).toBe(true);
    expect(code).toContain(
      'import { inline as $$inline } from "@effectionx/inline"',
    );
    expect(code).toContain("yield $$inline(foo())");
    expect(code).not.toContain("yield*");
  });

  it("does not transform plain yield", function* () {
    let input = `function* gen() { let x = yield foo(); }`;
    let { code, transformed } = transformSource(input, "test.ts");

    expect(transformed).toBe(false);
    expect(code).toBe(input);
  });

  it("does not transform non-generator functions", function* () {
    let input = `function foo() { return 1; }`;
    let { code, transformed } = transformSource(input, "test.ts");

    expect(transformed).toBe(false);
    expect(code).toBe(input);
  });

  it("transforms multiple yield* expressions", function* () {
    let input = `function* gen() {
  let a = yield* foo();
  let b = yield* bar();
  return a + b;
}`;
    let { code, transformed } = transformSource(input, "test.ts");

    expect(transformed).toBe(true);
    expect(code).toContain("yield $$inline(foo())");
    expect(code).toContain("yield $$inline(bar())");
    expect(code).not.toContain("yield*");
  });

  it("transforms yield* inside for-of expressions", function* () {
    let input = `function* gen() {
  for (let x of yield* each(stream)) {
    yield* each.next();
  }
}`;
    let { code, transformed } = transformSource(input, "test.ts");

    expect(transformed).toBe(true);
    expect(code).toContain("$$inline(each(stream))");
    expect(code).toContain("$$inline(each.next())");
    expect(code).not.toContain("yield*");
  });

  it("transforms nested generator functions", function* () {
    let input = `function* outer() {
  yield* (function*() {
    yield* inner();
  })();
}`;
    let { code, transformed } = transformSource(input, "test.ts");

    expect(transformed).toBe(true);
    expect(code).toContain("$$inline(inner())");
    expect(code).not.toContain("yield*");
  });

  it("adds the import exactly once", function* () {
    let input = `function* gen() {
  yield* a();
  yield* b();
  yield* c();
}`;
    let { code } = transformSource(input, "test.ts");

    let importCount = (code.match(/@effectionx\/inline/g) || []).length;
    expect(importCount).toBe(1);
  });

  it("handles files with no generators", function* () {
    let input = `export const x = 1; export function foo() { return 2; }`;
    let { code, transformed } = transformSource(input, "test.ts");

    expect(transformed).toBe(false);
    expect(code).toBe(input);
  });

  it("handles TypeScript syntax", function* () {
    let input = `function* gen(): Operation<number> {
  let x: number = yield* createNumber(5);
  return x;
}`;
    let { code, transformed } = transformSource(input, "test.ts");

    expect(transformed).toBe(true);
    expect(code).toContain("$$inline(createNumber(5))");
  });

  describe('"no inline" file directive', () => {
    it("skips the entire file when directive is at the top", function* () {
      let input = `"no inline";
function* gen() { let x = yield* foo(); }`;
      let { code, transformed } = transformSource(input, "test.ts");

      expect(transformed).toBe(false);
      expect(code).not.toContain("$$inline");
      expect(code).toContain("yield*");
      expect(code).not.toContain("no inline");
    });

    it("removes the directive from output", function* () {
      let input = `"no inline";
export const x = 1;`;
      let { code } = transformSource(input, "test.ts");

      expect(code).not.toContain("no inline");
      expect(code).toContain("x = 1");
    });

    it("skips all generators including nested ones", function* () {
      let input = `"no inline";
function* outer() {
  yield* (function*() {
    yield* inner();
  })();
}`;
      let { code, transformed } = transformSource(input, "test.ts");

      expect(transformed).toBe(false);
      expect(code).not.toContain("$$inline");
    });
  });

  describe("@noinline JSDoc annotation", () => {
    it("skips an annotated generator function", function* () {
      let input = `/** @noinline */
function* plain() {
  yield* array;
}
function* effection() {
  yield* operation();
}`;
      let { code, transformed } = transformSource(input, "test.ts");

      expect(transformed).toBe(true);
      expect(code).toContain("yield* array");
      expect(code).toContain("$$inline(operation())");
    });

    it("still transforms nested generators inside an annotated generator", function* () {
      let input = `/** @noinline */
function* outer() {
  yield* (function*() {
    yield* inner();
  })();
}`;
      let { code, transformed } = transformSource(input, "test.ts");

      expect(transformed).toBe(true);
      expect(code).toContain("$$inline(inner())");
      expect(code).toContain("yield*");
    });

    it("works with multi-line JSDoc comments", function* () {
      let input = `/**
 * Flattens nested arrays.
 * @noinline
 */
function* flatten(arrays) {
  for (let array of arrays) {
    yield* array;
  }
}`;
      let { code, transformed } = transformSource(input, "test.ts");

      expect(transformed).toBe(false);
      expect(code).toContain("yield*");
      expect(code).not.toContain("$$inline");
    });

    it("does not match regular comments (non-JSDoc)", function* () {
      let input = `// @noinline
function* gen() {
  yield* foo();
}`;
      let { code, transformed } = transformSource(input, "test.ts");

      expect(transformed).toBe(true);
      expect(code).toContain("$$inline(foo())");
    });

    it("does not match @noinline in non-adjacent comments", function* () {
      let input = `/** @noinline */
let x = 1;
function* gen() {
  yield* foo();
}`;
      let { code, transformed } = transformSource(input, "test.ts");

      expect(transformed).toBe(true);
      expect(code).toContain("$$inline(foo())");
    });
  });
});
