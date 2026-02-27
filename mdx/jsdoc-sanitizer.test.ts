import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";

import {
  createJsDocSanitizer,
  defaultLinkResolver,
} from "./jsdoc-sanitizer.ts";

describe("jsdoc-sanitizer", () => {
  describe("defaultLinkResolver", () => {
    it("resolves simple symbol", function* () {
      const result = yield* defaultLinkResolver("Context");
      expect(result).toBe("[Context](Context)");
    });

    it("resolves symbol with dot method", function* () {
      const result = yield* defaultLinkResolver("Scope", ".", "run");
      expect(result).toBe("[Scope.run](Scope.run)");
    });

    it("resolves symbol with hash method", function* () {
      const result = yield* defaultLinkResolver("Scope", "#", "run");
      expect(result).toBe("[Scope#run](Scope#run)");
    });

    it("returns empty string for empty symbol", function* () {
      const result = yield* defaultLinkResolver("");
      expect(result).toBe("");
    });
  });

  describe("createJsDocSanitizer", () => {
    const sanitize = createJsDocSanitizer();

    it("converts {@link Symbol} to markdown link", function* () {
      const result = yield* sanitize("{@link Context}");
      expect(result).toBe("[Context](Context)");
    });

    it("converts @{link Symbol} to markdown link", function* () {
      const result = yield* sanitize("@{link Scope}");
      expect(result).toBe("[Scope](Scope)");
    });

    it("handles function syntax {@link fn()}", function* () {
      const result = yield* sanitize("{@link spawn()}");
      expect(result).toBe("[spawn](spawn)");
    });

    it("handles dot method reference", function* () {
      const result = yield* sanitize("{@link Scope.run}");
      expect(result).toBe("[Scope.run](Scope.run)");
    });

    it("handles hash method reference", function* () {
      const result = yield* sanitize("{@link Scope#run}");
      expect(result).toBe("[Scope#run](Scope#run)");
    });

    it("handles complex invalid link syntax", function* () {
      // This pattern from the original tests - complex links with extra content
      const result = yield* sanitize(
        "{@link  * establish error boundaries https://frontside.com/effection/docs/errors | error boundaries}",
      );
      expect(result).toBe("");
    });

    it("handles multiple links in one string", function* () {
      const result = yield* sanitize("{@link Operation}&lt;{@link T}&gt;");
      expect(result).toBe("[Operation](Operation)&lt;[T](T)&gt;");
    });

    it("preserves text without links", function* () {
      const result = yield* sanitize("This is regular text without links.");
      expect(result).toBe("This is regular text without links.");
    });

    it("handles mixed content", function* () {
      const result = yield* sanitize(
        "Returns a {@link Context} that can be used with {@link Scope.run}.",
      );
      expect(result).toBe(
        "Returns a [Context](Context) that can be used with [Scope.run](Scope.run).",
      );
    });
  });

  describe("custom link resolver", () => {
    it("uses custom resolver for link generation", function* () {
      const sanitize = createJsDocSanitizer(
        function* (symbol, connector, method) {
          const name = [symbol, connector, method].filter(Boolean).join("");
          return `[${name}](/api/${symbol}${method ? `#${method}` : ""})`;
        },
      );

      const result = yield* sanitize("{@link Scope.run}");
      expect(result).toBe("[Scope.run](/api/Scope#run)");
    });
  });
});
