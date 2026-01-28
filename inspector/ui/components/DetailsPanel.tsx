import type { Hierarchy } from "../data/types";
import { Divider } from "@react-spectrum/s2";
import "./DetailsPanel.css";

export function DetailsPanel(props: { node?: Hierarchy | undefined }) {
  const { node } = props;

  if (!node) {
    return (
      <div className="detailsContainer">
        <div className="detailsHeading">Attributes</div>
        <div>Nothing selected</div>
      </div>
    );
  }

  const properties = Object.entries(node.data ?? {}).map(([k, v]) => ({
    k,
    v,
  }));

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
          <div className="detailsHeading">
            {String(node.data?.name ?? node.id)}
          </div>
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

      <div className="childrenList">
        <div className="detailsHeading">Children</div>
        {node.children?.map((c) => (
          <div key={c.id} className="childRow">
            <div>{String(c.data?.name ?? c.id)}</div>
            <div className="childType">{String(c.data?.type ?? "")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
