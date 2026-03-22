import type { Writable } from "node:stream";
import type { Operation, Result, WithResolvers } from "effection";
import { Err, action } from "effection";

type ProcessResultValue = [number?, string?];

export function suppressStdinEPIPE(
  stdin: Writable,
  processResult: WithResolvers<Result<ProcessResultValue>>,
): Operation<void> {
  return action((_resolve, _reject) => {
    const handler = (err: Error & { code?: string }) => {
      if (err.code === "EPIPE") return;
      processResult.resolve(Err(err));
    };
    stdin.on("error", handler);
    return () => stdin.off("error", handler);
  });
}
