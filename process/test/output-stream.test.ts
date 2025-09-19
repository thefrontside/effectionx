// import { expect } from "@std/expect";
// import { createSignal, each, spawn } from "effection";
// import { describe, it } from "@effectionx/bdd";

// import { createOutputStream } from "../src/output-stream.ts";
// import { Buffer } from "node:buffer";

// const b = (value: string) => Buffer.from(value, "utf8");

// describe("createOutputStream", () => {
//   it("can be created from regular stream", function* () {
//     const stream = createSignal<Buffer, void>();

//     let ioStream = yield* createOutputStream(stream);
//     let values: Buffer[] = [];

//     yield* spawn(function* () {
//       for (const value of yield* each(ioStream)) {
//         values.push(value);
//         yield* each.next();
//       }
//     });

//     stream.send(b("foo"));
//     stream.send(b("bar"));
//     stream.send(b("baz"));

//     expect(values).toEqual([b("foo"), b("bar"), b("baz")]);
//   });
// });

// describe("text()", () => {
//   it("maps output to string", function* () {
//     const stream = createSignal<Buffer, void>();
//     let ioStream = createOutputStream(stream);
//     let values: string[] = [];

//     yield* spawn(function* () {
//       for (const value of yield* each(ioStream.text())) {
//         values.push(value);
//         yield* each.next();
//       }
//     });

//     stream.send(b("foo"));
//     stream.send(b("bar"));
//     stream.send(b("baz"));

//     expect(values).toEqual(["foo", "bar", "baz"]);
//   });
// });

// describe("lines()", () => {
//   it("combines output into complete lines", function* () {
//     const stream = createSignal<Buffer, void>();
//     let ioStream = createOutputStream(stream);
//     let values: string[] = [];

//     yield* spawn(function* () {
//       for (const value of yield* each(ioStream.lines())) {
//         values.push(value);
//         yield* each.next();
//       }
//     });

//     stream.send(b("foo\nhello"));
//     stream.send(b("world\n"));
//     stream.send(b("something"));
//     stream.close();

//     expect(values).toEqual(["foo", "helloworld", "something"]);
//   });
// });
