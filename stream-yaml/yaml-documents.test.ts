import { describe, it } from "@effectionx/bdd";
import { createChannel, spawn } from "effection";
import { expect } from "expect";

import { type Document, yamlDocuments } from "./mod.ts";

describe("yamlDocuments", () => {
  it("parses a single document", function* () {
    const channel = createChannel<string, string>();

    const stream = yamlDocuments()(channel);
    const subscription = yield* stream;

    yield* spawn(function* () {
      yield* channel.send("foo: bar\n");
      yield* channel.close("done");
    });

    const first = yield* subscription.next();
    expect(first.done).toBe(false);
    expect((first.value as Document.Parsed).toJS()).toEqual({ foo: "bar" });

    const second = yield* subscription.next();
    expect(second.done).toBe(true);
    expect(second.value).toBe("done");
  });

  it("parses multiple documents separated by ---", function* () {
    const channel = createChannel<string, string>();

    const stream = yamlDocuments()(channel);
    const subscription = yield* stream;

    yield* spawn(function* () {
      yield* channel.send("---\nfoo: 1\n---\nbar: 2\n");
      yield* channel.close("finished");
    });

    const first = yield* subscription.next();
    expect(first.done).toBe(false);
    expect((first.value as Document.Parsed).toJS()).toEqual({ foo: 1 });

    const second = yield* subscription.next();
    expect(second.done).toBe(false);
    expect((second.value as Document.Parsed).toJS()).toEqual({ bar: 2 });

    const third = yield* subscription.next();
    expect(third.done).toBe(true);
    expect(third.value).toBe("finished");
  });

  it("handles multi-document stream across multiple sends", function* () {
    const channel = createChannel<string, string>();

    const stream = yamlDocuments()(channel);
    const subscription = yield* stream;

    yield* spawn(function* () {
      // Each chunk without --- creates a separate document
      // To have multiple chunks be part of the same document, use --- markers
      yield* channel.send("---\nfoo: bar\n");
      yield* channel.send("---\nbaz: 123\n");
      yield* channel.close("chunked");
    });

    const first = yield* subscription.next();
    expect(first.done).toBe(false);
    expect((first.value as Document.Parsed).toJS()).toEqual({ foo: "bar" });

    const second = yield* subscription.next();
    expect(second.done).toBe(false);
    expect((second.value as Document.Parsed).toJS()).toEqual({ baz: 123 });

    const third = yield* subscription.next();
    expect(third.done).toBe(true);
    expect(third.value).toBe("chunked");
  });

  it("parses multiple documents in a single chunk", function* () {
    const channel = createChannel<string, string>();

    const stream = yamlDocuments()(channel);
    const subscription = yield* stream;

    yield* spawn(function* () {
      yield* channel.send("---\nfoo: 1\n---\nbar: 2\n---\nbaz: 3\n");
      yield* channel.close("multi");
    });

    const first = yield* subscription.next();
    expect(first.done).toBe(false);
    expect((first.value as Document.Parsed).toJS()).toEqual({ foo: 1 });

    const second = yield* subscription.next();
    expect(second.done).toBe(false);
    expect((second.value as Document.Parsed).toJS()).toEqual({ bar: 2 });

    const third = yield* subscription.next();
    expect(third.done).toBe(false);
    expect((third.value as Document.Parsed).toJS()).toEqual({ baz: 3 });

    const fourth = yield* subscription.next();
    expect(fourth.done).toBe(true);
    expect(fourth.value).toBe("multi");
  });

  it("handles document without leading ---", function* () {
    const channel = createChannel<string, string>();

    const stream = yamlDocuments()(channel);
    const subscription = yield* stream;

    yield* spawn(function* () {
      yield* channel.send("name: test\nvalue: 42\n");
      yield* channel.close("implicit");
    });

    const first = yield* subscription.next();
    expect(first.done).toBe(false);
    expect((first.value as Document.Parsed).toJS()).toEqual({
      name: "test",
      value: 42,
    });

    const second = yield* subscription.next();
    expect(second.done).toBe(true);
    expect(second.value).toBe("implicit");
  });

  it("handles nested YAML structures", function* () {
    const channel = createChannel<string, string>();

    const stream = yamlDocuments()(channel);
    const subscription = yield* stream;

    yield* spawn(function* () {
      yield* channel.send(
        "root:\n  nested:\n    value: deep\n  list:\n    - one\n    - two\n",
      );
      yield* channel.close("nested");
    });

    const first = yield* subscription.next();
    expect(first.done).toBe(false);
    expect((first.value as Document.Parsed).toJS()).toEqual({
      root: {
        nested: { value: "deep" },
        list: ["one", "two"],
      },
    });

    const second = yield* subscription.next();
    expect(second.done).toBe(true);
    expect(second.value).toBe("nested");
  });
});
