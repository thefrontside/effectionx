import type { Hierarchy } from "../data/types";
import { getNodeLabel } from "../data/labels";
import { useNavigate } from "react-router";
import { childRowStyle, childTypeStyle } from "./entity-row-styles";

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
    <button
      type="button"
      className={childRowStyle({ variant: "clickable" })}
      onClick={() => activate()}
    >
      <div>{getNodeLabel(node)}</div>
      <div className={childTypeStyle}>{String(node.data?.type ?? "")}</div>
    </button>
  );
}
