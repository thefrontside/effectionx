/**
 * Tests for nodeRuntime() — Node.js DurableRuntime implementation.
 */

import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { nodeRuntime } from "./node-runtime.ts";

describe("nodeRuntime", () => {
  const runtime = nodeRuntime();

  describe("exec", () => {
    it("runs a command and captures stdout", function* () {
      const result = yield* runtime.exec({
        command: ["echo", "hello world"],
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("hello world");
      expect(result.stderr).toBe("");
    });

    it("captures stderr", function* () {
      const result = yield* runtime.exec({
        command: ["node", "-e", "console.error('oops')"],
      });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("oops");
    });

    it("returns non-zero exit code", function* () {
      const result = yield* runtime.exec({
        command: ["node", "-e", "process.exit(42)"],
      });
      expect(result.exitCode).toBe(42);
    });

    it("supports cwd option", function* () {
      const result = yield* runtime.exec({
        command: ["pwd"],
        cwd: "/tmp",
      });
      // /tmp may resolve to /private/tmp on macOS
      expect(result.stdout.trim()).toMatch(/\/tmp$/);
    });
  });

  describe("readTextFile", () => {
    it("reads a text file", function* () {
      const content = yield* runtime.readTextFile(
        "durable-effects/package.json",
      );
      expect(content).toContain("@effectionx/durable-effects");
    });

    it("throws on missing file", function* () {
      try {
        yield* runtime.readTextFile("nonexistent-file.txt");
        expect(true).toBe(false); // should not reach
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    });
  });

  describe("glob", () => {
    it("finds files matching a pattern", function* () {
      const results = yield* runtime.glob({
        patterns: ["*.ts"],
        root: "durable-effects",
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.path.endsWith(".ts"))).toBe(true);
      expect(results.every((r) => r.isFile)).toBe(true);
    });

    it("returns empty for no matches", function* () {
      const results = yield* runtime.glob({
        patterns: ["*.nonexistent"],
        root: "durable-effects",
      });
      expect(results).toEqual([]);
    });
  });

  describe("env", () => {
    it("reads an environment variable", function* () {
      const path = runtime.env("PATH");
      expect(path).toBeDefined();
      expect(typeof path).toBe("string");
    });

    it("returns undefined for unset variable", function* () {
      const val = runtime.env("DEFINITELY_NOT_SET_12345");
      expect(val).toBeUndefined();
    });
  });

  describe("platform", () => {
    it("returns os and arch", function* () {
      const { os, arch } = runtime.platform();
      expect(typeof os).toBe("string");
      expect(typeof arch).toBe("string");
      expect(os.length).toBeGreaterThan(0);
      expect(arch.length).toBeGreaterThan(0);
    });
  });
});
