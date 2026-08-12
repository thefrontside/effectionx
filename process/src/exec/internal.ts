import { type Operation, createContext } from "effection";

/**
 * Internal test seam, deliberately not exported from mod.ts. When set, the
 * adapters run this operation as soon as the child-process "close" event is
 * received, before waiting on the output pumps. This lets tests order their
 * assertions deterministically around the close event instead of relying on
 * scheduler timing.
 */
export const CloseEvent = createContext<() => Operation<void>>(
  "@effectionx/process:close-event",
);
