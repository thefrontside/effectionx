import type { StandardSchemaV1 } from "@standard-schema/spec";
import { Err, Ok, type Result } from "effection";
import { unbox } from "./box.ts";

export function validateUnsafe<T>(
  schema: StandardSchemaV1<T>,
  value: unknown,
  description?: string,
): StandardSchemaV1.InferInput<StandardSchemaV1<T>> {
  return unbox(validate(schema, value, description));
}

export function validate<T>(
  schema: StandardSchemaV1<T>,
  value: unknown,
  description?: string,
): Result<StandardSchemaV1.InferInput<StandardSchemaV1<T>>> {
  let validation = schema["~standard"].validate(value);
  if (validation instanceof Promise) {
    return Err(
      new TypeError("invalid protocol: async validations are not allowed"),
    );
  }
  if (validation.issues) {
    let issues = validation.issues.join("\n");
    let message = description ? `${description} ${issues}` : issues;
    return Err(new TypeError(message, { cause: value }));
  }
  return Ok(validation.value);
}
