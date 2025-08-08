import { type Context, createContext, type Operation } from "effection";
import { join } from "@std/path";
import type { Store } from "./types.ts";
import { JSONLStore } from "./jsonl.ts";

const DEFAULT_STORE: Store = JSONLStore.from({
  location: join(import.meta.dirname ?? Deno.cwd(), ".store"),
});

export const StoreContext: Context<Store> = createContext<Store>(
  "store",
  DEFAULT_STORE,
);

export function* useStore(): Operation<Store> {
  return yield* StoreContext.expect();
}
