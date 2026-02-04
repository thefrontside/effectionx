import type { Hierarchy } from "../data/types.ts";
import type { Stratification } from "../data/stratify.ts";
import { findParent } from "../data/findParent.ts";
import { getNodeLabel } from "../data/labels.ts";
import { Graphic } from "./graphic.tsx";

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

export function Details({
  slot,
  node,
  hierarchy,
}: {
  slot?: string;
  node?: Hierarchy | Stratification;
  hierarchy?: Hierarchy | Stratification;
}) {
  // Normalize inputs: accept either a Hierarchy or a Stratification
  const resolvedHierarchy = hierarchy && "root" in hierarchy ? hierarchy.root : hierarchy as Hierarchy | undefined;
  const resolvedNode = node && "root" in node ? node.root : node as Hierarchy | undefined;

  function copyAllProperties() {
    if (!resolvedNode) return;
    const txt = JSON.stringify(resolvedNode.data ?? {}, null, 2);
    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      navigator.clipboard.writeText(txt).catch(() => {});
    }
  }

  function EntityRow({ n }: { n: Hierarchy }) {
    function activate() {
      const id = n.id;
      const ev = new CustomEvent("inspector-navigate", { detail: { id } });
      window.dispatchEvent(ev);
    }

    return (
      <button
        type="button"
        class="childRow clickable"
        onclick={() => activate()}
      >
        <div>{getNodeLabel(n)}</div>
        <div class="childType">{String(n.data?.type ?? "")}</div>
      </button>
    );
  }

  const properties = flattenNodeData(resolvedNode?.data);
  const parent = findParent(resolvedHierarchy, resolvedNode?.id);

  return (
    <div class="detailsContainer" slot={slot}>
      <sl-tab-group value="graph">
        <sl-tab slot="nav" panel="graph">
          Graph
        </sl-tab>
        <sl-tab slot="nav" panel="attributes">
          Attributes
        </sl-tab>

        <sl-tab-panel name="graph">
          <div class="tabPanel graphPanel">
            <Graphic hierarchy={resolvedHierarchy} />
          </div>
        </sl-tab-panel>

        <sl-tab-panel name="attributes">
          <div class="tabPanel attributesPanel">
            <div class="headerRow">
              <div>
                <div class="detailsHeading">
                  {resolvedNode ? getNodeLabel(resolvedNode) : "Attributes"}
                </div>
                <div class="mutedText">
                  {resolvedNode ? String(resolvedNode.data?.type ?? "") : ""}
                </div>
              </div>
              <div class="statusText">● {String(resolvedNode?.data?.status ?? "")}</div>
            </div>

            <div class="propertiesSection">
              <div class="propertiesHeader">
                <div class="detailsHeading">Properties</div>
                <div>
                  <button
                    type="button"
                    class="copyAll"
                    onclick={() => copyAllProperties()}
                  >
                    Copy all
                  </button>
                </div>
              </div>

              <div class="kvList">
                {properties.length === 0 ? (
                  <div class="mutedText">No properties</div>
                ) : (
                  properties.map((p) => (
                    <div key={p.k} class="kvRow">
                      <div class="propertyKey">{p.k}</div>
                      <div class="propertyValue">{String(p.v)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div class="parentSection">
              <div class="detailsHeading">Parent</div>
              {parent ? (
                <EntityRow n={parent} />
              ) : (
                <div class="mutedText">No parent</div>
              )}
            </div>

            <div class="childrenList">
              <div class="detailsHeading">Children</div>
              {resolvedNode?.children?.map((c) => (
                <EntityRow key={c.id} n={c} />
              ))}
            </div>
          </div>
        </sl-tab-panel>
      </sl-tab-group>
    </div>
  );
}
