import { getNodeLabel } from "../data/labels.ts";
import type { Hierarchy } from "../data/types.ts";

import detailsStyles from "./hierarchy-details.module.css";

function valueToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch (_err) {
      return String(v);
    }
  }
  return String(v);
}

function flattenNodeData(
  data: Record<string, unknown> | undefined,
): Array<{ k: string; v: string }> {
  const top = data ?? {};
  const topLevelKeys = Object.keys(top);

  return Object.entries(top).flatMap(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const entries = Object.entries(v as Record<string, unknown>);
      if (topLevelKeys.length === 1) {
        return entries.map(([subk, subv]) => ({
          k: subk,
          v: valueToString(subv),
        }));
      }
      return entries.map(([subk, subv]) => ({
        k: `${k}.${subk}`,
        v: valueToString(subv),
      }));
    }
    return [{ k, v: valueToString(v) }];
  });
}

export function Details({ slot, node }: { slot?: string; node: Hierarchy }) {
  function copyAllProperties() {
    if (!node) return;
    const txt = JSON.stringify(node.data ?? {}, null, 2);
    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      navigator.clipboard.writeText(txt).catch(() => {});
    }
  }

  const properties = flattenNodeData(node.data);

  return (
    <div class={detailsStyles.detailsContainer} slot={slot}>
      <sl-tab-group value="graph">
        <sl-tab slot="nav" panel="attributes">
          Attributes
        </sl-tab>
        <sl-tab slot="nav" panel="json">
          JSON{" "}
        </sl-tab>

        <sl-tab-panel name="json">
          <pre>{JSON.stringify(node, null, 2)}</pre>
        </sl-tab-panel>

        <sl-tab-panel name="attributes">
          <div class={detailsStyles.tabPanel}>
            <div class={detailsStyles.headerRow}>
              <div>
                <div class={detailsStyles.detailsHeading}>
                  {node ? getNodeLabel(node) : "Attributes"}
                </div>
                <div class={detailsStyles.mutedText}>
                  {node ? String(node.data.type ?? "") : ""}
                </div>
              </div>
              <div class={detailsStyles.statusText}>
                ● {String(node.data.status ?? "")}
              </div>
            </div>

            <div class={detailsStyles.propertiesSection}>
              <div class={detailsStyles.propertiesHeader}>
                <div class={detailsStyles.detailsHeading}>Properties</div>
                <div>
                  <button
                    type="button"
                    class={detailsStyles.copyAll}
                    onclick={() => copyAllProperties()}
                  >
                    Copy all
                  </button>
                </div>
              </div>

              <div class={detailsStyles.kvList}>
                {properties.length === 0 ? (
                  <div class={detailsStyles.mutedText}>No properties</div>
                ) : (
                  properties.map((p) => (
                    <div key={p.k} class={detailsStyles.kvRow}>
                      <div class={detailsStyles.propertyKey}>{p.k}</div>
                      <div class={detailsStyles.propertyValue}>
                        {String(p.v)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </sl-tab-panel>
      </sl-tab-group>
    </div>
  );
}
