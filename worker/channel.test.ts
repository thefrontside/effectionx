import { describe, it } from "@effectionx/bdd";
import { timebox } from "@effectionx/timebox";
import { once, race, sleep, spawn, suspend, withResolvers } from "effection";
import { expect } from "expect";

import { useChannelRequest, useChannelResponse } from "./channel.ts";
import type { SerializedResult } from "./types.ts";

describe("channel", () => {
  describe("useChannelResponse", () => {
    it("creates a channel with a transferable port", function* () {
      const response = yield* useChannelResponse<string>();

      expect(response.port).toBeInstanceOf(MessagePort);
    });

    it("receives response data via operation", function* () {
      const response = yield* useChannelResponse<string>();

      // Simulate responder sending a ChannelMessage response
      yield* spawn(function* () {
        response.port.start();
        // New message format: { type: "response", result: SerializedResult }
        response.port.postMessage({
          type: "response",
          result: { ok: true, value: "hello from responder" },
        });
        // Responder would wait for ACK here in real usage
      });

      const result = yield* response;
      expect(result).toEqual({ ok: true, value: "hello from responder" });
    });

    it("sends ACK after receiving response", function* () {
      // Use full round-trip to verify ACK is received
      const response = yield* useChannelResponse<string>();

      // Spawn responder - it uses useChannelRequest which waits for ACK
      yield* spawn(function* () {
        const { resolve } = yield* useChannelRequest<string>(response.port);
        // This will block until ACK is received
        yield* resolve("response data");
      });

      const result = yield* response;
      // If we got here, the ACK was sent and received
      expect(result).toEqual({ ok: true, value: "response data" });
    });
  });

  describe("useChannelRequest", () => {
    // These tests use raw MessageChannel to isolate useChannelRequest behavior.
    // This provides unit test coverage independent of useChannelResponse.

    it("resolve sends value and waits for ACK", function* () {
      const channel = new MessageChannel();
      channel.port1.start();

      let messageReceived: unknown = null;

      // Simulate requester on port1 using effection
      yield* spawn(function* () {
        const event = yield* once(channel.port1, "message");
        messageReceived = (event as MessageEvent).data;
        // Send ACK
        channel.port1.postMessage({ type: "ack" });
      });

      // Responder on port2
      const { resolve } = yield* useChannelRequest<string>(channel.port2);
      yield* resolve("success value");

      // Value is wrapped in ChannelMessage with SerializedResult
      expect(messageReceived).toEqual({
        type: "response",
        result: { ok: true, value: "success value" },
      });
    });

    it("reject sends error and waits for ACK", function* () {
      const channel = new MessageChannel();
      channel.port1.start();

      let messageReceived: unknown = null;

      // Simulate requester on port1 using effection
      yield* spawn(function* () {
        const event = yield* once(channel.port1, "message");
        messageReceived = (event as MessageEvent).data;
        // Send ACK
        channel.port1.postMessage({ type: "ack" });
      });

      // Responder on port2
      const { reject } = yield* useChannelRequest<string>(channel.port2);
      const error = new Error("test error");
      yield* reject(error);

      // Error is serialized and wrapped in ChannelMessage
      const msg = messageReceived as {
        type: string;
        result: SerializedResult<string>;
      };
      expect(msg.type).toBe("response");
      expect(msg.result.ok).toBe(false);
      if (!msg.result.ok) {
        expect(msg.result.error.name).toBe("Error");
        expect(msg.result.error.message).toBe("test error");
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
        expect((e as Error).message).toContain("Expected ack");
      }
    });
  });

  describe("full round-trip", () => {
    it("requester sends, responder resolves, requester receives", function* () {
      const response = yield* useChannelResponse<string>();

      // Spawn responder
      yield* spawn(function* () {
        const { resolve } = yield* useChannelRequest<string>(response.port);
        yield* resolve("response from responder");
      });

      const result = yield* response;
      expect(result).toEqual({ ok: true, value: "response from responder" });
    });

    it("requester sends, responder rejects, requester receives error", function* () {
      const response = yield* useChannelResponse<string>();

      const testError = new Error("responder error");

      // Spawn responder
      yield* spawn(function* () {
        const { reject } = yield* useChannelRequest<string>(response.port);
        yield* reject(testError);
      });

      const result = yield* response;
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

      const response = yield* useChannelResponse<ComplexData>();

      const testData: ComplexData = {
        name: "test",
        count: 42,
        nested: { items: ["a", "b", "c"] },
      };

      // Spawn responder
      yield* spawn(function* () {
        const { resolve } = yield* useChannelRequest<ComplexData>(
          response.port,
        );
        yield* resolve(testData);
      });

      const result = yield* response;
      expect(result).toEqual({ ok: true, value: testData });
    });
  });

  describe("close detection (useChannelResponse)", () => {
    it("errors if responder closes port without responding", function* () {
      const response = yield* useChannelResponse<string>();

      // Spawn responder that closes without responding
      yield* spawn(function* () {
        response.port.start();
        response.port.close(); // Close without calling resolve/reject
      });

      // Requester should get an error
      let error: Error | undefined;
      try {
        yield* response;
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toContain("closed");
    });

    it("errors if responder scope exits without responding", function* () {
      const response = yield* useChannelResponse<string>();

      // Spawn responder that exits without responding
      yield* spawn(function* () {
        const _request = yield* useChannelRequest<string>(response.port);
        // Exit without calling resolve or reject
        // finally block in useChannelRequest closes port
      });

      // Requester should get an error
      let error: Error | undefined;
      try {
        yield* response;
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toContain("closed");
    });
  });

  describe("timeout (useChannelResponse)", () => {
    it("times out if responder is slow", function* () {
      const response = yield* useChannelResponse<string>({
        timeout: 50,
      });

      // Spawn responder that never responds
      yield* spawn(function* () {
        response.port.start();
        yield* suspend(); // Never respond
      });

      // Requester should timeout
      let error: Error | undefined;
      try {
        yield* response;
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toContain("timed out");
    });

    it("succeeds if response arrives before timeout", function* () {
      const response = yield* useChannelResponse<string>({
        timeout: 1000,
      });

      // Spawn responder that responds quickly
      yield* spawn(function* () {
        const { resolve } = yield* useChannelRequest<string>(response.port);
        yield* resolve("fast response");
      });

      const result = yield* response;
      expect(result).toEqual({ ok: true, value: "fast response" });
    });

    it("no timeout waits indefinitely but detects close", function* () {
      const response = yield* useChannelResponse<string>(); // No timeout

      // Close port after a delay
      yield* spawn(function* () {
        response.port.start();
        yield* sleep(10);
        response.port.close();
      });

      // Should error on close, not hang
      let error: Error | undefined;
      try {
        yield* response;
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

      const responderSentMessage = withResolvers<void>();
      const responderCompleted = withResolvers<void>();

      // Spawn responder using raw postMessage so we can signal at the right moment
      yield* spawn(function* () {
        // Send response
        channel.port2.postMessage({ ok: true, value: "response" });

        // Signal AFTER postMessage - now responder will wait for ACK
        responderSentMessage.resolve();

        // Race between ACK and close (same logic as useChannelRequest)
        const event = yield* race([
          once(channel.port2, "message"),
          once(channel.port2, "close"),
        ]);

        // Should detect close, not hang waiting for ACK
        if ((event as Event).type === "close") {
          responderCompleted.resolve();
          return;
        }

        // If we got here, ACK was received (unexpected in this test)
        responderCompleted.resolve();
      });

      // Wait for responder to send message and start waiting for ACK
      yield* responderSentMessage.operation;

      // Close port1 (simulates requester cancellation) - no sleep needed!
      channel.port1.close();

      // Responder should complete (not hang) - race detects close
      yield* responderCompleted.operation;
    });

    it("ACK is sent for error responses", function* () {
      const response = yield* useChannelResponse<string>();

      const ackReceived = withResolvers<void>();

      // Spawn responder that tracks ACK receipt
      yield* spawn(function* () {
        const { reject } = yield* useChannelRequest<string>(response.port);
        yield* reject(new Error("test error"));
        // If we get here, ACK was received (reject waits for ACK)
        ackReceived.resolve();
      });

      // Requester receives response (and sends ACK)
      const result = yield* response;
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

      // Wait for close event with a timeout
      const result = yield* timebox(100, () => closeReceived.operation);

      expect(result.timeout).toBe(false);
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
      const result = yield* timebox(100, () => closeReceived.operation);

      expect(result.timeout).toBe(false);
    });

    it("requester sees close if cancelled while waiting", function* () {
      const closeReceived = withResolvers<void>();
      const responderReady = withResolvers<void>();

      let transferredPort: MessagePort;

      // Start requester in a task we can halt
      const requesterTask = yield* spawn(function* () {
        const response = yield* useChannelResponse<string>();
        transferredPort = response.port;

        // Signal that port is available
        responderReady.resolve();

        // Wait for response (will be cancelled)
        return yield* response;
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
      const result = yield* timebox(100, () => closeReceived.operation);

      expect(result.timeout).toBe(false);
    });

    it("port closes if requester scope exits without yielding response", function* () {
      const closeReceived = withResolvers<void>();
      const responderReady = withResolvers<void>();

      let transferredPort!: MessagePort;

      // Start requester in a task that exits without yielding response
      const requesterTask = yield* spawn(function* () {
        const response = yield* useChannelResponse<string>();
        transferredPort = response.port;

        responderReady.resolve();

        // Exit WITHOUT calling yield* response
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
      const result = yield* timebox(100, () => closeReceived.operation);

      expect(result.timeout).toBe(false);
    });
  });

  describe("progress streaming", () => {
    describe("useChannelResponse.progress", () => {
      it("receives multiple progress updates then final response", function* () {
        const response = yield* useChannelResponse<string, number>();

        // Spawn responder that sends progress updates
        yield* spawn(function* () {
          const request = yield* useChannelRequest<string, number>(
            response.port,
          );

          // Send progress updates
          yield* request.progress(1);
          yield* request.progress(2);
          yield* request.progress(3);

          // Send final response
          yield* request.resolve("done");
        });

        // Use progress subscription
        const subscription = yield* response.progress;

        const progressValues: number[] = [];
        let next = yield* subscription.next();
        while (!next.done) {
          progressValues.push(next.value);
          next = yield* subscription.next();
        }

        expect(progressValues).toEqual([1, 2, 3]);
        expect(next.value).toEqual({ ok: true, value: "done" });
      });

      it("yield* response ignores progress and returns final response", function* () {
        const response = yield* useChannelResponse<string, number>();

        // Spawn responder that sends progress then response
        yield* spawn(function* () {
          const request = yield* useChannelRequest<string, number>(
            response.port,
          );
          yield* request.progress(1);
          yield* request.progress(2);
          yield* request.resolve("final");
        });

        // Directly yield response (ignores progress)
        const result = yield* response;
        expect(result).toEqual({ ok: true, value: "final" });
      });

      it("handles error response after progress", function* () {
        const response = yield* useChannelResponse<string, number>();

        yield* spawn(function* () {
          const request = yield* useChannelRequest<string, number>(
            response.port,
          );
          yield* request.progress(1);
          yield* request.reject(new Error("failed after progress"));
        });

        const subscription = yield* response.progress;

        const progressValues: number[] = [];
        let next = yield* subscription.next();
        while (!next.done) {
          progressValues.push(next.value);
          next = yield* subscription.next();
        }

        expect(progressValues).toEqual([1]);
        expect(next.value.ok).toBe(false);
        if (!next.value.ok) {
          expect(next.value.error.message).toBe("failed after progress");
        }
      });

      it("errors if port closes during progress", function* () {
        const response = yield* useChannelResponse<string, number>();

        // Spawn responder that sends one progress then closes
        yield* spawn(function* () {
          response.port.start();
          response.port.postMessage({ type: "progress", data: 1 });
          // Wait for progress_ack
          yield* once(response.port, "message");
          // Close without sending response
          response.port.close();
        });

        const subscription = yield* response.progress;

        // First progress should work
        const first = yield* subscription.next();
        expect(first.done).toBe(false);
        expect(first.value).toBe(1);

        // Next should error because port closed
        let error: Error | undefined;
        try {
          yield* subscription.next();
        } catch (e) {
          error = e as Error;
        }

        expect(error).toBeDefined();
        expect(error?.message).toContain("closed");
      });
    });

    describe("useChannelRequest.progress", () => {
      it("sends progress with backpressure (waits for ACK)", function* () {
        const channel = new MessageChannel();
        channel.port1.start();

        const progressReceived: number[] = [];
        const acksSent = { count: 0 };

        // Simulate requester on port1
        yield* spawn(function* () {
          while (true) {
            const event = yield* once(channel.port1, "message");
            const msg = (event as MessageEvent).data;

            if (msg.type === "progress") {
              progressReceived.push(msg.data);
              // Delay ACK slightly to test backpressure
              yield* sleep(10);
              acksSent.count++;
              channel.port1.postMessage({ type: "progress_ack" });
            } else if (msg.type === "response") {
              channel.port1.postMessage({ type: "ack" });
              break;
            }
          }
        });

        // Responder on port2
        const request = yield* useChannelRequest<string, number>(channel.port2);

        // These should block until ACK received
        yield* request.progress(10);
        yield* request.progress(20);
        yield* request.resolve("done");

        expect(progressReceived).toEqual([10, 20]);
        expect(acksSent.count).toBe(2);
      });

      it("detects port close during progress", function* () {
        const channel = new MessageChannel();
        channel.port1.start();

        // Simulate requester that closes after receiving progress
        yield* spawn(function* () {
          const event = yield* once(channel.port1, "message");
          const msg = (event as MessageEvent).data;
          expect(msg.type).toBe("progress");
          // Close without sending ACK
          channel.port1.close();
        });

        const request = yield* useChannelRequest<string, number>(channel.port2);

        // progress() should detect close and exit gracefully
        yield* request.progress(1);
        // Should not throw, just return (requester cancelled)
      });

      it("progress blocks until worker is ready for next value", function* () {
        // This test documents the backpressure semantics:
        // - progress() blocks until the worker calls subscription.next()
        // - This provides TRUE backpressure - host can't outpace worker
        // - The ACK is sent inside next(), so it waits for worker readiness

        const response = yield* useChannelResponse<string, number>();
        const progressDurations: number[] = [];
        const processingTime = 50;

        // Responder sends progress and measures how long each takes
        yield* spawn(function* () {
          const request = yield* useChannelRequest<string, number>(
            response.port,
          );

          // First progress - should be fast (worker is waiting)
          const start1 = Date.now();
          yield* request.progress(1);
          progressDurations.push(Date.now() - start1);

          // Second progress - should wait ~50ms for worker processing
          const start2 = Date.now();
          yield* request.progress(2);
          progressDurations.push(Date.now() - start2);

          yield* request.resolve("done");
        });

        // Requester receives progress and processes slowly
        const subscription = yield* response.progress;

        // Get first progress (responder is waiting)
        let next = yield* subscription.next();
        expect(next.done).toBe(false);
        expect(next.value).toBe(1);

        // Simulate slow processing before requesting next
        yield* sleep(processingTime);

        // Get second progress
        next = yield* subscription.next();
        expect(next.done).toBe(false);
        expect(next.value).toBe(2);

        // Get final response
        next = yield* subscription.next();
        expect(next.done).toBe(true);
        expect(next.value).toEqual({ ok: true, value: "done" });

        // First progress was fast (worker was already waiting)
        expect(progressDurations[0]).toBeLessThan(20);

        // Second progress waited for worker to finish processing
        // (host blocked until worker called next() again)
        expect(progressDurations[1]).toBeGreaterThanOrEqual(
          processingTime - 10,
        );
      });
    });

    describe("progress round-trip", () => {
      it("preserves order of multiple progress updates", function* () {
        const response = yield* useChannelResponse<string, string>();

        const expectedProgress = ["a", "b", "c", "d", "e"];

        yield* spawn(function* () {
          const request = yield* useChannelRequest<string, string>(
            response.port,
          );
          for (const p of expectedProgress) {
            yield* request.progress(p);
          }
          yield* request.resolve("complete");
        });

        const subscription = yield* response.progress;
        const received: string[] = [];

        let next = yield* subscription.next();
        while (!next.done) {
          received.push(next.value);
          next = yield* subscription.next();
        }

        expect(received).toEqual(expectedProgress);
        expect(next.value).toEqual({ ok: true, value: "complete" });
      });

      it("handles complex progress data", function* () {
        interface ProgressData {
          step: number;
          message: string;
          details?: { items: string[] };
        }

        const response = yield* useChannelResponse<
          { result: string },
          ProgressData
        >();

        const progress1: ProgressData = { step: 1, message: "Starting" };
        const progress2: ProgressData = {
          step: 2,
          message: "Processing",
          details: { items: ["x", "y"] },
        };

        yield* spawn(function* () {
          const request = yield* useChannelRequest<
            { result: string },
            ProgressData
          >(response.port);
          yield* request.progress(progress1);
          yield* request.progress(progress2);
          yield* request.resolve({ result: "success" });
        });

        const subscription = yield* response.progress;
        const received: ProgressData[] = [];

        let next = yield* subscription.next();
        while (!next.done) {
          received.push(next.value);
          next = yield* subscription.next();
        }

        expect(received).toEqual([progress1, progress2]);
        expect(next.value).toEqual({ ok: true, value: { result: "success" } });
      });

      it("handles zero progress updates", function* () {
        const response = yield* useChannelResponse<string, number>();

        yield* spawn(function* () {
          const request = yield* useChannelRequest<string, number>(
            response.port,
          );
          // No progress, just resolve
          yield* request.resolve("immediate");
        });

        const subscription = yield* response.progress;
        const next = yield* subscription.next();

        // Should immediately return done with the response
        expect(next.done).toBe(true);
        expect(next.value).toEqual({ ok: true, value: "immediate" });
      });

      it("requester cancellation during progress stops responder", function* () {
        const responderExited = withResolvers<void>();
        const firstProgressReceived = withResolvers<void>();
        const portReady = withResolvers<MessagePort>();

        // Requester task we can cancel
        const requesterTask = yield* spawn(function* () {
          const response = yield* useChannelResponse<string, number>();
          portReady.resolve(response.port);

          const subscription = yield* response.progress;
          // Get first progress
          const first = yield* subscription.next();
          expect(first.done).toBe(false);
          firstProgressReceived.resolve();
          // Then hang waiting for more
          yield* subscription.next();
        });

        // Wait for port to be ready
        const transferredPort = yield* portReady.operation;

        // Responder
        yield* spawn(function* () {
          const request = yield* useChannelRequest<string, number>(
            transferredPort,
          );
          yield* request.progress(1);
          // This should detect close when requester is cancelled
          yield* request.progress(2);
          responderExited.resolve();
        });

        // Wait for first progress to be received
        yield* firstProgressReceived.operation;

        // Cancel requester
        yield* requesterTask.halt();

        // Responder should exit gracefully
        const result = yield* timebox(100, () => responderExited.operation);

        expect(result.timeout).toBe(false);
      });
    });

    describe("progress with timeout", () => {
      it("timeout applies to entire progress+response exchange", function* () {
        const response = yield* useChannelResponse<string, number>({
          timeout: 50,
        });

        // Responder that sends progress but never responds
        yield* spawn(function* () {
          response.port.start();
          response.port.postMessage({ type: "progress", data: 1 });
          // Never send response
          yield* suspend();
        });

        let error: Error | undefined;
        try {
          const subscription = yield* response.progress;
          // First progress works
          yield* subscription.next();
          // But waiting for more times out
          yield* subscription.next();
        } catch (e) {
          error = e as Error;
        }

        expect(error).toBeDefined();
        expect(error?.message).toContain("timed out");
      });
    });
  });
});
