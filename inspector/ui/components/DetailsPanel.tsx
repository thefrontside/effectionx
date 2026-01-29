import type { Hierarchy } from "../data/types";
import { Divider } from "@react-spectrum/s2";
import "./DetailsPanel.css";
import { flattenNodeData } from "../utils/labels";
import { getNodeLabel } from "../data/labels";
import { findParent } from "../data/findParent";
import { EntityRow } from "./EntityRow";

export function DetailsPanel(props: {
  node?: Hierarchy | undefined;
  hierarchy?: Hierarchy | undefined;
}) {
  const { node, hierarchy } = props;

  if (!node) {
    return (
      <div className="detailsContainer">
        <div className="detailsHeading">Attributes</div>
        <div>Nothing selected</div>
      </div>
    );
  }

  const properties: Array<{ k: string; v: string }> = flattenNodeData(
    node.data,
  );

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

  return (
    <div className="detailsContainer">
      <div className="headerRow">
        <div>
          <div className="detailsHeading">{getNodeLabel(node)}</div>
          <div className="mutedText">{String(node.data?.type ?? "")}</div>
        </div>
        <div className="statusText">● {String(node.data?.status ?? "")}</div>
      </div>

      <Divider size="S" />

      <div className="propertiesSection">
        <div className="propertiesHeader">
          <div className="detailsHeading">Properties</div>
          <div>
            <button className="copyAll" onClick={copyAllProperties}>
              Copy all
            </button>
          </div>
        </div>

        <div className="kvList">
          {properties.length === 0 ? (
            <div className="mutedText">No properties</div>
          ) : (
            properties.map((p) => (
              <div key={p.k} className="kvRow">
                <div className="propertyKey">{p.k}</div>
                <div className="propertyValue">{String(p.v)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <Divider size="S" />

      <div className="parentSection">
        <div className="detailsHeading">Parent</div>
        {(() => {
          const providedHierarchy = hierarchy as Hierarchy | undefined;
          const realParent = findParent(providedHierarchy, node.id);

          if (!realParent) return <div className="mutedText">No parent</div>;

          return <EntityRow node={realParent} />;
        })()}
      </div>

      <div className="childrenList">
        <div className="detailsHeading">Children</div>
        {node.children?.map((c: Hierarchy) => (
          <EntityRow key={c.id} node={c} />
        ))}
      </div>
    </div>
  );
}
