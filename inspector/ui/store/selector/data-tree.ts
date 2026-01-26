import { createSelector } from "starfx";
import * as d3 from "d3";
import { schema } from "../schema.ts";
import type { AppState, ScopeEvent } from "../schema.ts";

function viewState(tick: number, state: Record<string, { tick: number }>) {
  const stateTypes = ["no init"].concat(Object.keys(state));
  const stateTicks = (
    Object.values(state)
      .map((s) => Number(s.tick))
      .sort(d3.ascending),
  );
  const scale = d3.scaleThreshold().domain(stateTicks).range(stateTypes);
  return scale(tick);
}

const createAppSelector = createSelector.withTypes<AppState>();

export interface EffectionStateNode {
  id: string;
  parentId: string | null;
  state: Record<string, { tick: number; result?: ScopeEvent["result"] }>;
  current?: unknown;
}

export const nodeAtTick: (s: AppState, tick?: number) => EffectionStateNode[] =
  createAppSelector(
    [
      schema.snapshot.selectTableAsList,
      (state: AppState, inputTick?: number) => inputTick,
    ],
    (nodes: EffectionStateNode[], currentTick: number) => {
      return nodes.map((d: EffectionStateNode) => {
        const next = { ...d };
        next.current = viewState(currentTick, d.state);
        return next;
      });
    },
  );

export const treeAtTick: (
  s: AppState,
  tick?: number,
) => d3.HierarchyNode<EffectionStateNode> | null = createAppSelector(
  [(state: AppState, inputTick?: number) => nodeAtTick(state, inputTick)],
  (nodes: EffectionStateNode[]) => {
    console.log({ nodes });
    if (nodes.length === 0) {
      return [];
    }
    try {
      const roots = d3
        .stratify<EffectionStateNode>()
        .id((d) => d.id)
        .parentId((d) => d.parentId)(nodes.filter((n) => n.current !== "no init"));
      return roots;
    } catch (error) {
      console.error("Error creating stratified data:", error);
      // console.dir({ nodes });
      return [];
    }
  },
);

export const maxTick: (s: AppState) => number = createAppSelector(
  [schema.snapshot.selectTableAsList],
  (snapshots: EffectionStateNode[]) => {
    return Math.max(
      ...snapshots
        .map((event) => Object.values(event.state).map((s) => s.tick))
        .flat(),
    );
  },
);
