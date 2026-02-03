import type { Stream } from "effection";

export interface Node {
  id: string;
  parentId?: string;
  data: Record<string, unknown>;
}

export type NodeMap = Record<string, Node>;

export interface Hierarchy {
  id: string;
  parentId?: string;
  data: Record<string, unknown>;
  children: Hierarchy[];
}

/**
 * A function that transforms one stream into another
 */
export type Transform<A, B> = <TClose>(
  input: Stream<A, TClose>,
) => Stream<B, TClose>;
