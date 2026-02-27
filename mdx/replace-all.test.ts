import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";

import { replaceAll } from "./replace-all.ts";

describe("replaceAll", () => {
  it("replaces all matches with sync-like operations", function* () {
    const result = yield* replaceAll(
      "Hello {{name}}, welcome to {{place}}!",
      /\{\{(\w+)\}\}/g,
      function* (match) {
        const [, key] = match;
        const values: Record<string, string> = {
          name: "World",
          place: "Effection",
        };
        return values[key] ?? match[0];
      },
    );

    expect(result).toBe("Hello World, welcome to Effection!");
  });

  it("returns input unchanged when no matches", function* () {
    const result = yield* replaceAll(
      "Hello World",
      /\{\{(\w+)\}\}/g,
      function* () {
        return "REPLACED";
      },
    );

    expect(result).toBe("Hello World");
  });

  it("handles single match", function* () {
    const result = yield* replaceAll(
      "Hello {{name}}",
      /\{\{(\w+)\}\}/g,
      function* () {
        return "World";
      },
    );

    expect(result).toBe("Hello World");
  });

  it("adds global flag if missing", function* () {
    const result = yield* replaceAll(
      "a1b2c3",
      /\d/, // no global flag
      function* (match) {
        return `[${match[0]}]`;
      },
    );

    expect(result).toBe("a[1]b[2]c[3]");
  });

  it("handles adjacent matches", function* () {
    const result = yield* replaceAll(
      "{{a}}{{b}}{{c}}",
      /\{\{(\w+)\}\}/g,
      function* (match) {
        return match[1].toUpperCase();
      },
    );

    expect(result).toBe("ABC");
  });

  it("handles empty replacement", function* () {
    const result = yield* replaceAll(
      "remove [this] please",
      /\[.*?\]/g,
      function* () {
        return "";
      },
    );

    expect(result).toBe("remove  please");
  });

  it("provides full match info to replacement function", function* () {
    const matches: RegExpMatchArray[] = [];

    yield* replaceAll("hello-world-test", /(\w+)-(\w+)/g, function* (match) {
      matches.push(match);
      return "replaced";
    });

    // First match: "hello-world"
    expect(matches.length).toBe(1);
    expect(matches[0][0]).toBe("hello-world");
    expect(matches[0][1]).toBe("hello");
    expect(matches[0][2]).toBe("world");
  });

  it("handles special regex characters in replacement", function* () {
    const result = yield* replaceAll(
      "Hello $name$",
      /\$(\w+)\$/g,
      function* () {
        return "World";
      },
    );

    expect(result).toBe("Hello World");
  });
});
