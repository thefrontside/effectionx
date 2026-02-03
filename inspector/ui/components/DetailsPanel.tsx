import type { Hierarchy } from "../data/types";

import { Divider, Button, Heading, Content } from "@react-spectrum/s2";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };

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
      <div className={resolveClass(style({ padding: 12 }))}>
        <Heading level={4}>Attributes</Heading>
        <Content>Nothing selected</Content>
      </div>
    );
  }

  const properties: Array<{ k: string; v: string }> = flattenNodeData(
    node.data,
  );

  function resolveClass(
    c: string | ((props?: Record<string, any>) => string) | undefined,
  ) {
    if (!c) return undefined;
    return typeof c === "function" ? c() : c;
  }

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
    <div className={resolveClass(style({ padding: 12 }))}>
      <div
        className={resolveClass(
          style({
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }),
        )}
      >
        <div>
          <div
            className={resolveClass(
              style({ fontWeight: "medium", marginBottom: 8 }),
            )}
          >
            {getNodeLabel(node)}
          </div>
          <div
            className={resolveClass(
              style({
                color: "var(--spectrum-global-color-gray-600)",
              }),
            )}
          >
            {String(node.data?.type ?? "")}
          </div>
        </div>
        <div
          className={resolveClass(
            style({ color: "var(--spectrum-global-color-gray-600)" }),
          )}
        >
          ● {String(node.data?.status ?? "")}
        </div>
      </div>

      <Divider size="S" />

      <div className={resolveClass(style({ marginTop: 12 }))}>
        <div
          className={resolveClass(
            style({
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }),
          )}
        >
          <Heading level={5}>Properties</Heading>
          <div>
            <Button variant="secondary" onPress={copyAllProperties}>
              Copy all
            </Button>
          </div>
        </div>

        <div className={resolveClass(style({ marginTop: 8 }))}>
          <div
            className={resolveClass(
              style({
                border: "1px solid var(--spectrum-global-color-gray-200)",
                overflow: "hidden",
              }),
            )}
          >
            {properties.length === 0 ? (
              <div
                className={resolveClass(
                  style({ color: "var(--spectrum-global-color-gray-600)" }),
                )}
              >
                No properties
              </div>
            ) : (
              properties.map((p) => (
                <div
                  key={p.k}
                  className={resolveClass(
                    style({
                      display: "grid",
                      gridTemplateColumns: "220px 1fr",
                      gap: 8,
                      paddingBlock: 10,
                      paddingInline: 12,
                      borderBottom:
                        "1px solid var(--spectrum-global-color-gray-100)",
                    }),
                  )}
                >
                  <div
                    className={resolveClass(
                      style({ color: "var(--spectrum-global-color-gray-600)" }),
                    )}
                  >
                    {p.k}
                  </div>
                  <div
                    className={resolveClass(style({ wordBreak: "break-word" }))}
                  >
                    {String(p.v)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Divider size="S" />

      <div className={resolveClass(style({ marginTop: 12 }))}>
        <Heading level={5}>Parent</Heading>
        {(() => {
          const providedHierarchy = hierarchy as Hierarchy | undefined;
          const realParent = findParent(providedHierarchy, node.id);

          if (!realParent) return <div className="mutedText">No parent</div>;

          return <EntityRow node={realParent} />;
        })()}
      </div>

      <div className={resolveClass(style({ marginTop: 12 }))}>
        <Heading level={5}>Children</Heading>
        {node.children?.map((c: Hierarchy) => (
          <EntityRow key={c.id} node={c} />
        ))}
      </div>
    </div>
  );
}
