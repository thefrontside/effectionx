import type { Hierarchy } from "../data/types";
import { getNodeLabel } from "../data/labels";

export function EntityRow(props: {
  node: Hierarchy;
  onActivate?: (id: string) => void;
}) {
  const { node, onActivate } = props;

  function activate() {
    const id = node.id;
    window.dispatchEvent(
      new CustomEvent("inspector:reveal-attributes", { detail: id }),
    );
    onActivate?.(id);
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
