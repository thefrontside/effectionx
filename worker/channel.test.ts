import { describe, it } from "@effectionx/bdd";
import { once, spawn } from "effection";
import { expect } from "expect";

import { useChannelResponse, useChannelRequest } from "./channel.ts";

describe("channel", () => {
  describe("useChannelResponse", () => {
    it("creates a channel with a transferable port", function* () {
      const { port } = yield* useChannelResponse<string>();

      expect(port).toBeInstanceOf(MessagePort);
    });

    it("receives response data via operation", function* () {
      const { port, operation } = yield* useChannelResponse<string>();

      // Simulate responder sending a response
      yield* spawn(function* () {
        port.start();
        port.postMessage("hello from responder");
        // Responder would wait for ACK here in real usage
      });

      const result = yield* operation;
      expect(result).toEqual("hello from responder");
    });

    it("sends ACK after receiving response", function* () {
      // Use full round-trip to verify ACK is received
      const { port, operation } = yield* useChannelResponse<string>();

      // Spawn responder - it uses useChannelRequest which waits for ACK
      yield* spawn(function* () {
        const { resolve } = yield* useChannelRequest<string>(port);
        // This will block until ACK is received
        yield* resolve("response data");
      });

      const result = yield* operation;
      // If we got here, the ACK was sent and received
      expect(result).toEqual("response data");
    });
  });

  describe("useChannelRequest", () => {
    it("resolve sends value and waits for ACK", function* () {
      const channel = new MessageChannel();
      channel.port1.start();

      let valueReceived: unknown = null;

      // Simulate requester on port1 using effection
      yield* spawn(function* () {
        const event = yield* once(channel.port1, "message");
        valueReceived = (event as MessageEvent).data;
        // Send ACK
        channel.port1.postMessage({ type: "ack" });
      });

      // Responder on port2
      const { resolve } = yield* useChannelRequest<string>(channel.port2);
      yield* resolve("success value");

      expect(valueReceived).toEqual("success value");
    });

    it("reject sends error and waits for ACK", function* () {
      const channel = new MessageChannel();
      channel.port1.start();

      let errorReceived: unknown = null;

      // Simulate requester on port1 using effection
      yield* spawn(function* () {
        const event = yield* once(channel.port1, "message");
        errorReceived = (event as MessageEvent).data;
        // Send ACK
        channel.port1.postMessage({ type: "ack" });
      });

      // Responder on port2
      const { reject } = yield* useChannelRequest<string>(channel.port2);
      const error = new Error("test error");
      yield* reject(error);

      // Error is transferred via structured clone, so compare by message
      expect(errorReceived).toBeInstanceOf(Error);
      expect((errorReceived as Error).message).toEqual("test error");
    });

    it("throws on invalid ACK message", function* () {
      const channel = new MessageChannel();
      channel.port1.start();

      // Simulate requester sending wrong ACK using effection
      yield* spawn(function* () {
        yield* once(channel.port1, "message");
        // Send wrong message instead of ACK
        channel.port1.postMessage({ type: "wrong" });
      });

      const { resolve } = yield* useChannelRequest<string>(channel.port2);

      try {
        yield* resolve("value");
        throw new Error("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).message).toContain("Expected ACK");
      }
    });
  });

  describe("full round-trip", () => {
    it("requester sends, responder resolves, requester receives", function* () {
      const { port, operation } = yield* useChannelResponse<string>();

      // Spawn responder
      yield* spawn(function* () {
        const { resolve } = yield* useChannelRequest<string>(port);
        yield* resolve("response from responder");
      });

      const result = yield* operation;
      expect(result).toEqual("response from responder");
    });

    it("requester sends, responder rejects, requester receives error", function* () {
      const { port, operation } = yield* useChannelResponse<Error>();

      const testError = new Error("responder error");

      // Spawn responder
      yield* spawn(function* () {
        const { reject } = yield* useChannelRequest<string>(port);
        yield* reject(testError);
      });

      const result = yield* operation;
      // Error is transferred via structured clone, so compare properties
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toEqual(testError.message);
    });

    it("handles complex data types", function* () {
      interface ComplexData {
        name: string;
        count: number;
        nested: { items: string[] };
      }

      const { port, operation } = yield* useChannelResponse<ComplexData>();

      const testData: ComplexData = {
        name: "test",
        count: 42,
        nested: { items: ["a", "b", "c"] },
      };

      // Spawn responder
      yield* spawn(function* () {
        const { resolve } = yield* useChannelRequest<ComplexData>(port);
        yield* resolve(testData);
      });

      const result = yield* operation;
      expect(result).toEqual(testData);
    });
  });
});
