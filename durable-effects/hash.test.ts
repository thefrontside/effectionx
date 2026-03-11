/**
 * Tests for computeSHA256 hashing utility.
 */

import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { computeSHA256 } from "./hash.ts";

describe("computeSHA256", () => {
  it("returns a sha256-prefixed hex string", function* () {
    const hash = yield* computeSHA256("hello world");
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("produces deterministic output for the same input", function* () {
    const hash1 = yield* computeSHA256("test content");
    const hash2 = yield* computeSHA256("test content");
    expect(hash1).toBe(hash2);
  });

  it("produces different output for different input", function* () {
    const hash1 = yield* computeSHA256("content A");
    const hash2 = yield* computeSHA256("content B");
    expect(hash1).not.toBe(hash2);
  });

  it("handles empty string", function* () {
    const hash = yield* computeSHA256("");
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    // SHA-256 of empty string is well-known
    expect(hash).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("handles unicode content", function* () {
    const hash = yield* computeSHA256("日本語テスト 🚀");
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("handles large content", function* () {
    const largeContent = "x".repeat(100_000);
    const hash = yield* computeSHA256(largeContent);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
