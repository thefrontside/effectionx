/**
 * @effectionx/k6 - Structured Concurrency for K6 Load Testing
 *
 * This package provides Effection integration for K6, solving common
 * async/concurrency pain points in K6 scripts:
 *
 * - **Group context preservation** - Groups work correctly across async operations
 * - **Structured WebSocket handling** - No more fire-and-forget handlers
 * - **Proper error propagation** - Unhandled errors fail tests as expected
 * - **Automatic cleanup** - Resources are cleaned up when scopes end
 *
 * @example Basic usage
 * ```typescript
 * import { main, group, withGroup, http } from '@effectionx/k6';
 *
 * export default main(function*() {
 *   yield* group('api-tests');
 *   yield* withGroup('users', function*() {
 *     const response = yield* http.get('https://api.example.com/users');
 *     console.log(`Status: ${response.status}`);
 *   });
 * });
 * ```
 *
 * @example WebSocket with structured concurrency
 * ```typescript
 * import { main, useWebSocket, first } from '@effectionx/k6';
 *
 * export default main(function*() {
 *   const ws = yield* useWebSocket('wss://echo.websocket.org');
 *   ws.send('Hello!');
 *   const echo = yield* first.expect(ws);
 *   console.log(`Received: ${echo}`);
 * });
 * // WebSocket automatically closed
 * ```
 *
 * @packageDocumentation
 */

// VU iteration wrapper
export { main } from "./main.ts";

// Tags and group context management
export {
  TagsContext,
  useTags,
  withTags,
  useGroups,
  group,
  withGroup,
  type Tags,
} from "./tags.ts";

// HTTP wrappers (re-export from separate module)
export {
  http,
  get,
  post,
  put,
  patch,
  del,
  head,
  options,
  request,
  type HttpParams,
} from "../http/mod.ts";

// WebSocket (re-export from separate module)
export { useWebSocket, type WebSocket, type WebSocketMessage } from "../websockets/mod.ts";

// Re-export stream helpers for convenience
export { each, interval } from "effection";
export {
  forEach,
  take,
  takeWhile,
  takeUntil,
  drain,
  first,
} from "@effectionx/stream-helpers";
export { on, once } from "@effectionx/node";
