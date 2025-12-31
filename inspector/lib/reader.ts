import type { Scope } from "effection";

interface V3Frame {
  context: Record<string, unknown>;
  children: Set<V3Frame>;
}

interface V3Scope {
  frame: V3Frame;
}

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
  if (isV3Scope(scope)) {
    return readV3Tree(scope, readData);
  } else if (isV4Scope(scope)) {
    return readV4Tree(scope, readData);
  } else {
    throw new TypeError(`unrecognizable scope type`);
  }
}

function isV3Scope(value: Scope): value is Scope & V3Scope {
  let hypothetical = value as Scope & V3Scope;
  return hypothetical.frame && typeof hypothetical.frame.context === "object";
}

function isV4Scope(value: Scope): value is Scope & V4Scope {
  let hypothetical = value as Scope & V4Scope;
  return typeof hypothetical.contexts === "object";
}

function readV3Tree<D>(scope: V3Scope, readData: Reader<D>): EffectionTree<D> {
  let children = [...scope.frame.children].map((frame) => ({ frame }));
  return {
    data: readData(scope.frame.context),
    children: children.map((s) => readV3Tree(s, readData)),
  };
}

function readV4Tree<D>(scope: V4Scope, readData: Reader<D>): EffectionTree<D> {
  let children = scope.contexts["@effection/scope.children"] as Set<V4Scope>;
  return {
    data: readData(scope.contexts),
    children: [...children].map((s) => readV4Tree(s, readData)),
  };
}

// make anything serializable.
function readContextData<D>(contexts: Record<string, unknown>): D {
  let entries = Object.entries(contexts).map(([key, value]) => {
    try {
      return [key, JSON.parse(JSON.stringify(value))];
    } catch (_error) {
      return [key, "unserializable"];
    }
  });
  return Object.fromEntries(entries);
}
