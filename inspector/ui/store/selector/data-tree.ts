import { createSelector } from "starfx";
import * as d3 from "d3";
import { schema } from "../schema.ts";
import type { AppState, ScopeEvent } from "../schema.ts";

function viewState(tick: number, state: Record<string, { tick: number }>) {
  const stateTypes = Object.keys(state);
  const stateTicks = Object.values(state).map((s) => s.tick);
  return d3.interpolateArray(stateTicks, stateTypes)(tick);
}

const createAppSelector = createSelector.withTypes<AppState>();

export interface EffectionStateNode {
  id: string;
  parentId: string | null;
  state: Record<string, { tick: number; result?: ScopeEvent["result"] }>;
  current?: unknown;
}

export const nodeMap: (s: AppState) => Map<string, EffectionStateNode> =
	     createAppSelector([schema.events.selectTableAsList], (data: ScopeEvent[]) => {
    return new Map(
      data.map((d: ScopeEvent) => [
        d.id,
        {
          id: d.id,
          parentId: d.parentId ?? (d.id === "0" ? null : "0"),
          state: {} as Record<
            string,
            { tick: number; result?: ScopeEvent["result"] }
          >,
        } as EffectionStateNode,
      ]),
    );
  });

type TickEntry = { id: string; type: string; result?: ScopeEvent["result"] };

export const nodesWithTicks: (
  s: AppState,
  t?: unknown,
) => Map<string, EffectionStateNode> = createAppSelector(
  [nodeMap, schema.events.selectTable],
  (
    nodes: Map<string, EffectionStateNode>,
    ticks: Record<string, TickEntry>,
  ) => {
    for (let [tick, d] of Object.entries(ticks)) {
      const node = nodes.get(d.id as string);
      if (node) {
        node.state[d.type] = { tick: Number(tick), result: d.result };
      }
    }
    return nodes;
  },
);

export const nodeAtTick: (s: AppState, tick?: number) => EffectionStateNode[] =
  createAppSelector(
    [nodesWithTicks, (state: AppState, inputTick?: number) => inputTick],
    (nodes: Map<string, EffectionStateNode>, currentTick: number) => {
      return [...nodes.values()].map((d: EffectionStateNode) => {
        d.current = viewState(currentTick, d.state);
        return d;
      });
    },
  );

export const maxTick: (s: AppState) => number = createAppSelector(
  [schema.events.selectTable],
  (ticks: Record<string, { id: string }>) => {
    const keys = Object.keys(ticks);
    if (keys.length === 0) return 0;
    return Math.max(...keys.map((k) => Number(k)));
  },
);
