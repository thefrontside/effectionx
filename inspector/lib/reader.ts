import type { Scope } from "effection";

interface V4Scope {
  contexts: Record<string, unknown>;
  children: V4Scope[];
}

type Reader<D> = (contexts: Record<string, unknown>) => D;
type EffectionTree<D> = {
  data: D;
  children: EffectionTree<D>[];
};

export function readTree<D>(
  scope: Scope,
  readData: Reader<D> = readContextData,
): EffectionTree<D> {
  return readV4Tree(scope as unknown as V4Scope, readData);
}

function readV4Tree<D>(scope: V4Scope, readData: Reader<D>): EffectionTree<D> {
  let children = scope.contexts["@effection/scope.children"] as Set<V4Scope>;
  return {
    data: readData(scope.contexts),
    children: [...children].map((s) => readV4Tree(s, readData)),
  };
}

// make anything serializable.
export function readContextData<D>(contexts: Record<string, unknown>): D {
  let entries = Object.entries(contexts).map(([key, value]) => {
    try {
      return [key, JSON.parse(JSON.stringify(value))];
    } catch (_error) {
      return [key, "unserializable"];
    }
  });
  return Object.fromEntries(entries);
}
