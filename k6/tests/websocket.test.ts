/**
 * WebSocket Tests
 *
 * Tests that verify WebSocket handling with structured concurrency,
 * solving K6's fire-and-forget WebSocket handler problem (issue #5524).
 *
 * Note: echo.websocket.org sends a "Request served by..." message upon connection,
 * so tests account for this by skipping or handling the first message.
 */

import { testMain, describe, it, expect } from "../testing/mod.ts";
import { useWebSocket, each, first } from "../lib/mod.ts";

// K6 options
export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ["rate==1"], // All checks must pass
  },
};

export default testMain(function* () {
  describe("WebSocket Handling", () => {
    describe("Connection", () => {
      it("connects to WebSocket server", function* () {
        const ws = yield* useWebSocket("wss://echo.websocket.org");
        expect(ws).toBeTruthy();
      });

      it("receives server greeting on connect", function* () {
        const ws = yield* useWebSocket("wss://echo.websocket.org");

        // The echo server sends a greeting message
        const greeting = yield* first.expect(ws);
        expect(typeof greeting).toBe("string");
        // Greeting starts with "Request served by"
        expect((greeting as string).startsWith("Request served by")).toBe(true);
      });
    });

    describe("Send and Receive", () => {
      it("receives echo of sent message", function* () {
        const ws = yield* useWebSocket("wss://echo.websocket.org");

        // Skip the server greeting
        yield* first.expect(ws);

        // Now send and receive echo
        ws.send("Hello, WebSocket!");
        const echo = yield* first.expect(ws);
        expect(echo).toBe("Hello, WebSocket!");
      });

      it("handles multiple message exchanges", function* () {
        const ws = yield* useWebSocket("wss://echo.websocket.org");

        // Skip greeting
        yield* first.expect(ws);

        // Send first message
        ws.send("Message 1");
        const echo1 = yield* first.expect(ws);
        expect(echo1).toBe("Message 1");

        // Send second message
        ws.send("Message 2");
        const echo2 = yield* first.expect(ws);
        expect(echo2).toBe("Message 2");
      });
    });

    describe("JSON Messages", () => {
      it("handles JSON message round-trip", function* () {
        const ws = yield* useWebSocket("wss://echo.websocket.org");

        // Skip greeting
        yield* first.expect(ws);

        const payload = { type: "ping", id: 123, data: { nested: true } };
        ws.send(JSON.stringify(payload));

        const response = yield* first.expect(ws);
        const parsed = JSON.parse(response as string);

        expect(parsed.type).toBe("ping");
        expect(parsed.id).toBe(123);
        expect(parsed.data.nested).toBe(true);
      });
    });

    describe("Stream Interface", () => {
      it("works with each() iterator", function* () {
        const ws = yield* useWebSocket("wss://echo.websocket.org");

        // Skip greeting via each
        let messageCount = 0;
        for (const _msg of yield* each(ws)) {
          messageCount++;
          break; // Just get the greeting
        }

        expect(messageCount).toBe(1);
      });

      it("can iterate multiple messages with each()", function* () {
        const ws = yield* useWebSocket("wss://echo.websocket.org");

        // Send messages (they'll be echoed)
        ws.send("A");
        ws.send("B");

        const messages: string[] = [];
        let count = 0;

        for (const msg of yield* each(ws)) {
          messages.push(msg as string);
          count++;
          // Get greeting + 2 echoes = 3 messages
          if (count >= 3) break;
          yield* each.next();
        }

        expect(messages).toHaveLength(3);
        // First is greeting, then our messages
        expect(messages[1]).toBe("A");
        expect(messages[2]).toBe("B");
      });
    });

    describe("Cleanup", () => {
      it("WebSocket is usable until scope ends", function* () {
        let sentMessage = false;
        let receivedEcho = false;

        const ws = yield* useWebSocket("wss://echo.websocket.org");

        // Skip greeting
        yield* first.expect(ws);

        ws.send("test");
        sentMessage = true;

        const echo = yield* first.expect(ws);
        receivedEcho = echo === "test";

        expect(sentMessage).toBe(true);
        expect(receivedEcho).toBe(true);
      });
    });
  });
});
