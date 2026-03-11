/**
 * Serialization utilities for the durable execution protocol.
 *
 * Converts between:
 * - Protocol Result ({ status: "ok" | "err" | "cancelled" })
 * - Effection Result ({ ok: true, value } | { ok: false, error })
 * - Error ↔ SerializedError
 */

import type {
  EffectionResult,
  Json,
  Result,
  SerializedError,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Error serialization
// ---------------------------------------------------------------------------

/** Serialize an Error to a JSON-safe SerializedError. */
export function serializeError(error: Error): SerializedError {
  return {
    message: error.message,
    name: error.name,
    stack: error.stack,
  };
}

/** Deserialize a SerializedError back to an Error. */
export function deserializeError(se: SerializedError): Error {
  const error = new Error(se.message);
  if (se.name) error.name = se.name;
  if (se.stack) error.stack = se.stack;
  return error;
}

// ---------------------------------------------------------------------------
// Result conversion: Protocol ↔ Effection
// ---------------------------------------------------------------------------

/**
 * Convert a protocol Result to an Effection Result.
 *
 * - ok → { ok: true, value }
 * - err → { ok: false, error } (deserialized)
 * - cancelled → { ok: false, error } with a CancelledError
 *
 * The value is returned as-is (Json). The caller is responsible for any
 * narrowing to a specific type T.
 */
export function protocolToEffection<T>(result: Result): EffectionResult<T> {
  switch (result.status) {
    case "ok":
      return { ok: true, value: result.value as T };
    case "err":
      return { ok: false, error: deserializeError(result.error) };
    case "cancelled":
      return { ok: false, error: new Error("cancelled") };
  }
}

/**
 * Convert an Effection Result to a protocol Result.
 *
 * The value must be JSON-serializable. This function does NOT validate
 * serializability — that is the caller's responsibility.
 */
export function effectionToProtocol<T>(result: EffectionResult<T>): Result {
  if (result.ok) {
    return { status: "ok", value: result.value as Json };
  } else {
    return { status: "err", error: serializeError(result.error) };
  }
}
