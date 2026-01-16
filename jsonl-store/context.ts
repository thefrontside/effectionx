import { type Context, createContext, type Operation } from "effection";
import { join } from "node:path";
import process from "node:process";
import type { Store } from "./types.ts";
import { JSONLStore } from "./jsonl.ts";

const DEFAULT_STORE: Store = JSONLStore.from({
  location: join(import.meta.dirname ?? process.cwd(), ".store"),
});

export const StoreContext: Context<Store> = createContext<Store>(
  "store",
  DEFAULT_STORE,
);

export function* useStore(): Operation<Store> {
  return yield* StoreContext.expect();
}
