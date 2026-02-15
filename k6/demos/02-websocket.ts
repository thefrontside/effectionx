/**
 * Demo 02: Structured WebSocket Handling
 *
 * This demo shows how @effectionx/k6 solves K6's fire-and-forget WebSocket
 * handler problem (issue #5524) where WebSocket event handlers lose async
 * context and can't properly report errors.
 *
 * THE PROBLEM:
 * In standard K6, WebSocket handlers are callback-based and fire-and-forget.
 * If an async operation fails inside a handler, the error is swallowed
 * and the test continues as if nothing happened.
 *
 * THE SOLUTION:
 * @effectionx/k6's useWebSocket() provides a structured concurrency resource:
 * - Messages are delivered through an Effection Stream
 * - Errors propagate properly and fail the test
 * - The WebSocket is automatically closed when the scope ends
 *
 * Run with: k6 run dist/demos/02-websocket.js
 */

import {
  main,
  useWebSocket,
  collectMessages,
  waitForMessage,
} from "../lib/mod.ts";
import { each } from "effection";

// K6 options
export const options = {
  vus: 1,
  iterations: 1,
};

/**
 * Standard K6 problem demonstration (commented out for reference):
 *
 * import ws from 'k6/ws';
 *
 * export default function() {
 *   ws.connect('wss://echo.websocket.org', {}, function(socket) {
 *     socket.on('open', () => {
 *       socket.send('hello');
 *     });
 *
 *     socket.on('message', (data) => {
 *       // If something fails here, the test doesn't know about it!
 *       someAsyncOperation(data).then(() => {
 *         // This might never run, or might run after the test ends
 *       });
 *     });
 *
 *     // How long should we wait? Who knows!
 *     socket.setTimeout(() => socket.close(), 5000);
 *   });
 * }
 */

// The @effectionx/k6 solution
export default main(function* () {
  console.log("=== Demo: Structured WebSocket Handling ===\n");

  // Connect to WebSocket - connection is a resource with structured cleanup
  console.log("Connecting to WebSocket...");
  const ws = yield* useWebSocket("wss://echo.websocket.org");
  console.log("Connected!");

  // Example 1: Send and receive a single message
  console.log("\n--- Example 1: Send and receive ---");
  ws.send("Hello from Effection!");

  // Use collectMessages helper to get exactly N messages
  const [echo] = yield* collectMessages(ws, 1);
  console.log(`Received echo: ${echo}`);

  // Example 2: Send multiple messages and process with a stream
  console.log("\n--- Example 2: Process message stream ---");
  ws.send("Message 1");
  ws.send("Message 2");
  ws.send("Message 3");

  let count = 0;
  for (const message of yield* each(ws.messages)) {
    count++;
    console.log(`Stream message ${count}: ${message}`);

    if (count >= 3) {
      break; // Exit after 3 messages
    }
    yield* each.next();
  }

  // Example 3: Wait for a specific message
  console.log("\n--- Example 3: Wait for specific message ---");
  ws.send(JSON.stringify({ type: "ping", id: 123 }));

  const pong = yield* waitForMessage(ws, (msg) => {
    try {
      const data = JSON.parse(msg as string);
      return data.type === "ping"; // Echo will have same content
    } catch {
      return false;
    }
  });
  console.log(`Got specific message: ${pong}`);

  console.log("\n=== Demo Complete ===");
  console.log("WebSocket will be automatically closed when scope ends.");

  // No need to manually close - Effection handles cleanup!
  // The WebSocket is closed with code 1000 and reason "Effection scope ended"
});
