import { type Scope, type Stream, useScope } from "effection";
import { createImplementation } from "../lib/implementation.ts";
import { type ContextData, type ContextNode, protocol } from "./protocol.ts";

export const context = createImplementation(protocol, function* () {
  let scope = yield* useScope();
  return {
    *readContextTree(): Stream<never, ContextNode> {
      return {
        *next() {
          return {
            done: true,
            value: readTree(scope),
          };
        },
      };
    },
  };
});

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

function readTree(scope: Scope): ContextNode {
  if (isV3Scope(scope)) {
    return readV3Tree(scope);
  } else if (isV4Scope(scope)) {
    return readV4Tree(scope);
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

function readV3Tree(scope: V3Scope): ContextNode {
  let children = [...scope.frame.children].map((frame) => ({ frame }));
  return {
    data: readContextData(scope.frame.context),
    children: children.map(readV3Tree),
  };
}

function readV4Tree(scope: V4Scope): ContextNode {
  let children = scope.contexts["@effection/scope.children"] as Set<V4Scope>;
  return {
    data: readContextData(scope.contexts),
    children: [...children].map(readV4Tree),
  };
}

// make anything serializable.
function readContextData(contexts: Record<string, unknown>): ContextData {
  let entries = Object.entries(contexts).map(([key, value]) => {
    try {
      return [key, JSON.parse(JSON.stringify(value))];
    } catch (_error) {
      return [key, "unserializable"];
    }
  });
  return Object.fromEntries(entries);
}
