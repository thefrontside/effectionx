import { describe, it } from "@effectionx/bdd";
import { once, spawn, sleep, suspend, withResolvers, race } from "effection";
import { expect } from "expect";

import { useChannelResponse, useChannelRequest } from "./channel.ts";
import type { SerializedResult } from "./types.ts";

function* sleepThenTimeout(ms: number) {
  yield* sleep(ms);
  return "timeout" as const;
}

describe("channel", () => {
  describe("useChannelResponse", () => {
    it("creates a channel with a transferable port", function* () {
      const { port } = yield* useChannelResponse<string>();

      expect(port).toBeInstanceOf(MessagePort);
    });

    it("receives response data via operation", function* () {
      const { port, operation } = yield* useChannelResponse<string>();

      // Simulate responder sending a SerializedResult
      yield* spawn(function* () {
        port.start();
        const result: SerializedResult<string> = {
          ok: true,
          value: "hello from responder",
        };
        port.postMessage(result);
        // Responder would wait for ACK here in real usage
      });

      const result = yield* operation;
      expect(result).toEqual({ ok: true, value: "hello from responder" });
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
      expect(result).toEqual({ ok: true, value: "response data" });
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

      // Value is wrapped in SerializedResult
      expect(valueReceived).toEqual({ ok: true, value: "success value" });
    });

    it("reject sends error and waits for ACK", function* () {
      const channel = new MessageChannel();
      channel.port1.start();

      let resultReceived: unknown = null;

      // Simulate requester on port1 using effection
      yield* spawn(function* () {
        const event = yield* once(channel.port1, "message");
        resultReceived = (event as MessageEvent).data;
        // Send ACK
        channel.port1.postMessage({ type: "ack" });
      });

      // Responder on port2
      const { reject } = yield* useChannelRequest<string>(channel.port2);
      const error = new Error("test error");
      yield* reject(error);

      // Error is serialized and wrapped in SerializedResult
      const result = resultReceived as SerializedResult<string>;
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.name).toBe("Error");
        expect(result.error.message).toBe("test error");
      }
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
      expect(result).toEqual({ ok: true, value: "response from responder" });
    });

    it("requester sends, responder rejects, requester receives error", function* () {
      const { port, operation } = yield* useChannelResponse<string>();

      const testError = new Error("responder error");

      // Spawn responder
      yield* spawn(function* () {
        const { reject } = yield* useChannelRequest<string>(port);
        yield* reject(testError);
      });

      const result = yield* operation;
      // Error is serialized and wrapped in SerializedResult
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.name).toBe("Error");
        expect(result.error.message).toBe("responder error");
      }
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
      expect(result).toEqual({ ok: true, value: testData });
    });
  });

  describe("close detection (useChannelResponse)", () => {
    it("errors if responder closes port without responding", function* () {
      const { port, operation } = yield* useChannelResponse<string>();

      // Spawn responder that closes without responding
      yield* spawn(function* () {
        port.start();
        port.close(); // Close without calling resolve/reject
      });

      // Requester should get an error
      let error: Error | undefined;
      try {
        yield* operation;
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toContain("closed");
    });

    it("errors if responder scope exits without responding", function* () {
      const { port, operation } = yield* useChannelResponse<string>();

      // Spawn responder that exits without responding
      yield* spawn(function* () {
        const _request = yield* useChannelRequest<string>(port);
        // Exit without calling resolve or reject
        // finally block in useChannelRequest closes port
      });

      // Requester should get an error
      let error: Error | undefined;
      try {
        yield* operation;
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toContain("closed");
    });
  });

  describe("timeout (useChannelResponse)", () => {
    it("times out if responder is slow", function* () {
      const { port, operation } = yield* useChannelResponse<string>({
        timeout: 50,
      });

      // Spawn responder that never responds
      yield* spawn(function* () {
        port.start();
        yield* suspend(); // Never respond
      });

      // Requester should timeout
      let error: Error | undefined;
      try {
        yield* operation;
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toContain("timed out");
    });

    it("succeeds if response arrives before timeout", function* () {
      const { port, operation } = yield* useChannelResponse<string>({
        timeout: 1000,
      });

      // Spawn responder that responds quickly
      yield* spawn(function* () {
        const { resolve } = yield* useChannelRequest<string>(port);
        yield* resolve("fast response");
      });

      const result = yield* operation;
      expect(result).toEqual({ ok: true, value: "fast response" });
    });

    it("no timeout waits indefinitely but detects close", function* () {
      const { port, operation } = yield* useChannelResponse<string>(); // No timeout

      // Close port after a delay
      yield* spawn(function* () {
        port.start();
        yield* sleep(10);
        port.close();
      });

      // Should error on close, not hang
      let error: Error | undefined;
      try {
        yield* operation;
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toContain("closed");
    });
  });

  describe("cancellation (useChannelRequest)", () => {
    it("responder handles requester cancellation gracefully", function* () {
      const channel = new MessageChannel();
      channel.port1.start();
      channel.port2.start();

      const responderSentResponse = withResolvers<void>();
      const responderCompleted = withResolvers<void>();

      // Spawn responder
      yield* spawn(function* () {
        const { resolve } = yield* useChannelRequest<string>(channel.port2);

        // Signal that we're about to send (and will wait for ACK after)
        responderSentResponse.resolve();

        yield* resolve("response"); // This will wait for ACK, but detect close instead

        responderCompleted.resolve();
      });

      // Wait for responder to send response and start waiting for ACK
      yield* responderSentResponse.operation;

      // Give responder a moment to start waiting for ACK
      yield* sleep(10);

      // Close port1 (simulates requester cancellation)
      channel.port1.close();

      // Responder should complete (not hang) - race detects close
      yield* responderCompleted.operation;
    });

    it("ACK is sent for error responses", function* () {
      const { port, operation } = yield* useChannelResponse<string>();

      const ackReceived = withResolvers<void>();

      // Spawn responder that tracks ACK receipt
      yield* spawn(function* () {
        const { reject } = yield* useChannelRequest<string>(port);
        yield* reject(new Error("test error"));
        // If we get here, ACK was received (reject waits for ACK)
        ackReceived.resolve();
      });

      // Requester receives response (and sends ACK)
      const result = yield* operation;
      expect(result.ok).toBe(false);

      // Verify responder completed (meaning ACK was received)
      yield* ackReceived.operation;
    });

    it("port closes if responder exits without responding", function* () {
      const channel = new MessageChannel();
      channel.port1.start();
      channel.port2.start();

      const closeReceived = withResolvers<void>();

      // Set up close listener before spawning responder
      channel.port1.addEventListener("close", () => {
        closeReceived.resolve();
      });

      // Spawn responder that exits without responding
      yield* spawn(function* () {
        const _request = yield* useChannelRequest<string>(channel.port2);
        // Exit without calling resolve or reject
        // The finally block should close the port
      });

      // Wait for close event with a timeout (use race with sleep)
      const result = yield* race([
        closeReceived.operation,
        sleepThenTimeout(100),
      ]);

      expect(result).not.toBe("timeout");
    });

    it("port closes if responder throws before responding", function* () {
      const channel = new MessageChannel();
      channel.port1.start();
      channel.port2.start();

      const closeReceived = withResolvers<void>();

      // Set up close listener before spawning responder
      channel.port1.addEventListener("close", () => {
        closeReceived.resolve();
      });

      // Spawn responder that throws - but catch the error
      const task = yield* spawn(function* () {
        try {
          const _request = yield* useChannelRequest<string>(channel.port2);
          throw new Error("responder crashed");
        } catch {
          // expected
        }
        // finally block in useChannelRequest will close port2
      });

      yield* task;

      // Wait for close event with a timeout
      const result = yield* race([
        closeReceived.operation,
        sleepThenTimeout(100),
      ]);

      expect(result).not.toBe("timeout");
    });

    it("requester sees close if cancelled while waiting", function* () {
      const closeReceived = withResolvers<void>();
      const responderReady = withResolvers<void>();

      let transferredPort: MessagePort;

      // Start requester in a task we can halt
      const requesterTask = yield* spawn(function* () {
        const { port, operation } = yield* useChannelResponse<string>();
        transferredPort = port;

        // Signal that port is available
        responderReady.resolve();

        // Wait for response (will be cancelled)
        return yield* operation;
      });

      // Wait for port to be available
      yield* responderReady.operation;

      // Set up responder with the transferred port
      yield* spawn(function* () {
        transferredPort.start();
        transferredPort.addEventListener("close", () => {
          closeReceived.resolve();
        });

        // Don't send response - just wait for close
        yield* suspend();
      });

      // Cancel the requester
      yield* requesterTask.halt();

      // Verify responder saw close with timeout
      const result = yield* race([
        closeReceived.operation,
        sleepThenTimeout(100),
      ]);

      expect(result).not.toBe("timeout");
    });

    it("port closes if requester scope exits without awaiting operation", function* () {
      const closeReceived = withResolvers<void>();
      const responderReady = withResolvers<void>();

      let transferredPort!: MessagePort;

      // Start requester in a task that exits without calling operation
      const requesterTask = yield* spawn(function* () {
        const { port } = yield* useChannelResponse<string>();
        transferredPort = port;

        responderReady.resolve();

        // Exit WITHOUT calling yield* operation
        // Resource cleanup should still close port1
      });

      // Wait for port to be available
      yield* responderReady.operation;

      // Set up close listener on transferred port
      transferredPort.start();
      transferredPort.addEventListener("close", () => {
        closeReceived.resolve();
      });

      // Wait for requester task to complete (it exits immediately)
      yield* requesterTask;

      // Verify close was received with timeout
      const result = yield* race([
        closeReceived.operation,
        sleepThenTimeout(100),
      ]);

      expect(result).not.toBe("timeout");
    });
  });
});
