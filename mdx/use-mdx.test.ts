import { describe, it } from "@effectionx/bdd";
import { call, spawn, suspend } from "effection";
import { expect } from "expect";

import { type JSXRuntime, useMDX } from "./use-mdx.ts";

// Mock JSX runtime that records calls for verification
function createMockRuntime() {
  const calls: Array<{ fn: string; type: unknown; props: unknown }> = [];

  const runtime: JSXRuntime = {
    jsx: (type: unknown, props: unknown) => {
      calls.push({ fn: "jsx", type, props });
      return { type, props };
    },
    jsxs: (type: unknown, props: unknown) => {
      calls.push({ fn: "jsxs", type, props });
      return { type, props };
    },
    Fragment: Symbol("Fragment"),
  };

  return { runtime, calls };
}

describe("useMDX", () => {
  describe("Effection integration", () => {
    it("returns an Operation that can be yielded", function* () {
      const { runtime } = createMockRuntime();

      // This verifies useMDX returns a proper Operation
      const mod = yield* useMDX("# Test", runtime);

      expect(mod).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });

    it("can be spawned as a concurrent task", function* () {
      const { runtime } = createMockRuntime();

      // Verify it works when spawned
      const task = yield* spawn(function* () {
        return yield* useMDX("# Spawned", runtime);
      });

      const mod = yield* task;
      expect(mod).toBeDefined();
    });
  });

  describe("JSX runtime usage", () => {
    it("calls the provided jsx/jsxs functions when rendering", function* () {
      const { runtime, calls } = createMockRuntime();

      const mod = yield* useMDX("# Hello", runtime);

      // Clear any calls from evaluation
      calls.length = 0;

      // Render the module
      yield* call(() => mod.default({}));

      // Verify jsx functions were called during render
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.some((c) => c.fn === "jsx" || c.fn === "jsxs")).toBe(true);
    });

    it("uses jsx functions from the provided runtime", function* () {
      const jsxCalls: unknown[] = [];

      const runtime: JSXRuntime = {
        jsx: (type, props) => {
          jsxCalls.push({ type, props });
          return { type, props };
        },
        jsxs: () => ({}),
        Fragment: Symbol("Fragment"),
      };

      const mod = yield* useMDX("# Test", runtime);
      yield* call(() => mod.default({}));

      // jsx should be used as fallback
      expect(jsxCalls.length).toBeGreaterThan(0);
    });
  });

  describe("error handling", () => {
    it("throws on invalid MDX syntax", function* () {
      const { runtime } = createMockRuntime();

      // Unclosed JSX tag should cause a parse error
      const invalidMdx = "<div>unclosed";

      let error: Error | undefined;
      try {
        yield* useMDX(invalidMdx, runtime);
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
    });

    it("propagates errors from MDX evaluation", function* () {
      const { runtime } = createMockRuntime();

      // Invalid JavaScript in MDX should fail
      const invalidJs = "{(() => { throw new Error('boom') })()}";

      let error: Error | undefined;
      try {
        const mod = yield* useMDX(invalidJs, runtime);
        yield* call(() => mod.default({}));
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
    });
  });

  describe("plugin support", () => {
    it("applies remark plugins to transform markdown", function* () {
      const { runtime } = createMockRuntime();
      let pluginCalled = false;

      // Simple remark plugin that just marks itself as called
      const testPlugin = () => () => {
        pluginCalled = true;
      };

      yield* useMDX("# Test", {
        ...runtime,
        remarkPlugins: [testPlugin],
      });

      expect(pluginCalled).toBe(true);
    });

    it("applies rehype plugins to transform HTML", function* () {
      const { runtime } = createMockRuntime();
      let pluginCalled = false;

      // Simple rehype plugin
      const testPlugin = () => () => {
        pluginCalled = true;
      };

      yield* useMDX("# Test", {
        ...runtime,
        rehypePlugins: [testPlugin],
      });

      expect(pluginCalled).toBe(true);
    });
  });
});
