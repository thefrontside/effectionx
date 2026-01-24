export interface Node {
  id: string;
  parentId: string | "global";
  data: Record<string, unknown>;
}

export interface Hierarchy {
  id: string;
  data: Record<string, unknown>;
  children: Hierarchy[];
}
