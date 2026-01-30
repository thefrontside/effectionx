import type { Hierarchy } from "../data/types";
import { getNodeLabel } from "../data/labels";
import { useNavigate } from "react-router";

export function EntityRow(props: {
  node: Hierarchy;
  onActivate?: (id: string) => void;
}) {
  const { node, onActivate } = props;
  const navigate = useNavigate();

  function activate() {
    const id = node.id;
    onActivate?.(id);
    const encoded = encodeURIComponent(id);
    const parts = window.location.pathname.split("/").filter(Boolean);
    const base = parts[0] ? `/${parts[0]}` : "";
    navigate(`${base}/${encoded}`);
  }

  return (
    <div
      className="childRow clickable"
      role="button"
      tabIndex={0}
      onClick={() => activate()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
    >
      <div>{getNodeLabel(node)}</div>
      <div className="childType">{String(node.data?.type ?? "")}</div>
    </div>
  );
}
