import { type Api, createApi } from "@effectionx/context-api";
import { Err, Ok, type Operation, type Result } from "effection";

import type { ProcessShutdownApi } from "./types.ts";

let shutdownApiSequence = 0;

export function createProcessShutdownApi(
  terminate: () => Operation<void>,
): Api<ProcessShutdownApi> {
  return createApi<ProcessShutdownApi>(
    `@effectionx/process:shutdown:${shutdownApiSequence++}`,
    {
      *shutdown(): Operation<void> {
        yield* terminate();
      },
    },
  );
}

export function settled<T>(operation: Operation<T>): Operation<Result<void>> {
  return {
    *[Symbol.iterator]() {
      try {
        yield* operation;
        return Ok(void 0);
      } catch (error) {
        return Err(error as Error);
      }
    },
  };
}
